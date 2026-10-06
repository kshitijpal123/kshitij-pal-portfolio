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
  type Contact,
  countUsedSeats,
  type DailyUsage,
  effectiveInvitationStatus,
  type EmailTemplate,
  type GmailConnection,
  type Invitation,
  type OAuthState,
  type SendRecord,
  type SenderIdentity,
  type Session,
  type User,
  type UserSettings,
} from "@/lib/admin/model";
import type { AdminStore } from "@/lib/admin/store";

const dayMs = 24 * 60 * 60 * 1000;

/** Send records are kept for traceability for this long, then expire. */
export const sendRecordRetentionMs = 90 * dayMs;

/** Daily counters outlive their day briefly, so late releases still apply. */
const usageRetentionMs = 8 * dayMs;

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
 * | OAUTH_STATE  | state hash  | OAuthState, `expiresAtEpoch` (TTL)        |
 * | GMAIL        | identity id | GmailConnection (encrypted credentials)   |
 * | SETTINGS     | user id     | UserSettings                              |
 *
 * Mail data (M3) is partitioned per user, so the key itself scopes every
 * read and write to its owner:
 *
 * | pk                     | sk          | Holds                            |
 * | ---------------------- | ----------- | -------------------------------- |
 * | CONTACT#<userId>       | contact id  | Contact                          |
 * | CONTACT_EMAIL#<userId> | email       | `contactId`: unique per user     |
 * | TEMPLATE#<userId>      | template id | EmailTemplate                    |
 * | QUOTA#<userId>         | UTC day     | `total`, `bulk` counters (TTL)   |
 * | SEND#<userId>          | send id     | SendRecord, `expiresAtEpoch`     |
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
  oauthState: (stateHash: string) => ({ pk: "OAUTH_STATE", sk: stateHash }),
  gmail: (senderIdentityId: string) => ({ pk: "GMAIL", sk: senderIdentityId }),
  settings: (userId: string) => ({ pk: "SETTINGS", sk: userId }),
  contact: (userId: string, id: string) => ({
    pk: `CONTACT#${userId}`,
    sk: id,
  }),
  contactEmail: (userId: string, email: string) => ({
    pk: `CONTACT_EMAIL#${userId}`,
    sk: email,
  }),
  template: (userId: string, id: string) => ({
    pk: `TEMPLATE#${userId}`,
    sk: id,
  }),
  quota: (userId: string, day: string) => ({ pk: `QUOTA#${userId}`, sk: day }),
  send: (userId: string, id: string) => ({ pk: `SEND#${userId}`, sk: id }),
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

