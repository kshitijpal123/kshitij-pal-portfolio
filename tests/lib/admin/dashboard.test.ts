// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getDashboard, getOwnerDashboard } from "@/lib/admin/dashboard";
import type { GmailSendResult } from "@/lib/admin/gmailApi";
import { requestSenderIdentity } from "@/lib/admin/senderIdentities";
import { newOperationId, sendEmail, type SendDeps } from "@/lib/admin/sending";
import { defaultUserSettings, updateUserSettings } from "@/lib/admin/settings";
import { createLocalTokenCipher } from "@/lib/admin/tokenCipher";
import { now, seedOwner, seedUser } from "@/tests/helpers/admin";
import { createFakeGoogle } from "@/tests/helpers/gmail";
import { createFakeGmail, seedConnectedSender } from "@/tests/helpers/mail";

async function setup(results: GmailSendResult[] = []) {
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
  const gmail = createFakeGmail(
    ({ index }) => results[index] ?? { ok: true, messageId: `m${index}` },
  );
  const deps: SendDeps = {
    store,
    google: createFakeGoogle().client,
    cipher,
    gmail: gmail.client,
    clock: () => now,
  };
  return { store, owner, alice, bob, sender, deps };
}

describe("getDashboard", () => {
  it("summarizes the user's own usage, limits, senders, and sends", async () => {
    const context = await setup([
      { ok: true, messageId: "m0" },
      { ok: false, kind: "uncertain" },
    ]);
    await requestSenderIdentity(
      context.store,
      context.alice,
      "second@gmail.com",
      now,
    );
    for (const recipient of ["a@example.com", "b@example.com"]) {
      await sendEmail(
        context.deps,
        context.alice,
        {
          operationId: newOperationId(now),
          senderIdentityId: context.sender.identity.id,
          contactIds: [],
          emails: [recipient],
          templateId: null,
          subject: "Hi",
          body: "Hello",
        },
        now,
      );
    }

    const dashboard = await getDashboard(context.store, context.alice, now);
    expect(dashboard.usage).toEqual({ total: 2, bulk: 0 });
    expect(dashboard.remaining).toEqual({
      total: defaultUserSettings.dailyTotalEmails - 2,
      bulk: defaultUserSettings.dailyBulkRecipients,
    });
    expect(dashboard.senders).toEqual({ approved: 1, requested: 1 });
    expect(dashboard.recent).toHaveLength(2);
    expect(dashboard.attention.sends.map((record) => record.status)).toEqual([
      "UNCERTAIN",
    ]);

    const bobs = await getDashboard(context.store, context.bob, now);
    expect(bobs.recent).toEqual([]);
    expect(bobs.usage).toEqual({ total: 0, bulk: 0 });
    expect(bobs.gmailAccounts).toEqual([]);
  });
});

describe("getOwnerDashboard", () => {
  it("is for the OWNER only and holds counters and settings, not content", async () => {
    const context = await setup();
    await updateUserSettings(
      context.store,
      context.owner,
      context.bob.id,
      { ...defaultUserSettings, dailyTotalEmails: 7 },
      now,
    );
    await sendEmail(
      context.deps,
      context.alice,
      {
        operationId: newOperationId(now),
        senderIdentityId: context.sender.identity.id,
        contactIds: [],
        emails: ["secret-recipient@example.com"],
        templateId: null,
        subject: "Confidential subject",
        body: "Confidential body",
      },
      now,
    );

    expect(
      await getOwnerDashboard(context.store, context.alice, now),
    ).toBeNull();
    const overview = await getOwnerDashboard(context.store, context.owner, now);
    expect(overview).toMatchObject({ active: 3, disabled: 0 });
    const alice = overview?.accounts.find(
      (account) => account.user.id === context.alice.id,
    );
    expect(alice?.usage).toEqual({ total: 1, bulk: 0 });
    const bob = overview?.accounts.find(
      (account) => account.user.id === context.bob.id,
    );
    expect(bob?.settings.dailyTotalEmails).toBe(7);
    expect(JSON.stringify(overview)).not.toMatch(
      /secret-recipient|Confidential/,
    );
  });
});
