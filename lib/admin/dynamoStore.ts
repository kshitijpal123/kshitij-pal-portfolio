import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  type QueryCommandInput,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  countUsedSeats,
  effectiveInvitationStatus,
  type Invitation,
  type SenderIdentity,
  type Session,
  type User,
} from "@/lib/admin/model";
import type { AdminStore } from "@/lib/admin/store";

/**
 * Single-table layout (partition key `pk`, sort key `sk`). Every collection
 * is one partition, which is fine at five users and keeps listing a Query.
 *
 * | pk           | sk          | Holds                                     |
 * | ------------ | ----------- | ----------------------------------------- |
 * | USER         | user id     | User                                      |
 * | USER_EMAIL   | email       | `userId`: unique email lock               |
 * | META         | OWNER       | `userId`: the single OWNER lock           |
 * | META         | SEATS       | `version`: optimistic lock for the limit  |
 * | INVITATION   | id          | Invitation                                |
 * | SESSION      | token hash  | Session, `expiresAtEpoch` (TTL)           |
 * | ATTEMPT      | key         | Failed-attempt window, `expiresAtEpoch`   |
 * | SENDER       | id          | SenderIdentity                            |
 * | SENDER_EMAIL | email       | `identityId`: one claimant per address    |
 *
 * Reads that decide authorization are strongly consistent.
 */
const keys = {
  user: (id: string) => ({ pk: "USER", sk: id }),
  userEmail: (email: string) => ({ pk: "USER_EMAIL", sk: email }),
  owner: { pk: "META", sk: "OWNER" },
  seats: { pk: "META", sk: "SEATS" },
  invitation: (id: string) => ({ pk: "INVITATION", sk: id }),
  session: (tokenHash: string) => ({ pk: "SESSION", sk: tokenHash }),
  attempt: (key: string) => ({ pk: "ATTEMPT", sk: key }),
  sender: (id: string) => ({ pk: "SENDER", sk: id }),
  senderEmail: (email: string) => ({ pk: "SENDER_EMAIL", sk: email }),
};

const notExists = "attribute_not_exists(pk)";

type Item = Record<string, unknown>;

function strip<T>(item: Item | undefined): T | null {
  if (!item) return null;
  const rest = { ...item };
  delete rest.pk;
  delete rest.sk;
  delete rest.expiresAtEpoch;
  return rest as T;
}

function epochSeconds(iso: string | number) {
  return Math.ceil(new Date(iso).getTime() / 1000);
}

function errorName(error: unknown) {
  return error instanceof Error ? error.name : "";
}

function isConditionFailure(error: unknown) {
  return errorName(error) === "ConditionalCheckFailedException";
}

/** For a cancelled transaction, which of its items failed a condition. */
function failedConditions(error: unknown): boolean[] | null {
  if (errorName(error) !== "TransactionCanceledException") return null;
  const reasons = (error as { CancellationReasons?: { Code?: string }[] })
    .CancellationReasons;
  return (reasons ?? []).map(
    (reason) => reason.Code === "ConditionalCheckFailed",
  );
}

export function createDocumentClient() {
  return DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  });
}

