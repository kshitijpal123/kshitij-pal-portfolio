// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createContact, listOwnContacts } from "@/lib/admin/contacts";
import type { GmailSendResult } from "@/lib/admin/gmailApi";
import { GoogleOAuthError } from "@/lib/admin/googleOAuth";
import type { GmailConnection, PublicUser } from "@/lib/admin/model";
import { reviewSenderIdentity } from "@/lib/admin/senderIdentities";
import {
  newOperationId,
  sendDeadlineMs,
  sendEmail,
  type SendDeps,
} from "@/lib/admin/sending";
import {
  defaultUserSettings,
  getOwnSendingAllowance,
  updateUserSettings,
} from "@/lib/admin/settings";
import { createTemplate, listOwnTemplates } from "@/lib/admin/templates";
import { createLocalTokenCipher } from "@/lib/admin/tokenCipher";
import { setUserStatus } from "@/lib/admin/users";
import type { SendInput } from "@/lib/admin/validation";
import { later, now, seedOwner, seedUser } from "@/tests/helpers/admin";
import {
  accessToken,
  createFakeGoogle,
  refreshToken,
  seedApprovedIdentity,
} from "@/tests/helpers/gmail";
import {
  createFakeGmail,
  decodeHeader,
  seedConnectedSender,
} from "@/tests/helpers/mail";

type FakeGmail = ReturnType<typeof createFakeGmail>;

async function setup(
  options: {
    gmail?: FakeGmail;
    google?: ReturnType<typeof createFakeGoogle>["client"];
  } = {},
) {
  const { store, owner } = await seedOwner();
  const alice = (await seedUser(store, owner, "alice@example.com", "Alice"))
    .user;
  const bob = (await seedUser(store, owner, "bob@example.com", "Bob")).user;
  const cipher = createLocalTokenCipher();
  const sender = await seedConnectedSender(
    store,
    cipher,
    owner,
    alice,
    "alice@gmail.com",
  );
  const google = createFakeGoogle();
  const gmail = options.gmail ?? createFakeGmail();
  const deps: SendDeps = {
    store,
    google: options.google ?? google.client,
    cipher,
    gmail: gmail.client,
    clock: () => now,
  };
  return { store, owner, alice, bob, cipher, sender, google, gmail, deps };
}

type Context = Awaited<ReturnType<typeof setup>>;

function input(
  context: Context,
  overrides: Partial<SendInput> = {},
): SendInput {
  return {
    operationId: newOperationId(now),
    senderIdentityId: context.sender.identity.id,
    contactIds: [],
    emails: ["rahul@example.com"],
    templateId: null,
    subject: "Following up",
    body: "Hello,\n\nThanks for your time.",
    ...overrides,
  };
}

async function addContacts(
  context: Context,
  owner: PublicUser,
  people: { name: string; email: string; company?: string | null }[],
) {
  for (const person of people) {
    const outcome = await createContact(
      context.store,
      owner,
      {
        name: person.name,
        email: person.email,
        company: person.company ?? null,
        notes: null,
      },
      now,
    );
    if (outcome !== "saved") throw new Error(outcome);
  }
  const contacts = await listOwnContacts(context.store, owner);
  return people.map(
    (person) => contacts.find((contact) => contact.email === person.email)!.id,
  );
}

async function configure(
  context: Context,
  user: PublicUser,
  settings: Partial<typeof defaultUserSettings>,
) {
  await updateUserSettings(
    context.store,
    context.owner,
    user.id,
    { ...defaultUserSettings, ...settings },
    now,
  );
}

async function usage(context: Context, user: PublicUser = context.alice) {
  return (await getOwnSendingAllowance(context.store, user, now)).usage;
}

