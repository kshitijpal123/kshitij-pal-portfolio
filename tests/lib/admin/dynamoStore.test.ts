// @vitest-environment node
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { describe, expect, it, vi } from "vitest";
import { createDynamoStore } from "@/lib/admin/dynamoStore";
import type { Invitation, User } from "@/lib/admin/model";

type Command = { input: Record<string, unknown> };

function client(handler: (command: Command) => unknown) {
  const send = vi.fn(async (command: Command) => handler(command));
  return { send: send as never, calls: () => send.mock.calls.map(([c]) => c) };
}

function conditionFailure() {
  return Object.assign(new Error("failed"), {
    name: "ConditionalCheckFailedException",
  });
}

function cancelled(...codes: string[]) {
  return Object.assign(new Error("cancelled"), {
    name: "TransactionCanceledException",
    CancellationReasons: codes.map((Code) => ({ Code })),
  });
}

const now = new Date("2026-10-06T09:00:00.000Z");

const user: User = {
  id: "u1",
  email: "friend@example.com",
  name: "Friend",
  passwordHash: "$argon2id$hash",
  role: "USER",
  status: "ACTIVE",
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
  lastLoginAt: null,
  sessionsValidAfter: null,
};

const invitation: Invitation = {
  id: "i1",
  email: "new@example.com",
  role: "USER",
  status: "PENDING",
  tokenHash: "hash",
  expiresAt: "2026-10-09T09:00:00.000Z",
  createdAt: now.toISOString(),
  acceptedAt: null,
  revokedAt: null,
  invitedBy: "owner",
};