export function createDynamoStore(
  tableName: string,
  client: Pick<DynamoDBDocumentClient, "send"> = createDocumentClient(),
): AdminStore {
  const TableName = tableName;

  async function get<T>(key: Item) {
    const { Item } = await client.send(
      new GetCommand({ TableName, Key: key, ConsistentRead: true }),
    );
    return strip<T>(Item);
  }

  async function queryAll<T>(
    pk: string,
    filter?: Pick<
      QueryCommandInput,
      | "FilterExpression"
      | "ExpressionAttributeNames"
      | "ExpressionAttributeValues"
    >,
  ) {
    const items: T[] = [];
    let ExclusiveStartKey: Item | undefined;
    do {
      const page = await client.send(
        new QueryCommand({
          TableName,
          KeyConditionExpression: "pk = :pk",
          ConsistentRead: true,
          ExclusiveStartKey,
          ...filter,
          ExpressionAttributeValues: {
            ":pk": pk,
            ...filter?.ExpressionAttributeValues,
          },
        }),
      );
      for (const item of page.Items ?? []) {
        const value = strip<T>(item);
        if (value) items.push(value);
      }
      ExclusiveStartKey = page.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return items;
  }

  async function transact(
    items: NonNullable<
      ConstructorParameters<typeof TransactWriteCommand>[0]["TransactItems"]
    >,
  ) {
    await client.send(new TransactWriteCommand({ TransactItems: items }));
  }

  return {
    async ownerExists() {
      return (await get(keys.owner)) !== null;
    },

    async createOwner(user) {
      try {
        await transact([
          {
            Put: {
              TableName,
              Item: { ...keys.owner, userId: user.id },
              ConditionExpression: notExists,
            },
          },
          {
            Put: {
              TableName,
              Item: { ...keys.user(user.id), ...user },
              ConditionExpression: notExists,
            },
          },
          {
            Put: {
              TableName,
              Item: { ...keys.userEmail(user.email), userId: user.id },
              ConditionExpression: notExists,
            },
          },
        ]);
        return "created";
      } catch (error) {
        if (failedConditions(error)) return "owner-exists";
        throw error;
      }
    },

    getUserById(id) {
      return get<User>(keys.user(id));
    },

    async getUserByEmail(email) {
      const lock = await get<{ userId: string }>(keys.userEmail(email));
      return lock ? get<User>(keys.user(lock.userId)) : null;
    },

    listUsers() {
      return queryAll<User>("USER");
    },

    async recordLogin(userId, at) {
      try {
        await client.send(
          new UpdateCommand({
            TableName,
            Key: keys.user(userId),
            UpdateExpression: "SET lastLoginAt = :at",
            ConditionExpression: "attribute_exists(pk)",
            ExpressionAttributeValues: { ":at": at },
          }),
        );
      } catch (error) {
        if (!isConditionFailure(error)) throw error;
      }
    },

    async setUserStatus(userId, status, at) {
      const disabling = status === "DISABLED";
      try {
        await client.send(
          new UpdateCommand({
            TableName,
            Key: keys.user(userId),
            UpdateExpression: disabling
              ? "SET #status = :status, updatedAt = :at, sessionsValidAfter = :at"
              : "SET #status = :status, updatedAt = :at",
            ConditionExpression: "attribute_exists(pk) AND #role = :user",
            ExpressionAttributeNames: { "#status": "status", "#role": "role" },
            ExpressionAttributeValues: {
              ":status": status,
              ":at": at,
              ":user": "USER",
            },
          }),
        );
        return true;
      } catch (error) {
        if (isConditionFailure(error)) return false;
        throw error;
      }
    },

    listInvitations() {
      return queryAll<Invitation>("INVITATION");
    },

    async getInvitationByTokenHash(tokenHash) {
      const [invitation] = await queryAll<Invitation>("INVITATION", {
        FilterExpression: "tokenHash = :tokenHash",
        ExpressionAttributeValues: { ":tokenHash": tokenHash },
      });
      return invitation ?? null;
    },

    /*
     * Optimistic lock: read the seat version, count seats, then write the
     * invitation together with version + 1, conditional on the version being
     * unchanged. Two concurrent invitations cannot both claim the last seat.
     */
    async createInvitation(invitation, maxSeats, now) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const seats = await get<{ version: number }>(keys.seats);
        const version = seats?.version ?? 0;
        const [users, invitations] = await Promise.all([
          queryAll<User>("USER"),
          queryAll<Invitation>("INVITATION"),
        ]);

        if (users.some((user) => user.email === invitation.email)) {
          return "already-user";
        }
        if (
          invitations.some(
            (existing) =>
              existing.email === invitation.email &&
              effectiveInvitationStatus(existing, now) === "PENDING",
          )
        ) {
          return "already-invited";
        }
        if (countUsedSeats(users, invitations, now) >= maxSeats) {
          return "capacity-full";
        }

        try {
          await transact([
            {
              Put: {
                TableName,
                Item: { ...keys.invitation(invitation.id), ...invitation },
                ConditionExpression: notExists,
              },
            },
            {
              Put: {
                TableName,
                Item: { ...keys.seats, version: version + 1 },
                ConditionExpression: `${notExists} OR #version = :version`,
                ExpressionAttributeNames: { "#version": "version" },
                ExpressionAttributeValues: { ":version": version },
              },
            },
          ]);
          return "created";
        } catch (error) {
          if (!failedConditions(error)) throw error;
        }
      }
      throw new Error("Seat reservation kept conflicting.");
    },

    async acceptInvitation(invitationId, user, now) {
      const at = now.toISOString();
      try {
        await transact([
          {
            Update: {
              TableName,
              Key: keys.invitation(invitationId),
              UpdateExpression: "SET #status = :accepted, acceptedAt = :at",
              ConditionExpression: "#status = :pending AND expiresAt > :at",
              ExpressionAttributeNames: { "#status": "status" },
              ExpressionAttributeValues: {
                ":accepted": "ACCEPTED",
                ":pending": "PENDING",
                ":at": at,
              },
            },
          },
          {
            Put: {
              TableName,
              Item: { ...keys.user(user.id), ...user },
              ConditionExpression: notExists,
            },
          },
          {
            Put: {
              TableName,
              Item: { ...keys.userEmail(user.email), userId: user.id },
              ConditionExpression: notExists,
            },
          },
        ]);
        return "accepted";
      } catch (error) {
        const failed = failedConditions(error);
        if (!failed) throw error;
        return failed[0] ? "unavailable" : "email-taken";
      }
    },

    async revokeInvitation(invitationId, at) {
      try {
        await client.send(
          new UpdateCommand({
            TableName,
            Key: keys.invitation(invitationId),
            UpdateExpression: "SET #status = :revoked, revokedAt = :at",
            ConditionExpression: "#status = :pending",
            ExpressionAttributeNames: { "#status": "status" },
            ExpressionAttributeValues: {
              ":revoked": "REVOKED",
              ":pending": "PENDING",
              ":at": at,
            },
          }),
        );
        return true;
      } catch (error) {
        if (isConditionFailure(error)) return false;
        throw error;
      }
    },

    async createSession(session) {
      await client.send(
        new PutCommand({
          TableName,
          Item: {
            ...keys.session(session.tokenHash),
            ...session,
            expiresAtEpoch: epochSeconds(session.expiresAt),
          },
        }),
      );
    },

    getSession(tokenHash) {
      return get<Session>(keys.session(tokenHash));
    },

    async deleteSession(tokenHash) {
      await client.send(
        new DeleteCommand({ TableName, Key: keys.session(tokenHash) }),
      );
    },

    async getFailedAttempts(key, now, windowMs) {
      const entry = await get<{ count: number; windowStart: number }>(
        keys.attempt(key),
      );
      return entry && entry.windowStart > now.getTime() - windowMs
        ? entry.count
        : 0;
    },

    async recordFailedAttempt(key, now, windowMs) {
      const entry = await get<{ count: number; windowStart: number }>(
        keys.attempt(key),
      );
      if (!entry || entry.windowStart <= now.getTime() - windowMs) {
        await client.send(
          new PutCommand({
            TableName,
            Item: {
              ...keys.attempt(key),
              count: 1,
              windowStart: now.getTime(),
              expiresAtEpoch: epochSeconds(now.getTime() + windowMs),
            },
          }),
        );
        return 1;
      }
      try {
        const { Attributes } = await client.send(
          new UpdateCommand({
            TableName,
            Key: keys.attempt(key),
            UpdateExpression: "ADD #count :one",
            ConditionExpression: "windowStart = :windowStart",
            ExpressionAttributeNames: { "#count": "count" },
            ExpressionAttributeValues: {
              ":one": 1,
              ":windowStart": entry.windowStart,
            },
            ReturnValues: "UPDATED_NEW",
          }),
        );
        return Number(Attributes?.count ?? entry.count + 1);
      } catch (error) {
        if (isConditionFailure(error)) return 1;
        throw error;
      }
    },

    async clearFailedAttempts(key) {
      await client.send(
        new DeleteCommand({ TableName, Key: keys.attempt(key) }),
      );
    },

    async createSenderIdentity(identity) {
      try {
        await transact([
          {
            Put: {
              TableName,
              Item: { ...keys.sender(identity.id), ...identity },
              ConditionExpression: notExists,
            },
          },
          {
            Put: {
              TableName,
              Item: {
                ...keys.senderEmail(identity.email),
                identityId: identity.id,
              },
              ConditionExpression: notExists,
            },
          },
        ]);
        return true;
      } catch (error) {
        if (failedConditions(error)) return false;
        throw error;
      }
    },

    getSenderIdentity(id) {
      return get<SenderIdentity>(keys.sender(id));
    },

    listSenderIdentities() {
      return queryAll<SenderIdentity>("SENDER");
    },

    listSenderIdentitiesForUser(userId) {
      return queryAll<SenderIdentity>("SENDER", {
        FilterExpression: "userId = :userId",
        ExpressionAttributeValues: { ":userId": userId },
      });
    },

    async reviewSenderIdentity(id, review) {
      const identity = await get<SenderIdentity>(keys.sender(id));
      if (!identity) return false;

      const from = Object.fromEntries(
        review.from.map((status, index) => [`:from${index}`, status]),
      );
      const update = {
        TableName,
        Key: keys.sender(id),
        UpdateExpression:
          "SET #status = :to, reviewedAt = :at, reviewedBy = :by, rejectionReason = :reason",
        ConditionExpression: `attribute_exists(pk) AND #status IN (${Object.keys(from).join(", ")})`,
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ...from,
          ":to": review.to,
          ":at": review.reviewedAt,
          ":by": review.reviewedBy,
          ":reason": review.rejectionReason,
        },
      };

      try {
        if (review.to === "APPROVED") {
          await client.send(new UpdateCommand(update));
        } else {
          // Rejected and disabled identities release the address.
          await transact([
            { Update: update },
            {
              Delete: {
                TableName,
                Key: keys.senderEmail(identity.email),
                ConditionExpression: `${notExists} OR identityId = :id`,
                ExpressionAttributeValues: { ":id": id },
              },
            },
          ]);
        }
        return true;
      } catch (error) {
        if (isConditionFailure(error) || failedConditions(error)) return false;
        throw error;
      }
    },
  };
}