describe("individual send", () => {
  it("sends one Gmail message from the approved address and records it", async () => {
    const context = await setup();
    const request = input(context);
    const outcome = await sendEmail(context.deps, context.alice, request, now);

    expect(outcome).toEqual({
      ok: true,
      results: [
        { email: "rahul@example.com", status: "SENT", failureCode: null },
      ],
    });
    expect(context.gmail.calls).toHaveLength(1);
    expect(context.gmail.calls[0].accessToken).toBe(accessToken);
    const [message] = context.gmail.messages();
    expect(message.headers).toMatchObject({
      From: "alice@gmail.com",
      To: "rahul@example.com",
      Subject: "Following up",
    });
    expect(message.body).toBe("Hello,\r\n\r\nThanks for your time.");

    const [record] = await context.store.listSendRecordsForOperation(
      context.alice.id,
      request.operationId,
    );
    expect(record).toMatchObject({
      userId: context.alice.id,
      senderIdentityId: context.sender.identity.id,
      gmailConnectionId: context.sender.connection.id,
      senderEmail: "alice@gmail.com",
      recipient: "rahul@example.com",
      subject: "Following up",
      status: "SENT",
      bulk: false,
      gmailMessageId: "gmail-message-1",
      failureCode: null,
      attempts: 1,
      quotaDay: "2026-10-06",
    });
    expect(record).not.toHaveProperty("body");
    expect(await usage(context)).toEqual({ total: 1, bulk: 0 });
  });

  it("personalizes from a contact chosen by ID", async () => {
    const context = await setup();
    const [rahul] = await addContacts(context, context.alice, [
      { name: "Rahul", email: "rahul@example.com", company: "Acme" },
    ]);
    await sendEmail(
      context.deps,
      context.alice,
      input(context, {
        emails: [],
        contactIds: [rahul],
        subject: "{{name}} at {{company}}",
        body: "Hello {{name}},\n\nI wanted to follow up with you regarding our discussion.\n{{email}}",
      }),
      now,
    );
    const [message] = context.gmail.messages();
    expect(message.headers.Subject).toBe("Rahul at Acme");
    expect(message.body).toBe(
      "Hello Rahul,\r\n\r\nI wanted to follow up with you regarding our discussion.\r\nrahul@example.com",
    );
  });

  it("personalizes a typed address that matches one of the user's contacts", async () => {
    const context = await setup();
    await addContacts(context, context.alice, [
      { name: "Rahul", email: "rahul@example.com" },
    ]);
    await sendEmail(
      context.deps,
      context.alice,
      input(context, { emails: [" RAHUL@example.com "], body: "Hi {{name}}" }),
      now,
    );
    expect(context.gmail.messages()[0].body).toBe("Hi Rahul");
  });

  it("encodes a non-ASCII personalized subject", async () => {
    const context = await setup();
    const [asha] = await addContacts(context, context.alice, [
      { name: "आशा", email: "asha@example.com" },
    ]);
    await sendEmail(
      context.deps,
      context.alice,
      input(context, {
        emails: [],
        contactIds: [asha],
        subject: "नमस्ते {{name}}",
      }),
      now,
    );
    expect(decodeHeader(context.gmail.messages()[0].headers.Subject)).toBe(
      "नमस्ते आशा",
    );
  });

  it("records the template it used, only when it is the user's own", async () => {
    const context = await setup();
    await createTemplate(
      context.store,
      context.alice,
      { name: "T", subject: "S", body: "B" },
      now,
    );
    const [template] = await listOwnTemplates(context.store, context.alice);
    const request = input(context, { templateId: template.id });
    await sendEmail(context.deps, context.alice, request, now);
    const [record] = await context.store.listSendRecordsForOperation(
      context.alice.id,
      request.operationId,
    );
    expect(record.templateId).toBe(template.id);
  });
});

