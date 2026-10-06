// @vitest-environment node
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { describe, expect, it, vi } from "vitest";
import { createDynamoStore } from "@/lib/admin/dynamoStore";
import type {
  Contact,
  EmailTemplate,
  GmailConnection,
  Invitation,
  OAuthState,
  Schedule,
  ScheduleRun,
  SendRecord,
  User,
  UserSettings,
} from "@/lib/admin/model";

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

const oauthState: OAuthState = {
  stateHash: "state-hash",
  userId: "u1",
  sessionHash: "session-hash",
  senderIdentityId: "s1",
  codeVerifier: "verifier",
  nonce: "nonce",
  createdAt: now.toISOString(),
  expiresAt: "2026-10-06T09:10:00.000Z",
};

const connection: GmailConnection = {
  id: "g1",
  userId: "u1",
  senderIdentityId: "s1",
  provider: "GMAIL",
  email: "friend@gmail.com",
  providerAccountId: "sub",
  status: "CONNECTED",
  credentials: {
    version: 1,
    scheme: "kms",
    encryptedDataKey: "a2V5",
    iv: "aXY=",
    ciphertext: "Y3Q=",
    authTag: "dGFn",
  },
  scopes: ["https://www.googleapis.com/auth/gmail.send"],
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
  connectedAt: now.toISOString(),
  lastValidatedAt: now.toISOString(),
  disconnectedAt: null,
};

const contact: Contact = {
  id: "c1",
  userId: "u1",
  name: "Rahul",
  email: "rahul@example.com",
  company: null,
  notes: null,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
};

const template: EmailTemplate = {
  id: "t1",
  userId: "u1",
  name: "Hello",
  subject: "Hi {{name}}",
  body: "Hello {{name}}",
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
};

const operationId = "1791277200000.AAAAAAAAAAAAAAAAAAAAAA";