function counterNames(bulk: boolean): Record<string, string> {
  return bulk ? { "#total": "total", "#bulk": "bulk" } : { "#total": "total" };
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

  /** Send records of one user; with a `Limit`, only the first page. */
  async function querySends(
    userId: string,
    query: Pick<
      QueryCommandInput,
      | "KeyConditionExpression"
      | "ExpressionAttributeValues"
      | "ScanIndexForward"
      | "Limit"
    >,
  ) {
    const records: SendRecord[] = [];
    let ExclusiveStartKey: Item | undefined;
    do {
      const page = await client.send(
        new QueryCommand({
          TableName,
          ConsistentRead: true,
          ExclusiveStartKey,
          ...query,
          ExpressionAttributeValues: {
            ":pk": `SEND#${userId}`,
            ...query.ExpressionAttributeValues,
          },
        }),
      );
      for (const item of page.Items ?? []) {
        const record = strip<SendRecord>(item);
        if (record) records.push(record);
      }
      ExclusiveStartKey = query.Limit ? undefined : page.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return records;
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

    async createOAuthState(state) {
      await client.send(
        new PutCommand({
          TableName,
          Item: {
            ...keys.oauthState(state.stateHash),
            ...state,
            expiresAtEpoch: epochSeconds(state.expiresAt),
          },
          ConditionExpression: notExists,
        }),
      );
    },

    async takeOAuthState(stateHash) {
      const { Attributes } = await client.send(
        new DeleteCommand({
          TableName,
          Key: keys.oauthState(stateHash),
          ReturnValues: "ALL_OLD",
        }),
      );
      return strip<OAuthState>(Attributes);
    },

    getGmailConnection(senderIdentityId) {
      return get<GmailConnection>(keys.gmail(senderIdentityId));
    },

    listGmailConnectionsForUser(userId) {
      return queryAll<GmailConnection>("GMAIL", {
        FilterExpression: "userId = :userId",
        ExpressionAttributeValues: { ":userId": userId },
      });
    },

    async saveGmailConnection(connection) {
      await client.send(
        new PutCommand({
          TableName,
          Item: { ...keys.gmail(connection.senderIdentityId), ...connection },
        }),
      );
    },

    getUserSettings(userId) {
      return get<UserSettings>(keys.settings(userId));
    },

    async saveUserSettings(settings) {
      await client.send(
        new PutCommand({
          TableName,
          Item: { ...keys.settings(settings.userId), ...settings },
        }),
      );
    },

    listContacts(userId) {
      return queryAll<Contact>(`CONTACT#${userId}`);
    },

    getContact(userId, contactId) {
      return get<Contact>(keys.contact(userId, contactId));
    },

    async createContact(contact) {
      try {
        await transact([
          {
            Put: {
              TableName,
              Item: { ...keys.contact(contact.userId, contact.id), ...contact },
              ConditionExpression: notExists,
            },
          },
          {
            Put: {
              TableName,
              Item: {
                ...keys.contactEmail(contact.userId, contact.email),
                contactId: contact.id,
              },
              ConditionExpression: notExists,
            },
          },
        ]);
        return "saved";
      } catch (error) {
        if (failedConditions(error)) return "duplicate";
        throw error;
      }
    },

    async updateContact(contact, previousEmail) {
      const put = {
        Put: {
          TableName,
          Item: { ...keys.contact(contact.userId, contact.id), ...contact },
          ConditionExpression: "attribute_exists(pk) AND email = :previous",
          ExpressionAttributeValues: { ":previous": previousEmail },
        },
      };
      try {
        if (contact.email === previousEmail) {
          await transact([put]);
        } else {
          await transact([
            put,
            {
              Delete: {
                TableName,
                Key: keys.contactEmail(contact.userId, previousEmail),
                ConditionExpression: "contactId = :id",
                ExpressionAttributeValues: { ":id": contact.id },
              },
            },
            {
              Put: {
                TableName,
                Item: {
                  ...keys.contactEmail(contact.userId, contact.email),
                  contactId: contact.id,
                },
                ConditionExpression: notExists,
              },
            },
          ]);
        }
        return "saved";
      } catch (error) {
        const failed = failedConditions(error);
        if (!failed) throw error;
        return failed[2] && !failed[0] ? "duplicate" : "not-found";
      }
    },

    async deleteContact(userId, contactId, email) {
      try {
        await transact([
          {
            Delete: {
              TableName,
              Key: keys.contact(userId, contactId),
              ConditionExpression: "attribute_exists(pk) AND email = :email",
              ExpressionAttributeValues: { ":email": email },
            },
          },
          {
            Delete: {
              TableName,
              Key: keys.contactEmail(userId, email),
              ConditionExpression: `${notExists} OR contactId = :id`,
              ExpressionAttributeValues: { ":id": contactId },
            },
          },
        ]);
        return true;
      } catch (error) {
        if (failedConditions(error)) return false;
        throw error;
      }
    },

    listTemplates(userId) {
      return queryAll<EmailTemplate>(`TEMPLATE#${userId}`);
    },

    getTemplate(userId, templateId) {
      return get<EmailTemplate>(keys.template(userId, templateId));
    },

    async createTemplate(template) {
      await client.send(
        new PutCommand({
          TableName,
          Item: { ...keys.template(template.userId, template.id), ...template },
          ConditionExpression: notExists,
        }),
      );
    },

    async updateTemplate(template) {
      try {
        await client.send(
          new PutCommand({
            TableName,
            Item: {
              ...keys.template(template.userId, template.id),
              ...template,
            },
            ConditionExpression: "attribute_exists(pk)",
          }),
        );
        return true;
      } catch (error) {
        if (isConditionFailure(error)) return false;
        throw error;
      }
    },

    async deleteTemplate(userId, templateId) {
      const { Attributes } = await client.send(
        new DeleteCommand({
          TableName,
          Key: keys.template(userId, templateId),
          ReturnValues: "ALL_OLD",
        }),
      );
      return Attributes !== undefined;
    },

    async getDailyUsage(userId, day) {
      const counters = await get<Partial<DailyUsage>>(keys.quota(userId, day));
      return { total: counters?.total ?? 0, bulk: counters?.bulk ?? 0 };
    },

    /*
     * One transaction: the counter update is conditional on the limits
     * (`count <= limit - n`, so the result never exceeds the limit), each new
     * record on not existing, and each retried record on still being FAILED.
     * If any condition fails, nothing is written.
     */
    async reserveSends({ userId, day, bulk, limits, create, retry }) {
      const count = create.length + retry.length;
      const totalCeiling = limits.dailyTotalEmails - count;
      const bulkCeiling = limits.dailyBulkRecipients - count;
      if (count === 0) return "reserved";
      if (totalCeiling < 0 || (bulk && bulkCeiling < 0)) return "limit";

      const ttl = epochSeconds(
        Date.parse(`${day}T00:00:00.000Z`) + usageRetentionMs,
      );
      const counter = {
        Update: {
          TableName,
          Key: keys.quota(userId, day),
          UpdateExpression: bulk
            ? "SET expiresAtEpoch = :ttl ADD #total :count, #bulk :count"
            : "SET expiresAtEpoch = :ttl ADD #total :count",
          ConditionExpression: bulk
            ? "(attribute_not_exists(#total) OR #total <= :totalCeiling) AND (attribute_not_exists(#bulk) OR #bulk <= :bulkCeiling)"
            : "attribute_not_exists(#total) OR #total <= :totalCeiling",
          ExpressionAttributeNames: counterNames(bulk),
          ExpressionAttributeValues: {
            ":ttl": ttl,
            ":count": count,
            ":totalCeiling": totalCeiling,
            ...(bulk ? { ":bulkCeiling": bulkCeiling } : {}),
          },
        },
      };
      const item = (record: SendRecord) => ({
        ...keys.send(userId, record.id),
        ...record,
        expiresAtEpoch: epochSeconds(
          Date.parse(record.createdAt) + sendRecordRetentionMs,
        ),
      });

      try {
        await transact([
          counter,
          ...create.map((record) => ({
            Put: {
              TableName,
              Item: item(record),
              ConditionExpression: notExists,
            },
          })),
          ...retry.map((record) => ({
            Put: {
              TableName,
              Item: item(record),
              ConditionExpression: "#status = :failed",
              ExpressionAttributeNames: { "#status": "status" },
              ExpressionAttributeValues: { ":failed": "FAILED" },
            },
          })),
        ]);
        return "reserved";
      } catch (error) {
        const failed = failedConditions(error);
        if (!failed) throw error;
        return failed[0] ? "limit" : "conflict";
      }
    },

    async finishSend(record, completion) {
      const update = {
        TableName,
        Key: keys.send(record.userId, record.id),
        UpdateExpression:
          completion.status === "SENT"
            ? "SET #status = :status, gmailMessageId = :result, updatedAt = :at, completedAt = :at"
            : "SET #status = :status, failureCode = :result, updatedAt = :at, completedAt = :at",
        ConditionExpression: "#status = :reserved",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":status": completion.status,
          ":result":
            completion.status === "SENT"
              ? completion.gmailMessageId
              : completion.failureCode,
          ":at": completion.at,
          ":reserved": "RESERVED",
        },
      };
      try {
        if (completion.status === "FAILED") {
          // A failed send gives its reservation back in the same step.
          await transact([
            { Update: update },
            {
              Update: {
                TableName,
                Key: keys.quota(record.userId, record.quotaDay),
                UpdateExpression: record.bulk
                  ? "ADD #total :release, #bulk :release"
                  : "ADD #total :release",
                ExpressionAttributeNames: counterNames(record.bulk),
                ExpressionAttributeValues: { ":release": -1 },
              },
            },
          ]);
        } else {
          await client.send(new UpdateCommand(update));
        }
        return true;
      } catch (error) {
        if (isConditionFailure(error) || failedConditions(error)) return false;
        throw error;
      }
    },

    listSendRecordsForOperation(userId, operationId) {
      return querySends(userId, {
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :operation)",
        ExpressionAttributeValues: { ":operation": `${operationId}:` },
      });
    },

    listRecentSendRecords(userId, limit) {
      return querySends(userId, {
        KeyConditionExpression: "pk = :pk",
        ScanIndexForward: false,
        Limit: limit,
      });
    },
  };
}