describe("authorization", () => {
  it("refuses a disabled user", async () => {
    const context = await setup();
    await setUserStatus(
      context.store,
      context.owner,
      context.alice.id,
      "DISABLED",
      now,
    );
    expect(
      await sendEmail(context.deps, context.alice, input(context), now),
    ).toEqual({ ok: false, reason: "user-inactive" });
    expect(context.gmail.calls).toHaveLength(0);
  });

  it("refuses another user's sender identity", async () => {
    const context = await setup();
    expect(
      await sendEmail(context.deps, context.bob, input(context), now),
    ).toEqual({ ok: false, reason: "sender-unavailable" });
    expect(context.gmail.calls).toHaveLength(0);
    expect(await usage(context, context.bob)).toEqual({ total: 0, bulk: 0 });
  });

  it("refuses another user's contact", async () => {
    const context = await setup();
    const [bobsContact] = await addContacts(context, context.bob, [
      { name: "Secret", email: "secret@example.com" },
    ]);
    expect(
      await sendEmail(
        context.deps,
        context.alice,
        input(context, { emails: [], contactIds: [bobsContact] }),
        now,
      ),
    ).toEqual({ ok: false, reason: "recipient-not-found" });
    expect(context.gmail.calls).toHaveLength(0);
  });

  it("refuses another user's template", async () => {
    const context = await setup();
    await createTemplate(
      context.store,
      context.bob,
      { name: "T", subject: "S", body: "B" },
      now,
    );
    const [template] = await listOwnTemplates(context.store, context.bob);
    expect(
      await sendEmail(
        context.deps,
        context.alice,
        input(context, { templateId: template.id }),
        now,
      ),
    ).toEqual({ ok: false, reason: "template-not-found" });
  });

  it("refuses a connection that belongs to another user", async () => {
    const context = await setup();
    await context.store.saveGmailConnection({
      ...context.sender.connection,
      userId: context.bob.id,
    });
    expect(
      await sendEmail(context.deps, context.alice, input(context), now),
    ).toEqual({ ok: false, reason: "not-connected" });
    expect(context.gmail.calls).toHaveLength(0);
  });

  it("refuses an identity whose own connection is missing, even if another is connected", async () => {
    const context = await setup();
    const other = await seedApprovedIdentity(
      context.store,
      context.owner,
      context.alice,
      "alice.work@gmail.com",
    );
    expect(
      await sendEmail(
        context.deps,
        context.alice,
        input(context, { senderIdentityId: other.id }),
        now,
      ),
    ).toEqual({ ok: false, reason: "not-connected" });
  });

  it("refuses a connection whose address differs from the identity's", async () => {
    const context = await setup();
    await context.store.saveGmailConnection({
      ...context.sender.connection,
      email: "someone-else@gmail.com",
    });
    expect(
      await sendEmail(context.deps, context.alice, input(context), now),
    ).toEqual({ ok: false, reason: "not-connected" });
  });

  it("requires the sender identity to still be APPROVED", async () => {
    const context = await setup();
    await reviewSenderIdentity(
      context.store,
      context.owner,
      context.sender.identity.id,
      "disable",
      null,
      now,
    );
    expect(
      await sendEmail(context.deps, context.alice, input(context), now),
    ).toEqual({ ok: false, reason: "sender-unavailable" });
    expect(context.gmail.calls).toHaveLength(0);
  });

  it("refuses an identity that was never approved", async () => {
    const context = await setup();
    const { requestSenderIdentity, listOwnSenderIdentities } =
      await import("@/lib/admin/senderIdentities");
    await requestSenderIdentity(
      context.store,
      context.alice,
      "pending@gmail.com",
      now,
    );
    const pending = (
      await listOwnSenderIdentities(context.store, context.alice)
    ).find((identity) => identity.status === "REQUESTED");
    expect(
      await sendEmail(
        context.deps,
        context.alice,
        input(context, { senderIdentityId: pending?.id ?? "" }),
        now,
      ),
    ).toEqual({ ok: false, reason: "sender-unavailable" });
  });

  it("requires a CONNECTED connection with the gmail.send scope", async () => {
    const context = await setup();
    const { connection } = context.sender;
    const cases: [Partial<GmailConnection>, string][] = [
      [{ status: "REAUTH_REQUIRED", credentials: null }, "reauth-required"],
      [{ status: "DISCONNECTED", credentials: null }, "not-connected"],
      [{ scopes: ["openid", "email"] }, "reauth-required"],
    ];
    for (const [change, reason] of cases) {
      await context.store.saveGmailConnection({ ...connection, ...change });
      expect(
        await sendEmail(context.deps, context.alice, input(context), now),
      ).toEqual({ ok: false, reason });
    }
    expect(context.gmail.calls).toHaveLength(0);
  });

  it("refuses when sending is turned off for the user", async () => {
    const context = await setup();
    await configure(context, context.alice, { sendingEnabled: false });
    expect(
      await sendEmail(context.deps, context.alice, input(context), now),
    ).toEqual({ ok: false, reason: "sending-disabled" });
  });

  it("refuses contacts and templates while turned off", async () => {
    const context = await setup();
    const [rahul] = await addContacts(context, context.alice, [
      { name: "Rahul", email: "rahul@example.com" },
    ]);
    await configure(context, context.alice, {
      contactsEnabled: false,
      templatesEnabled: false,
    });
    expect(
      await sendEmail(
        context.deps,
        context.alice,
        input(context, { emails: [], contactIds: [rahul] }),
        now,
      ),
    ).toEqual({ ok: false, reason: "contacts-disabled" });
    expect(
      await sendEmail(
        context.deps,
        context.alice,
        input(context, { templateId: "anything" }),
        now,
      ),
    ).toEqual({ ok: false, reason: "templates-disabled" });
  });
});