describe("createDynamoStore", () => {
  it("creates the owner with lock items in one conditional transaction", async () => {
    const fake = client(() => ({}));
    const store = createDynamoStore("table", fake);
    expect(await store.createOwner({ ...user, role: "OWNER" })).toBe("created");

    const [command] = fake.calls();
    expect(command).toBeInstanceOf(TransactWriteCommand);
    const items = command.input.TransactItems as {
      Put: Record<string, unknown>;
    }[];
    expect(items.map((item) => item.Put.Item)).toEqual([
      { pk: "META", sk: "OWNER", userId: "u1" },
      expect.objectContaining({ pk: "USER", sk: "u1", role: "OWNER" }),
      { pk: "USER_EMAIL", sk: "friend@example.com", userId: "u1" },
    ]);
    for (const item of items) {
      expect(item.Put.ConditionExpression).toBe("attribute_not_exists(pk)");
    }
  });

  it("reports an existing owner when the transaction is cancelled", async () => {
    const store = createDynamoStore(
      "table",
      client(() => {
        throw cancelled("ConditionalCheckFailed", "None", "None");
      }),
    );
    expect(await store.createOwner({ ...user, role: "OWNER" })).toBe(
      "owner-exists",
    );
  });

  it("reads strongly consistently and strips key attributes", async () => {
    const fake = client((command) => {
      const key = command.input.Key as { pk: string };
      return key.pk === "USER_EMAIL"
        ? { Item: { pk: "USER_EMAIL", sk: user.email, userId: "u1" } }
        : { Item: { pk: "USER", sk: "u1", ...user } };
    });
    const store = createDynamoStore("table", fake);

    expect(await store.getUserByEmail(user.email)).toEqual(user);
    for (const command of fake.calls()) {
      expect(command).toBeInstanceOf(GetCommand);
      expect(command.input.ConsistentRead).toBe(true);
    }
  });

  it("guards the seat limit with a versioned write and retries a conflict", async () => {
    let transactions = 0;
    const fake = client((command) => {
      if (command instanceof GetCommand) return { Item: { version: 3 } };
      if (command instanceof QueryCommand) {
        const pk = (
          command.input.ExpressionAttributeValues as { ":pk": string }
        )[":pk"];
        return { Items: pk === "USER" ? [{ pk, sk: "u1", ...user }] : [] };
      }
      if (command instanceof TransactWriteCommand && transactions++ === 0) {
        throw cancelled("None", "ConditionalCheckFailed");
      }
      return {};
    });
    const store = createDynamoStore("table", fake);

    expect(await store.createInvitation(invitation, 5, now)).toBe("created");

    const writes = fake
      .calls()
      .filter((c) => c instanceof TransactWriteCommand);
    expect(writes).toHaveLength(2);
    const [, seats] = writes[1].input.TransactItems as {
      Put: Record<string, unknown>;
    }[];
    expect(seats.Put).toMatchObject({
      Item: { pk: "META", sk: "SEATS", version: 4 },
      ConditionExpression: "attribute_not_exists(pk) OR #version = :version",
      ExpressionAttributeValues: { ":version": 3 },
    });
  });

  it("refuses an invitation without writing when the seats are full", async () => {
    const users = Array.from({ length: 5 }, (_, index) => ({
      pk: "USER",
      sk: `u${index}`,
      ...user,
      id: `u${index}`,
      email: `${index}@example.com`,
    }));
    const fake = client((command) => {
      if (command instanceof GetCommand) return {};
      const pk = (command.input.ExpressionAttributeValues as { ":pk": string })[
        ":pk"
      ];
      return { Items: pk === "USER" ? users : [] };
    });
    const store = createDynamoStore("table", fake);

    expect(await store.createInvitation(invitation, 5, now)).toBe(
      "capacity-full",
    );
    expect(fake.calls().some((c) => c instanceof TransactWriteCommand)).toBe(
      false,
    );
  });

  it("accepts an invitation only while it is pending and unexpired", async () => {
    const fake = client(() => ({}));
    const store = createDynamoStore("table", fake);
    expect(await store.acceptInvitation("i1", user, now)).toBe("accepted");

    const [update] = fake.calls()[0].input.TransactItems as {
      Update: Record<string, unknown>;
    }[];
    expect(update.Update).toMatchObject({
      Key: { pk: "INVITATION", sk: "i1" },
      ConditionExpression: "#status = :pending AND expiresAt > :at",
      ExpressionAttributeValues: expect.objectContaining({
        ":at": now.toISOString(),
      }),
    });
  });

  it("maps a cancelled acceptance to its cause", async () => {
    const used = createDynamoStore(
      "table",
      client(() => {
        throw cancelled("ConditionalCheckFailed", "None", "None");
      }),
    );
    const duplicate = createDynamoStore(
      "table",
      client(() => {
        throw cancelled("None", "None", "ConditionalCheckFailed");
      }),
    );
    expect(await used.acceptInvitation("i1", user, now)).toBe("unavailable");
    expect(await duplicate.acceptInvitation("i1", user, now)).toBe(
      "email-taken",
    );
  });

  it("disables only USERs and revokes their sessions", async () => {
    const fake = client(() => ({}));
    const store = createDynamoStore("table", fake);
    expect(await store.setUserStatus("u1", "DISABLED", now.toISOString())).toBe(
      true,
    );

    const [command] = fake.calls();
    expect(command).toBeInstanceOf(UpdateCommand);
    expect(command.input).toMatchObject({
      UpdateExpression:
        "SET #status = :status, updatedAt = :at, sessionsValidAfter = :at",
      ConditionExpression: "attribute_exists(pk) AND #role = :user",
      ExpressionAttributeValues: { ":user": "USER", ":status": "DISABLED" },
    });

    const owner = createDynamoStore(
      "table",
      client(() => {
        throw conditionFailure();
      }),
    );
    expect(
      await owner.setUserStatus("owner", "DISABLED", now.toISOString()),
    ).toBe(false);
  });

  it("stores sessions with a TTL in epoch seconds", async () => {
    const fake = client(() => ({}));
    const store = createDynamoStore("table", fake);
    await store.createSession({
      tokenHash: "abc",
      userId: "u1",
      createdAt: now.toISOString(),
      expiresAt: "2026-10-13T09:00:00.000Z",
    });

    const [command] = fake.calls();
    expect(command).toBeInstanceOf(PutCommand);
    expect(command.input.Item).toMatchObject({
      pk: "SESSION",
      sk: "abc",
      expiresAtEpoch: Date.parse("2026-10-13T09:00:00.000Z") / 1000,
    });
  });

  it("releases the address lock when a request is rejected", async () => {
    const fake = client((command) =>
      command instanceof GetCommand
        ? {
            Item: {
              pk: "SENDER",
              sk: "s1",
              id: "s1",
              userId: "u1",
              email: "friend@gmail.com",
              status: "REQUESTED",
            },
          }
        : {},
    );
    const store = createDynamoStore("table", fake);

    expect(
      await store.reviewSenderIdentity("s1", {
        from: ["REQUESTED"],
        to: "REJECTED",
        reviewedBy: "owner",
        reviewedAt: now.toISOString(),
        rejectionReason: "No",
      }),
    ).toBe(true);

    const transaction = fake
      .calls()
      .find((c) => c instanceof TransactWriteCommand);
    const [update, release] = transaction?.input.TransactItems as Record<
      string,
      Record<string, unknown>
    >[];
    expect(update.Update.ConditionExpression).toBe(
      "attribute_exists(pk) AND #status IN (:from0)",
    );
    expect(release.Delete).toMatchObject({
      Key: { pk: "SENDER_EMAIL", sk: "friend@gmail.com" },
      ExpressionAttributeValues: { ":id": "s1" },
    });
  });

  it("rethrows unexpected errors", async () => {
    const store = createDynamoStore(
      "table",
      client(() => {
        throw Object.assign(new Error("boom"), {
          name: "ResourceNotFoundException",
        });
      }),
    );
    await expect(store.listUsers()).rejects.toThrow("boom");
  });
});