const sendRecord: SendRecord = {
  id: `${operationId}:a`,
  userId: "u1",
  operationId,
  senderIdentityId: "s1",
  gmailConnectionId: "g1",
  senderEmail: "friend@gmail.com",
  recipient: "rahul@example.com",
  subject: "Hi Rahul",
  templateId: null,
  bulk: true,
  quotaDay: "2026-10-06",
  status: "RESERVED",
  attempts: 1,
  gmailMessageId: null,
  failureCode: null,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
  completedAt: null,
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

  it("stores OAuth states once, with a TTL, under their hash", async () => {
    const fake = client(() => ({}));
    const store = createDynamoStore("table", fake);
    await store.createOAuthState(oauthState);

    const [command] = fake.calls();
    expect(command).toBeInstanceOf(PutCommand);
    expect(command.input).toMatchObject({
      Item: {
        pk: "OAUTH_STATE",
        sk: "state-hash",
        userId: "u1",
        expiresAtEpoch: Date.parse(oauthState.expiresAt) / 1000,
      },
      ConditionExpression: "attribute_not_exists(pk)",
    });
  });

  it("consumes an OAuth state with a single delete", async () => {
    const fake = client(() => ({
      Attributes: {
        pk: "OAUTH_STATE",
        sk: "state-hash",
        expiresAtEpoch: 1,
        ...oauthState,
      },
    }));
    const store = createDynamoStore("table", fake);

    expect(await store.takeOAuthState("state-hash")).toEqual(oauthState);
    const [command] = fake.calls();
    expect(command).toBeInstanceOf(DeleteCommand);
    expect(command.input).toMatchObject({
      Key: { pk: "OAUTH_STATE", sk: "state-hash" },
      ReturnValues: "ALL_OLD",
    });

    const empty = createDynamoStore(
      "table",
      client(() => ({})),
    );
    expect(await empty.takeOAuthState("used")).toBeNull();
  });

  it("keys Gmail connections by sender identity and lists them per user", async () => {
    const fake = client((command) =>
      command instanceof QueryCommand
        ? { Items: [{ pk: "GMAIL", sk: "s1", ...connection }] }
        : {},
    );
    const store = createDynamoStore("table", fake);

    await store.saveGmailConnection(connection);
    expect(await store.listGmailConnectionsForUser("u1")).toEqual([connection]);

    const [put, query] = fake.calls();
    expect(put).toBeInstanceOf(PutCommand);
    expect(put.input.Item).toMatchObject({
      pk: "GMAIL",
      sk: "s1",
      credentials: connection.credentials,
    });
    expect(query.input).toMatchObject({
      KeyConditionExpression: "pk = :pk",
      FilterExpression: "userId = :userId",
      ExpressionAttributeValues: { ":pk": "GMAIL", ":userId": "u1" },
      ConsistentRead: true,
    });
  });

  it("reads a Gmail connection strongly consistently", async () => {
    const fake = client(() => ({
      Item: { pk: "GMAIL", sk: "s1", ...connection },
    }));
    const store = createDynamoStore("table", fake);
    expect(await store.getGmailConnection("s1")).toEqual(connection);
    expect(fake.calls()[0].input).toMatchObject({
      Key: { pk: "GMAIL", sk: "s1" },
      ConsistentRead: true,
    });
  });

  it("stores settings per user and reads them back without keys", async () => {
    const settings: UserSettings = {
      userId: "u1",
      sendingEnabled: true,
      bulkSendingEnabled: false,
      templatesEnabled: true,
      contactsEnabled: true,
      dailyTotalEmails: 50,
      dailyBulkRecipients: 25,
      maxBulkRecipientsPerOperation: 10,
      maxScheduledEmails: 20,
      maxRecurringSchedules: 5,
      maxFutureSchedulingWindowDays: 30,
      updatedAt: now.toISOString(),
      updatedBy: "owner",
    };
    const fake = client((command) =>
      command instanceof GetCommand
        ? { Item: { pk: "SETTINGS", sk: "u1", ...settings } }
        : {},
    );
    const store = createDynamoStore("table", fake);
    await store.saveUserSettings(settings);
    expect(await store.getUserSettings("u1")).toEqual(settings);
    const [put, get] = fake.calls();
    expect(put.input.Item).toMatchObject({ pk: "SETTINGS", sk: "u1" });
    expect(get.input).toMatchObject({
      Key: { pk: "SETTINGS", sk: "u1" },
      ConsistentRead: true,
    });
  });

  it("creates a contact with its per-user email lock in one transaction", async () => {
    const fake = client(() => ({}));
    const store = createDynamoStore("table", fake);
    expect(await store.createContact(contact)).toBe("saved");

    const [command] = fake.calls();
    expect(command).toBeInstanceOf(TransactWriteCommand);
    const items = command.input.TransactItems as {
      Put: Record<string, unknown>;
    }[];
    expect(items.map((item) => item.Put.Item)).toEqual([
      expect.objectContaining({ pk: "CONTACT#u1", sk: "c1", userId: "u1" }),
      { pk: "CONTACT_EMAIL#u1", sk: "rahul@example.com", contactId: "c1" },
    ]);
    for (const item of items) {
      expect(item.Put.ConditionExpression).toBe("attribute_not_exists(pk)");
    }

    const duplicate = createDynamoStore(
      "table",
      client(() => {
        throw cancelled("None", "ConditionalCheckFailed");
      }),
    );
    expect(await duplicate.createContact(contact)).toBe("duplicate");
  });

  it("moves the email lock when a contact's email changes", async () => {
    const fake = client(() => ({}));
    const store = createDynamoStore("table", fake);
    const moved = { ...contact, email: "new@example.com" };
    expect(await store.updateContact(moved, contact.email)).toBe("saved");

    const items = fake.calls()[0].input.TransactItems as Record<
      string,
      Record<string, unknown>
    >[];
    expect(items[0].Put).toMatchObject({
      Item: expect.objectContaining({ pk: "CONTACT#u1", sk: "c1" }),
      ConditionExpression: "attribute_exists(pk) AND email = :previous",
      ExpressionAttributeValues: { ":previous": "rahul@example.com" },
    });
    expect(items[1].Delete).toMatchObject({
      Key: { pk: "CONTACT_EMAIL#u1", sk: "rahul@example.com" },
      ConditionExpression: "contactId = :id",
    });
    expect(items[2].Put).toMatchObject({
      Item: { pk: "CONTACT_EMAIL#u1", sk: "new@example.com", contactId: "c1" },
      ConditionExpression: "attribute_not_exists(pk)",
    });

    const taken = createDynamoStore(
      "table",
      client(() => {
        throw cancelled("None", "None", "ConditionalCheckFailed");
      }),
    );
    expect(await taken.updateContact(moved, contact.email)).toBe("duplicate");
    const gone = createDynamoStore(
      "table",
      client(() => {
        throw cancelled("ConditionalCheckFailed", "None", "None");
      }),
    );
    expect(await gone.updateContact(moved, contact.email)).toBe("not-found");
  });

  it("updates a contact without touching the lock when the email is unchanged", async () => {
    const fake = client(() => ({}));
    const store = createDynamoStore("table", fake);
    await store.updateContact({ ...contact, name: "R" }, contact.email);
    expect(fake.calls()[0].input.TransactItems).toHaveLength(1);
  });

  it("deletes a contact and its lock together", async () => {
    const fake = client(() => ({}));
    const store = createDynamoStore("table", fake);
    expect(await store.deleteContact("u1", "c1", contact.email)).toBe(true);
    const items = fake.calls()[0].input.TransactItems as Record<
      string,
      Record<string, unknown>
    >[];
    expect(items.map((item) => item.Delete.Key)).toEqual([
      { pk: "CONTACT#u1", sk: "c1" },
      { pk: "CONTACT_EMAIL#u1", sk: "rahul@example.com" },
    ]);

    const missing = createDynamoStore(
      "table",
      client(() => {
        throw cancelled("ConditionalCheckFailed", "None");
      }),
    );
    expect(await missing.deleteContact("u1", "c1", contact.email)).toBe(false);
  });

  it("partitions contacts and templates by user", async () => {
    const fake = client(() => ({ Items: [] }));
    const store = createDynamoStore("table", fake);
    await store.listContacts("u1");
    await store.listTemplates("u2");
    await store.getContact("u1", "c1");
    await store.getTemplate("u2", "t1");
    const [contacts, templates, getContact, getTemplate] = fake.calls();
    expect(contacts.input.ExpressionAttributeValues).toEqual({
      ":pk": "CONTACT#u1",
    });
    expect(templates.input.ExpressionAttributeValues).toEqual({
      ":pk": "TEMPLATE#u2",
    });
    expect(getContact.input.Key).toEqual({ pk: "CONTACT#u1", sk: "c1" });
    expect(getTemplate.input.Key).toEqual({ pk: "TEMPLATE#u2", sk: "t1" });
  });

  it("writes templates conditionally and reports a missing one", async () => {
    const fake = client(() => ({}));
    const store = createDynamoStore("table", fake);
    await store.createTemplate(template);
    expect(fake.calls()[0].input).toMatchObject({
      Item: expect.objectContaining({ pk: "TEMPLATE#u1", sk: "t1" }),
      ConditionExpression: "attribute_not_exists(pk)",
    });

    const missing = createDynamoStore(
      "table",
      client(() => {
        throw conditionFailure();
      }),
    );
    expect(await missing.updateTemplate(template)).toBe(false);
    expect(
      await createDynamoStore(
        "table",
        client(() => ({})),
      ).deleteTemplate("u1", "t1"),
    ).toBe(false);
  });

  it("reserves sends with a counter condition that never exceeds the limits", async () => {
    const fake = client(() => ({}));
    const store = createDynamoStore("table", fake);
    const retried = { ...sendRecord, id: `${operationId}:b` };
    expect(
      await store.reserveSends({
        userId: "u1",
        day: "2026-10-06",
        bulk: true,
        limits: { dailyTotalEmails: 50, dailyBulkRecipients: 25 },
        create: [sendRecord],
        retry: [retried],
      }),
    ).toBe("reserved");

    const items = fake.calls()[0].input.TransactItems as Record<
      string,
      Record<string, unknown>
    >[];
    expect(items[0].Update).toMatchObject({
      Key: { pk: "QUOTA#u1", sk: "2026-10-06" },
      UpdateExpression:
        "SET expiresAtEpoch = :ttl ADD #total :count, #bulk :count",
      ExpressionAttributeNames: { "#total": "total", "#bulk": "bulk" },
      ExpressionAttributeValues: {
        ":count": 2,
        ":totalCeiling": 48,
        ":bulkCeiling": 23,
        ":ttl": Date.parse("2026-10-14T00:00:00.000Z") / 1000,
      },
    });
    expect(items[0].Update.ConditionExpression).toContain(
      "#total <= :totalCeiling",
    );
    expect(items[1].Put).toMatchObject({
      Item: expect.objectContaining({
        pk: "SEND#u1",
        sk: sendRecord.id,
        expiresAtEpoch: Date.parse("2027-01-04T09:00:00.000Z") / 1000,
      }),
      ConditionExpression: "attribute_not_exists(pk)",
    });
    expect(items[2].Put).toMatchObject({
      ConditionExpression: "#status = :failed",
      ExpressionAttributeValues: { ":failed": "FAILED" },
    });
  });

  it("counts an individual send against the total limit only", async () => {
    const fake = client(() => ({}));
    const store = createDynamoStore("table", fake);
    await store.reserveSends({
      userId: "u1",
      day: "2026-10-06",
      bulk: false,
      limits: { dailyTotalEmails: 50, dailyBulkRecipients: 0 },
      create: [{ ...sendRecord, bulk: false }],
      retry: [],
    });
    const [item] = fake.calls()[0].input.TransactItems as Record<
      string,
      Record<string, unknown>
    >[];
    expect(item.Update.ExpressionAttributeNames).toEqual({ "#total": "total" });
    expect(item.Update.ConditionExpression).not.toContain("#bulk");
  });

  it("refuses a reservation larger than the limit without writing", async () => {
    const fake = client(() => ({}));
    const store = createDynamoStore("table", fake);
    expect(
      await store.reserveSends({
        userId: "u1",
        day: "2026-10-06",
        bulk: true,
        limits: { dailyTotalEmails: 50, dailyBulkRecipients: 1 },
        create: [sendRecord, { ...sendRecord, id: `${operationId}:b` }],
        retry: [],
      }),
    ).toBe("limit");
    expect(fake.calls()).toEqual([]);
  });

  it("maps a cancelled reservation to a limit or a record conflict", async () => {
    const request = {
      userId: "u1",
      day: "2026-10-06",
      bulk: false,
      limits: { dailyTotalEmails: 50, dailyBulkRecipients: 25 },
      create: [sendRecord],
      retry: [],
    };
    const limited = createDynamoStore(
      "table",
      client(() => {
        throw cancelled("ConditionalCheckFailed", "None");
      }),
    );
    expect(await limited.reserveSends(request)).toBe("limit");
    const conflicted = createDynamoStore(
      "table",
      client(() => {
        throw cancelled("None", "ConditionalCheckFailed");
      }),
    );
    expect(await conflicted.reserveSends(request)).toBe("conflict");
  });

  it("finishes a sent record only while it is still reserved", async () => {
    const fake = client(() => ({}));
    const store = createDynamoStore("table", fake);
    expect(
      await store.finishSend(sendRecord, {
        status: "SENT",
        gmailMessageId: "gm-1",
        at: now.toISOString(),
      }),
    ).toBe(true);
    const [command] = fake.calls();
    expect(command).toBeInstanceOf(UpdateCommand);
    expect(command.input).toMatchObject({
      Key: { pk: "SEND#u1", sk: sendRecord.id },
      ConditionExpression: "#status = :reserved",
      ExpressionAttributeValues: expect.objectContaining({
        ":status": "SENT",
        ":result": "gm-1",
      }),
    });

    const settled = createDynamoStore(
      "table",
      client(() => {
        throw conditionFailure();
      }),
    );
    expect(
      await settled.finishSend(sendRecord, {
        status: "UNCERTAIN",
        failureCode: "gmail-unavailable",
        at: now.toISOString(),
      }),
    ).toBe(false);
  });

  it("releases the reservation in the same transaction as a failure", async () => {
    const fake = client(() => ({}));
    const store = createDynamoStore("table", fake);
    await store.finishSend(sendRecord, {
      status: "FAILED",
      failureCode: "gmail-rejected",
      at: now.toISOString(),
    });
    const items = fake.calls()[0].input.TransactItems as Record<
      string,
      Record<string, unknown>
    >[];
    expect(items[0].Update).toMatchObject({
      Key: { pk: "SEND#u1", sk: sendRecord.id },
      ConditionExpression: "#status = :reserved",
    });
    expect(items[1].Update).toMatchObject({
      Key: { pk: "QUOTA#u1", sk: "2026-10-06" },
      UpdateExpression: "ADD #total :release, #bulk :release",
      ExpressionAttributeValues: { ":release": -1 },
    });
  });

  it("queries one operation by prefix and recent sends newest first", async () => {
    const page = () => ({
      Items: [
        {
          pk: "SEND#u1",
          sk: sendRecord.id,
          expiresAtEpoch: 1,
          ...sendRecord,
        },
      ],
      LastEvaluatedKey: { pk: "SEND#u1", sk: "next" },
    });
    const fake = client(page);
    const store = createDynamoStore("table", fake);
    expect(await store.listRecentSendRecords("u1", 20)).toEqual([sendRecord]);
    expect(fake.calls()[0].input).toMatchObject({
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": "SEND#u1" },
      ScanIndexForward: false,
      Limit: 20,
      ConsistentRead: true,
    });

    const paged = client((command) =>
      command.input.ExclusiveStartKey ? { Items: [] } : page(),
    );
    await createDynamoStore("table", paged).listSendRecordsForOperation(
      "u1",
      operationId,
    );
    const [first, second] = paged.calls();
    expect(first.input).toMatchObject({
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :operation)",
      ExpressionAttributeValues: {
        ":pk": "SEND#u1",
        ":operation": `${operationId}:`,
      },
    });
    expect(second.input.ExclusiveStartKey).toEqual({
      pk: "SEND#u1",
      sk: "next",
    });
  });

  it("reads zero usage for a day without counters", async () => {
    const fake = client(() => ({}));
    const store = createDynamoStore("table", fake);
    expect(await store.getDailyUsage("u1", "2026-10-06")).toEqual({
      total: 0,
      bulk: 0,
    });
    expect(fake.calls()[0].input.Key).toEqual({
      pk: "QUOTA#u1",
      sk: "2026-10-06",
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

describe("DynamoDB schedules", () => {
  const schedule: Schedule = {
    id: "sch1",
    userId: "u1",
    type: "RECURRING",
    status: "ACTIVE",
    senderIdentityId: "s1",
    senderEmail: "friend@gmail.com",
    contactIds: [],
    emails: ["rahul@example.com"],
    templateId: null,
    subject: "Hello",
    body: "Body",
    timeZone: "Asia/Kolkata",
    startLocal: "2026-10-07T10:00",
    startAt: "2026-10-07T04:30:00.000Z",
    endAt: null,
    recurrence: { frequency: "DAILY", time: "10:00" },
    nextRunAt: "2026-10-07T04:30:00.000Z",
    lastRunAt: null,
    lastRunStatus: null,
    lastRunFailure: null,
    runCount: 0,
    triggerName: "mail-sch1",
    failureCode: null,
    createdBy: "u1",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    cancelledAt: null,
    completedAt: null,
  };
  const run: ScheduleRun = {
    scheduleId: "sch1",
    userId: "u1",
    occurrence: "2026-10-07T10:00",
    scheduledFor: "2026-10-07T04:30:00.000Z",
    operationId: "1791347400000.abcdefghijklmnopqrstuv",
    status: "RESERVED",
    failureCode: null,
    sent: 0,
    failed: 0,
    uncertain: 0,
    createdAt: "2026-10-07T04:30:00.000Z",
    completedAt: null,
  };
  const limits = { maxScheduledEmails: 20, maxRecurringSchedules: 5 };
  type Transaction = {
    TransactItems: Record<string, Record<string, unknown>>[];
  };
  const items = (command: Command) =>
    (command.input as Transaction).TransactItems;

  it("creates a schedule, its owner pointer, and its count in one conditional transaction", async () => {
    const fake = client(() => ({}));
    const store = createDynamoStore("table", fake);
    expect(await store.createSchedule(schedule, limits)).toBe("created");
    const [command] = fake.calls();
    expect(command).toBeInstanceOf(TransactWriteCommand);
    const [counts, put, pointer] = items(command);
    expect(counts.Update).toMatchObject({
      Key: { pk: "SCHEDULE_COUNT", sk: "u1" },
      UpdateExpression: "ADD #active :one, #recurring :one",
      ExpressionAttributeValues: {
        ":one": 1,
        ":activeCeiling": 19,
        ":recurringCeiling": 4,
      },
    });
    expect(counts.Update.ConditionExpression).toContain(
      "#active <= :activeCeiling",
    );
    expect(counts.Update.ConditionExpression).toContain(
      "#recurring <= :recurringCeiling",
    );
    expect(put.Put).toMatchObject({
      Item: { pk: "SCHEDULE#u1", sk: "sch1", userId: "u1", status: "ACTIVE" },
      ConditionExpression: "attribute_not_exists(pk)",
    });
    expect(pointer.Put).toMatchObject({
      Item: { pk: "SCHEDULE_ID", sk: "sch1", userId: "u1" },
      ConditionExpression: "attribute_not_exists(pk)",
    });
  });

  it("reports the limit when the count condition fails, and never writes at a zero limit", async () => {
    const full = createDynamoStore(
      "table",
      client(() => {
        throw cancelled("ConditionalCheckFailed", "None", "None");
      }),
    );
    expect(await full.createSchedule(schedule, limits)).toBe("limit");

    const fake = client(() => ({}));
    const store = createDynamoStore("table", fake);
    expect(
      await store.createSchedule(schedule, {
        maxScheduledEmails: 20,
        maxRecurringSchedules: 0,
      }),
    ).toBe("limit");
    expect(fake.calls()).toHaveLength(0);
  });

  it("finds a schedule by ID only through its owner pointer", async () => {
    const fake = client((command) => {
      const key = command.input.Key as { pk: string };
      return key.pk === "SCHEDULE_ID"
        ? { Item: { pk: "SCHEDULE_ID", sk: "sch1", userId: "u1" } }
        : { Item: { pk: "SCHEDULE#u1", sk: "sch1", ...schedule } };
    });
    const store = createDynamoStore("table", fake);
    expect(await store.findSchedule("sch1")).toEqual(schedule);
    expect(fake.calls().map((call) => call.input.Key)).toEqual([
      { pk: "SCHEDULE_ID", sk: "sch1" },
      { pk: "SCHEDULE#u1", sk: "sch1" },
    ]);
    expect(fake.calls().every((call) => call instanceof GetCommand)).toBe(true);
  });

  it("ends only an ACTIVE schedule of the stored type, releasing its counts", async () => {
    const fake = client(() => ({}));
    const store = createDynamoStore("table", fake);
    expect(
      await store.endSchedule(schedule, {
        status: "CANCELLED",
        at: now.toISOString(),
        failureCode: null,
      }),
    ).toBe(true);
    const [update, counts, pointer] = items(fake.calls()[0]);
    expect(update.Update.ConditionExpression).toBe(
      "#cStatus = :cActive AND #cType = :cType",
    );
    expect(update.Update.ExpressionAttributeValues).toMatchObject({
      ":cActive": "ACTIVE",
      ":cType": "RECURRING",
    });
    expect(
      Object.values(update.Update.ExpressionAttributeNames as object),
    ).toEqual(
      expect.arrayContaining([
        "status",
        "body",
        "cancelledAt",
        "expiresAtEpoch",
      ]),
    );
    expect(
      Object.values(update.Update.ExpressionAttributeValues as object),
    ).toContain("");
    expect(counts.Update).toMatchObject({
      Key: { pk: "SCHEDULE_COUNT", sk: "u1" },
      ExpressionAttributeValues: { ":a0": -1, ":a1": -1 },
    });
    expect(pointer.Update.Key).toEqual({ pk: "SCHEDULE_ID", sk: "sch1" });

    const ended = createDynamoStore(
      "table",
      client(() => {
        throw cancelled("ConditionalCheckFailed", "None", "None");
      }),
    );
    expect(
      await ended.endSchedule(schedule, {
        status: "CANCELLED",
        at: now.toISOString(),
        failureCode: null,
      }),
    ).toBe(false);
  });

  it("claims an occurrence once, only while the schedule is ACTIVE", async () => {
    const fake = client(() => ({}));
    const store = createDynamoStore("table", fake);
    expect(await store.claimScheduleRun(run)).toBe("claimed");
    const [put, guard] = items(fake.calls()[0]);
    expect(put.Put).toMatchObject({
      Item: {
        pk: "SCHEDULE_RUN#u1",
        sk: "sch1#2026-10-07T10:00",
        status: "RESERVED",
      },
      ConditionExpression: "attribute_not_exists(pk)",
    });
    expect(
      typeof (put.Put.Item as { expiresAtEpoch: unknown }).expiresAtEpoch,
    ).toBe("number");
    expect(guard.Update).toMatchObject({
      Key: { pk: "SCHEDULE#u1", sk: "sch1" },
      ConditionExpression: "#cStatus = :cActive",
    });

    for (const [codes, outcome] of [
      [["ConditionalCheckFailed", "None"], "duplicate"],
      [["ConditionalCheckFailed", "ConditionalCheckFailed"], "duplicate"],
      [["None", "ConditionalCheckFailed"], "not-active"],
    ] as const) {
      const failing = createDynamoStore(
        "table",
        client(() => {
          throw cancelled(...codes);
        }),
      );
      expect(await failing.claimScheduleRun(run)).toBe(outcome);
    }
  });

  it("records a finished run and advances only an ACTIVE schedule", async () => {
    const fake = client(() => ({}));
    const store = createDynamoStore("table", fake);
    const completion = {
      status: "SENT" as const,
      failureCode: null,
      sent: 1,
      failed: 0,
      uncertain: 0,
      at: "2026-10-07T04:30:05.000Z",
    };
    await store.finishScheduleRun(schedule, run, completion, {
      kind: "next",
      nextRunAt: "2026-10-08T04:30:00.000Z",
    });
    const [runUpdate, scheduleUpdate] = items(fake.calls()[0]);
    expect(runUpdate.Update.ConditionExpression).toBe("#cStatus = :cReserved");
    expect(scheduleUpdate.Update.ConditionExpression).toBe(
      "#cStatus = :cActive",
    );
    expect(
      Object.values(scheduleUpdate.Update.ExpressionAttributeValues as object),
    ).toContain("2026-10-08T04:30:00.000Z");

    let call = 0;
    const raced = client(() => {
      call += 1;
      if (call === 1) throw cancelled("None", "ConditionalCheckFailed");
      return {};
    });
    await createDynamoStore("table", raced).finishScheduleRun(
      schedule,
      run,
      completion,
      { kind: "next", nextRunAt: "2026-10-08T04:30:00.000Z" },
    );
    const [, fallback] = items(raced.calls()[1]);
    expect(fallback.Update.ConditionExpression).toBe("attribute_exists(pk)");
    expect(
      Object.values(fallback.Update.ExpressionAttributeNames as object),
    ).not.toContain("status");
  });
});