describe("recipients and message safety", () => {
  it("refuses invalid and header-injecting recipients before reserving", async () => {
    const context = await setup();
    for (const email of [
      "not-an-email",
      "a,b@example.com",
      "rahul@example.com\r\nBcc: evil@example.com",
      "Rahul <rahul@example.com>",
    ]) {
      const outcome = await sendEmail(
        context.deps,
        context.alice,
        input(context, { emails: [email] }),
        now,
      );
      expect(outcome, email).toMatchObject({
        ok: false,
        reason: "invalid-recipient",
      });
    }
    expect(context.gmail.calls).toHaveLength(0);
    expect(await usage(context)).toEqual({ total: 0, bulk: 0 });
  });

  it("refuses a subject that would add a header", async () => {
    const context = await setup();
    expect(
      await sendEmail(
        context.deps,
        context.alice,
        input(context, { subject: "Hi\r\nBcc: evil@example.com" }),
        now,
      ),
    ).toEqual({ ok: false, reason: "invalid-message" });

    // A contact name that somehow holds a line break cannot inject either.
    await context.store.createContact({
      id: "c-evil",
      userId: context.alice.id,
      name: "Eve\r\nBcc: evil@example.com",
      email: "eve@example.com",
      company: null,
      notes: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    expect(
      await sendEmail(
        context.deps,
        context.alice,
        input(context, {
          emails: [],
          contactIds: ["c-evil"],
          subject: "Hi {{name}}",
        }),
        now,
      ),
    ).toEqual({ ok: false, reason: "invalid-message" });
    expect(context.gmail.calls).toHaveLength(0);
  });

  it("always sends from the identity's own address", async () => {
    const context = await setup();
    await sendEmail(
      context.deps,
      context.alice,
      {
        ...input(context),
        from: "ceo@bank.example",
      } as SendInput,
      now,
    );
    const [message] = context.gmail.messages();
    expect(message.headers.From).toBe("alice@gmail.com");
    expect(message.mime).not.toContain("ceo@bank.example");
  });

  it("refuses an operation ID that is not the server's format", async () => {
    const context = await setup();
    expect(
      await sendEmail(
        context.deps,
        context.alice,
        input(context, { operationId: "../../USER" }),
        now,
      ),
    ).toEqual({ ok: false, reason: "invalid-message" });
  });

  it("refuses a request with no recipients", async () => {
    const context = await setup();
    expect(
      await sendEmail(
        context.deps,
        context.alice,
        input(context, { emails: [] }),
        now,
      ),
    ).toEqual({ ok: false, reason: "no-recipients" });
  });
});

describe("personalization", () => {
  it("refuses the whole send when any recipient lacks a value", async () => {
    const context = await setup();
    const ids = await addContacts(context, context.alice, [
      { name: "Rahul", email: "rahul@example.com", company: "Acme" },
      { name: "Asha", email: "asha@example.com", company: null },
    ]);
    const outcome = await sendEmail(
      context.deps,
      context.alice,
      input(context, {
        emails: [],
        contactIds: ids,
        body: "Hi {{name}} at {{company}}",
      }),
      now,
    );
    expect(outcome).toEqual({
      ok: false,
      reason: "unresolved-placeholder",
      problem: {
        kind: "missing",
        placeholder: "{{company}}",
        recipient: "asha@example.com",
      },
    });
    expect(context.gmail.calls).toHaveLength(0);
    expect(await usage(context)).toEqual({ total: 0, bulk: 0 });
  });

  it("cannot fill {{name}} for an address that is not a contact", async () => {
    const context = await setup();
    expect(
      await sendEmail(
        context.deps,
        context.alice,
        input(context, { subject: "Hi {{name}}" }),
        now,
      ),
    ).toMatchObject({
      ok: false,
      reason: "unresolved-placeholder",
      problem: { kind: "missing", placeholder: "{{name}}" },
    });
  });

  it("refuses unknown placeholders at send time", async () => {
    const context = await setup();
    expect(
      await sendEmail(
        context.deps,
        context.alice,
        input(context, { body: "Hi {{first_name}}" }),
        now,
      ),
    ).toMatchObject({
      ok: false,
      reason: "unresolved-placeholder",
      problem: { kind: "unknown" },
    });
  });
});

describe("bulk send", () => {
  it("sends one personalized message per recipient without exposing the others", async () => {
    const context = await setup();
    const people = [
      { name: "Rahul", email: "rahul@example.com", company: "Acme" },
      { name: "Asha", email: "asha@example.com", company: "Globex" },
      { name: "Ravi", email: "ravi@example.com", company: "Initech" },
    ];
    const ids = await addContacts(context, context.alice, people);
    const outcome = await sendEmail(
      context.deps,
      context.alice,
      input(context, {
        emails: [],
        contactIds: ids,
        subject: "Hello {{name}}",
        body: "Dear {{name}} of {{company}} ({{email}})",
      }),
      now,
    );

    expect(outcome).toMatchObject({
      ok: true,
      results: people.map((person) => ({
        email: person.email,
        status: "SENT",
      })),
    });
    const messages = context.gmail.messages();
    expect(messages).toHaveLength(3);
    for (const [index, person] of people.entries()) {
      const message = messages.find(
        (candidate) => candidate.headers.To === person.email,
      );
      expect(message?.headers.Subject).toBe(`Hello ${person.name}`);
      expect(message?.body).toBe(
        `Dear ${person.name} of ${person.company} (${person.email})`,
      );
      expect(message?.headers).not.toHaveProperty("Cc");
      expect(message?.headers).not.toHaveProperty("Bcc");
      for (const other of people.filter((_, i) => i !== index)) {
        expect(message?.mime).not.toContain(other.email);
        expect(message?.body).not.toContain(other.name);
      }
    }
    expect(await usage(context)).toEqual({ total: 3, bulk: 3 });
  });

  it("deduplicates recipients by normalized email before counting", async () => {
    const context = await setup();
    const [rahul] = await addContacts(context, context.alice, [
      { name: "Rahul", email: "rahul@example.com" },
    ]);
    const outcome = await sendEmail(
      context.deps,
      context.alice,
      input(context, {
        contactIds: [rahul],
        emails: ["RAHUL@example.com", "rahul@example.com "],
      }),
      now,
    );
    expect(outcome).toMatchObject({ ok: true, results: [{ status: "SENT" }] });
    expect(context.gmail.calls).toHaveLength(1);
    expect(await usage(context)).toEqual({ total: 1, bulk: 0 });
  });

  it("refuses more than one recipient while bulk sending is off", async () => {
    const context = await setup();
    await configure(context, context.alice, { bulkSendingEnabled: false });
    expect(
      await sendEmail(
        context.deps,
        context.alice,
        input(context, { emails: ["a@example.com", "b@example.com"] }),
        now,
      ),
    ).toEqual({ ok: false, reason: "bulk-disabled" });
    expect(
      await sendEmail(context.deps, context.alice, input(context), now),
    ).toMatchObject({ ok: true });
  });

  it("allows exactly the per-send maximum and refuses one more without sending any", async () => {
    const context = await setup();
    await configure(context, context.alice, {
      maxBulkRecipientsPerOperation: 3,
    });
    const addresses = (count: number) =>
      Array.from({ length: count }, (_, i) => `r${i}@example.com`);

    expect(
      await sendEmail(
        context.deps,
        context.alice,
        input(context, { emails: addresses(4) }),
        now,
      ),
    ).toEqual({
      ok: false,
      reason: "bulk-limit-exceeded",
      requested: 4,
      max: 3,
    });
    expect(context.gmail.calls).toHaveLength(0);
    expect(await usage(context)).toEqual({ total: 0, bulk: 0 });

    expect(
      await sendEmail(
        context.deps,
        context.alice,
        input(context, { emails: addresses(3) }),
        now,
      ),
    ).toMatchObject({ ok: true });
    expect(context.gmail.calls).toHaveLength(3);
  });
});

describe("daily limits", () => {
  it("allows exactly the daily total and refuses the next send", async () => {
    const context = await setup();
    await configure(context, context.alice, { dailyTotalEmails: 2 });
    for (let i = 0; i < 2; i++) {
      expect(
        await sendEmail(context.deps, context.alice, input(context), now),
      ).toMatchObject({ ok: true });
    }
    expect(
      await sendEmail(context.deps, context.alice, input(context), now),
    ).toEqual({
      ok: false,
      reason: "daily-limit-reached",
      requested: 1,
      used: 2,
      limit: 2,
    });
    expect(context.gmail.calls).toHaveLength(2);
  });

  it("refuses a bulk send that would pass the daily total, sending none", async () => {
    const context = await setup();
    await configure(context, context.alice, { dailyTotalEmails: 3 });
    await sendEmail(context.deps, context.alice, input(context), now);
    expect(
      await sendEmail(
        context.deps,
        context.alice,
        input(context, {
          emails: ["a@example.com", "b@example.com", "c@example.com"],
        }),
        now,
      ),
    ).toMatchObject({ ok: false, reason: "daily-limit-reached", used: 1 });
    expect(context.gmail.calls).toHaveLength(1);
  });

  it("enforces the daily bulk recipient limit separately from individual sends", async () => {
    const context = await setup();
    await configure(context, context.alice, { dailyBulkRecipients: 3 });
    const bulk = (prefix: string, count: number) =>
      input(context, {
        emails: Array.from(
          { length: count },
          (_, i) => `${prefix}${i}@example.com`,
        ),
      });
    expect(
      await sendEmail(context.deps, context.alice, bulk("a", 3), now),
    ).toMatchObject({ ok: true });
    expect(
      await sendEmail(context.deps, context.alice, bulk("b", 2), now),
    ).toEqual({
      ok: false,
      reason: "daily-bulk-limit-reached",
      requested: 2,
      used: 3,
      limit: 3,
    });
    expect(
      await sendEmail(context.deps, context.alice, input(context), now),
    ).toMatchObject({ ok: true });
    expect(await usage(context)).toEqual({ total: 4, bulk: 3 });
  });

  it("starts a new count on the next UTC day", async () => {
    const context = await setup();
    await configure(context, context.alice, { dailyTotalEmails: 1 });
    await sendEmail(context.deps, context.alice, input(context), now);
    const tomorrow = new Date("2026-10-07T00:00:01.000Z");
    expect(
      await sendEmail(
        { ...context.deps, clock: () => tomorrow },
        context.alice,
        input(context),
        tomorrow,
      ),
    ).toMatchObject({ ok: true });
  });

  it("never exceeds the limit under concurrent requests", async () => {
    const gmail = createFakeGmail(async ({ index }) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { ok: true, messageId: `m${index}` };
    });
    const context = await setup({ gmail });
    await configure(context, context.alice, { dailyTotalEmails: 3 });

    const outcomes = await Promise.all(
      Array.from({ length: 8 }, () =>
        sendEmail(context.deps, context.alice, input(context), now),
      ),
    );
    expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(3);
    expect(
      outcomes.filter(
        (outcome) => !outcome.ok && outcome.reason === "daily-limit-reached",
      ),
    ).toHaveLength(5);
    expect(gmail.calls).toHaveLength(3);
    expect(await usage(context)).toEqual({ total: 3, bulk: 0 });
  });

  it("gives a failed send's reservation back", async () => {
    let reject = true;
    const gmail = createFakeGmail(() =>
      reject ? { ok: false, kind: "rejected" } : { ok: true, messageId: "ok" },
    );
    const context = await setup({ gmail });
    await configure(context, context.alice, { dailyTotalEmails: 1 });

    expect(
      await sendEmail(context.deps, context.alice, input(context), now),
    ).toMatchObject({
      ok: true,
      results: [{ status: "FAILED", failureCode: "gmail-rejected" }],
    });
    expect(await usage(context)).toEqual({ total: 0, bulk: 0 });

    reject = false;
    expect(
      await sendEmail(context.deps, context.alice, input(context), now),
    ).toMatchObject({ ok: true, results: [{ status: "SENT" }] });
    expect(await usage(context)).toEqual({ total: 1, bulk: 0 });
  });

  it("keeps an uncertain send counted", async () => {
    const gmail = createFakeGmail(() => ({ ok: false, kind: "uncertain" }));
    const context = await setup({ gmail });
    expect(
      await sendEmail(context.deps, context.alice, input(context), now),
    ).toMatchObject({
      ok: true,
      results: [{ status: "UNCERTAIN", failureCode: "gmail-unavailable" }],
    });
    expect(await usage(context)).toEqual({ total: 1, bulk: 0 });
  });
});

describe("idempotency", () => {
  it("does not send twice when the same operation is submitted again", async () => {
    const context = await setup();
    const request = input(context);
    await sendEmail(context.deps, context.alice, request, now);
    expect(
      await sendEmail(context.deps, context.alice, request, later(5000)),
    ).toEqual({
      ok: true,
      results: [
        {
          email: "rahul@example.com",
          status: "ALREADY_SENT",
          failureCode: null,
        },
      ],
    });
    expect(context.gmail.calls).toHaveLength(1);
    expect(await usage(context)).toEqual({ total: 1, bulk: 0 });
  });

  it("sends once when duplicate submissions race (double-click)", async () => {
    const gmail = createFakeGmail(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { ok: true, messageId: "m" };
    });
    const context = await setup({ gmail });
    const request = input(context);
    const outcomes = await Promise.all([
      sendEmail(context.deps, context.alice, request, now),
      sendEmail(context.deps, context.alice, request, now),
      sendEmail(context.deps, context.alice, request, now),
    ]);
    expect(gmail.calls).toHaveLength(1);
    const statuses = outcomes.flatMap((outcome) =>
      outcome.ok ? outcome.results.map((result) => result.status) : [],
    );
    expect(statuses.filter((status) => status === "SENT")).toHaveLength(1);
    expect(await usage(context)).toEqual({ total: 1, bulk: 0 });
  });

  it("retries only the failed recipients of an operation", async () => {
    const gmail = createFakeGmail(({ raw, index }) =>
      Buffer.from(raw, "base64url").toString().includes("To: b@example.com") &&
      index < 3
        ? { ok: false, kind: "rejected" }
        : { ok: true, messageId: `m${index}` },
    );
    const context = await setup({ gmail });
    const request = input(context, {
      emails: ["a@example.com", "b@example.com", "c@example.com"],
    });
    expect(
      await sendEmail(context.deps, context.alice, request, now),
    ).toMatchObject({
      ok: true,
      results: [
        { email: "a@example.com", status: "SENT" },
        { email: "b@example.com", status: "FAILED" },
        { email: "c@example.com", status: "SENT" },
      ],
    });
    expect(await usage(context)).toEqual({ total: 2, bulk: 2 });

    expect(
      await sendEmail(context.deps, context.alice, request, later(1000)),
    ).toMatchObject({
      ok: true,
      results: [
        { email: "a@example.com", status: "ALREADY_SENT" },
        { email: "b@example.com", status: "SENT" },
        { email: "c@example.com", status: "ALREADY_SENT" },
      ],
    });
    expect(gmail.calls).toHaveLength(4);
    const records = await context.store.listSendRecordsForOperation(
      context.alice.id,
      request.operationId,
    );
    expect(records.find((r) => r.recipient === "b@example.com")).toMatchObject({
      status: "SENT",
      attempts: 2,
    });
    expect(await usage(context)).toEqual({ total: 3, bulk: 3 });
  });

  it("never resends an uncertain or still-reserved recipient", async () => {
    const gmail = createFakeGmail(() => ({ ok: false, kind: "uncertain" }));
    const context = await setup({ gmail });
    const request = input(context);
    await sendEmail(context.deps, context.alice, request, now);
    expect(
      await sendEmail(context.deps, context.alice, request, now),
    ).toMatchObject({ ok: true, results: [{ status: "UNCERTAIN" }] });
    expect(gmail.calls).toHaveLength(1);
  });

  it("keys operations per user, so another user's operation ID is independent", async () => {
    const context = await setup();
    const bobSender = await seedConnectedSender(
      context.store,
      context.cipher,
      context.owner,
      context.bob,
      "bob@gmail.com",
    );
    const request = input(context);
    await sendEmail(context.deps, context.alice, request, now);
    expect(
      await sendEmail(
        context.deps,
        context.bob,
        { ...request, senderIdentityId: bobSender.identity.id },
        now,
      ),
    ).toMatchObject({ ok: true, results: [{ status: "SENT" }] });
    expect(context.gmail.calls).toHaveLength(2);
  });
});

describe("Gmail failures", () => {
  it("marks the connection REAUTH_REQUIRED when Gmail refuses and the grant is gone", async () => {
    const google = createFakeGoogle();
    let refreshes = 0;
    const client = {
      ...google.client,
      async refresh(token: string) {
        refreshes += 1;
        if (refreshes > 1) throw new GoogleOAuthError("invalid_grant");
        return google.client.refresh(token);
      },
    };
    const gmail = createFakeGmail(() => ({ ok: false, kind: "auth" }));
    const context = await setup({ gmail, google: client });

    const outcome = await sendEmail(
      context.deps,
      context.alice,
      input(context, {
        emails: ["a@example.com", "b@example.com", "c@example.com"],
      }),
      now,
    );
    expect(outcome).toMatchObject({ ok: true });
    if (!outcome.ok) return;
    for (const result of outcome.results) {
      expect(result).toMatchObject({
        status: "FAILED",
        failureCode: expect.stringMatching(/reauth-required|gmail-auth-failed/),
      });
    }
    expect(
      outcome.results.some((r) => r.failureCode === "reauth-required"),
    ).toBe(true);
    // Concurrent workers may each have one request in flight; nothing is
    // retried after the refusal.
    expect(gmail.calls.length).toBeLessThanOrEqual(3);
    expect(refreshes).toBe(2);
    expect(
      await context.store.getGmailConnection(context.sender.identity.id),
    ).toMatchObject({ status: "REAUTH_REQUIRED", credentials: null });
    expect(await usage(context)).toEqual({ total: 0, bulk: 0 });

    expect(
      await sendEmail(context.deps, context.alice, input(context), now),
    ).toEqual({ ok: false, reason: "reauth-required" });
  });

  it("stops after an auth refusal without touching a connection Google still accepts", async () => {
    const gmail = createFakeGmail(() => ({ ok: false, kind: "auth" }));
    const context = await setup({ gmail });
    const outcome = await sendEmail(
      context.deps,
      context.alice,
      input(context),
      now,
    );
    expect(outcome).toMatchObject({
      ok: true,
      results: [{ status: "FAILED", failureCode: "gmail-auth-failed" }],
    });
    expect(
      (await context.store.getGmailConnection(context.sender.identity.id))
        ?.status,
    ).toBe("CONNECTED");
  });

  it("reports REAUTH_REQUIRED from the token refresh and releases the reservation", async () => {
    const google = createFakeGoogle({ refreshError: "invalid_grant" });
    const context = await setup({ google: google.client });
    expect(
      await sendEmail(context.deps, context.alice, input(context), now),
    ).toEqual({ ok: false, reason: "reauth-required" });
    expect(context.gmail.calls).toHaveLength(0);
    expect(
      await context.store.getGmailConnection(context.sender.identity.id),
    ).toMatchObject({ status: "REAUTH_REQUIRED", credentials: null });
    expect(await usage(context)).toEqual({ total: 0, bulk: 0 });
  });

  it("reports Google being unreachable without changing the connection", async () => {
    const google = createFakeGoogle({ refreshError: "unavailable" });
    const context = await setup({ google: google.client });
    expect(
      await sendEmail(context.deps, context.alice, input(context), now),
    ).toEqual({ ok: false, reason: "gmail-unavailable" });
    expect(
      (await context.store.getGmailConnection(context.sender.identity.id))
        ?.status,
    ).toBe("CONNECTED");
    expect(await usage(context)).toEqual({ total: 0, bulk: 0 });
  });

  it("stops a bulk send at Gmail's rate limit and releases the rest", async () => {
    const gmail = createFakeGmail(() => ({ ok: false, kind: "rate-limited" }));
    const context = await setup({ gmail });
    const outcome = await sendEmail(
      context.deps,
      context.alice,
      input(context, {
        emails: Array.from({ length: 8 }, (_, i) => `r${i}@example.com`),
      }),
      now,
    );
    expect(
      outcome.ok && outcome.results.every((r) => r.status === "FAILED"),
    ).toBe(true);
    expect(gmail.calls.length).toBeLessThanOrEqual(4);
    expect(await usage(context)).toEqual({ total: 0, bulk: 0 });
  });

  it("releases recipients not started before the deadline", async () => {
    let time = now.getTime();
    const gmail = createFakeGmail(({ index }) => {
      time += sendDeadlineMs;
      return { ok: true, messageId: `m${index}` } satisfies GmailSendResult;
    });
    const context = await setup({ gmail });
    const outcome = await sendEmail(
      { ...context.deps, clock: () => new Date(time) },
      context.alice,
      input(context, {
        emails: Array.from({ length: 6 }, (_, i) => `r${i}@example.com`),
      }),
      now,
    );
    if (!outcome.ok) throw new Error("expected results");
    const sent = outcome.results.filter((r) => r.status === "SENT").length;
    const skipped = outcome.results.filter(
      (r) => r.failureCode === "not-attempted",
    ).length;
    expect(sent).toBe(gmail.calls.length);
    expect(sent + skipped).toBe(6);
    expect(skipped).toBeGreaterThan(0);
    expect(await usage(context)).toEqual({ total: sent, bulk: sent });
  });

  it("never returns or stores tokens or message bodies", async () => {
    const context = await setup();
    const request = input(context, { body: "SECRET-BODY-TEXT" });
    const outcome = await sendEmail(context.deps, context.alice, request, now);
    const records = await context.store.listRecentSendRecords(
      context.alice.id,
      10,
    );
    const output = JSON.stringify({ outcome, records });
    expect(output).not.toContain(accessToken);
    expect(output).not.toContain(refreshToken);
    expect(output).not.toContain("SECRET-BODY-TEXT");
    expect(output).not.toMatch(/ciphertext|encryptedDataKey|ya29|1\/\//);
  });
});
