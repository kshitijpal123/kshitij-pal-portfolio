// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { GmailSendResult } from "@/lib/admin/gmailApi";
import {
  isRetryable,
  planRetry,
  retryableFailureCodes,
  retryCode,
  retryFailedSends,
  retryNotice,
} from "@/lib/admin/retry";
import { executeScheduledOccurrence } from "@/lib/admin/scheduleExecution";
import { cancelSchedule, createSchedule } from "@/lib/admin/schedules";
import { reviewSenderIdentity } from "@/lib/admin/senderIdentities";
import { newOperationId, sendEmail, type SendDeps } from "@/lib/admin/sending";
import { defaultUserSettings, updateUserSettings } from "@/lib/admin/settings";
import { createLocalTokenCipher } from "@/lib/admin/tokenCipher";
import { setUserStatus } from "@/lib/admin/users";
import type { SendInput } from "@/lib/admin/validation";
import { now, seedOwner, seedUser } from "@/tests/helpers/admin";
import { createFakeGoogle } from "@/tests/helpers/gmail";
import { createFakeGmail, decodeRaw } from "@/tests/helpers/mail";
import { seedConnectedSender } from "@/tests/helpers/mail";
import {
  oneTimeInstant,
  scheduleInput,
  scheduleSetup,
} from "@/tests/helpers/schedule";

type Outcomes = Record<string, GmailSendResult>;

/** Gmail answers per recipient; anything not listed is accepted. */
function gmailFor(outcomes: { current: Outcomes }) {
  return createFakeGmail(({ index, raw }) => {
    const to = decodeRaw(raw).headers.To;
    return outcomes.current[to] ?? { ok: true, messageId: `m-${index}` };
  });
}

async function setup(initial: Outcomes = {}) {
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
  const outcomes = { current: initial };
  const gmail = gmailFor(outcomes);
  const deps: SendDeps = {
    store,
    google: createFakeGoogle().client,
    cipher,
    gmail: gmail.client,
    clock: () => now,
  };
  return { store, owner, alice, bob, sender, gmail, outcomes, deps };
}

type Context = Awaited<ReturnType<typeof setup>>;

const message = { subject: "Following up", body: "Hello again." };

async function send(context: Context, emails: string[]) {
  const input: SendInput = {
    operationId: newOperationId(now),
    senderIdentityId: context.sender.identity.id,
    contactIds: [],
    emails,
    templateId: null,
    ...message,
  };
  const outcome = await sendEmail(context.deps, context.alice, input, now);
  if (!outcome.ok) throw new Error(outcome.reason);
  return input.operationId;
}

const rateLimited: GmailSendResult = { ok: false, kind: "rate-limited" };

describe("retry eligibility", () => {
  it("retries only definite failures Gmail never accepted", () => {
    expect([...retryableFailureCodes].sort()).toEqual(
      [
        "gmail-auth-failed",
        "gmail-rate-limited",
        "gmail-unavailable",
        "not-attempted",
        "not-connected",
        "reauth-required",
      ].sort(),
    );
    expect(
      isRetryable({ status: "FAILED", failureCode: "gmail-rejected" }),
    ).toBe(false);
    expect(
      isRetryable({ status: "UNCERTAIN", failureCode: "gmail-unavailable" }),
    ).toBe(false);
    expect(isRetryable({ status: "SENT", failureCode: null })).toBe(false);
    expect(
      isRetryable({ status: "FAILED", failureCode: "gmail-rate-limited" }),
    ).toBe(true);
  });
});

describe("retryFailedSends", () => {
  it("sends again only to the failed recipients, through the same operation", async () => {
    const context = await setup({ "b@example.com": rateLimited });
    const operationId = await send(context, ["a@example.com", "b@example.com"]);
    expect(context.gmail.calls).toHaveLength(2);

    context.outcomes.current = {};
    const outcome = await retryFailedSends(
      context.deps,
      context.alice,
      { operationId, message },
      now,
    );

    expect(outcome).toMatchObject({ ok: true });
    expect(retryCode(outcome)).toBe("retried");
    expect(context.gmail.calls).toHaveLength(3);
    expect(decodeRaw(context.gmail.calls[2].raw).headers.To).toBe(
      "b@example.com",
    );
    const records = await context.store.listSendRecordsForOperation(
      context.alice.id,
      operationId,
    );
    expect(records.map((record) => record.status)).toEqual(["SENT", "SENT"]);

    expect(
      await retryFailedSends(
        context.deps,
        context.alice,
        { operationId, message },
        now,
      ),
    ).toEqual({ ok: false, reason: "nothing-to-retry" });
    expect(context.gmail.calls).toHaveLength(3);
  });

  it("never retries an uncertain or rejected send", async () => {
    const context = await setup({
      "u@example.com": { ok: false, kind: "uncertain" },
    });
    const uncertain = await send(context, ["u@example.com"]);
    context.outcomes.current = {
      "r@example.com": { ok: false, kind: "rejected" },
    };
    const rejected = await send(context, ["r@example.com"]);
    const calls = context.gmail.calls.length;

    expect(await planRetry(context.store, context.alice, uncertain)).toEqual({
      blocked: "uncertain",
    });
    expect(await planRetry(context.store, context.alice, rejected)).toEqual({
      blocked: "not-retryable",
    });
    for (const operationId of [uncertain, rejected]) {
      const outcome = await retryFailedSends(
        context.deps,
        context.alice,
        { operationId, message },
        now,
      );
      expect(outcome.ok).toBe(false);
    }
    expect(context.gmail.calls).toHaveLength(calls);
  });

  it("leaves uncertain recipients alone when retrying the rest of an operation", async () => {
    const context = await setup({
      "u@example.com": { ok: false, kind: "uncertain" },
      "f@example.com": rateLimited,
    });
    const operationId = await send(context, ["f@example.com", "u@example.com"]);
    context.outcomes.current = {};
    const outcome = await retryFailedSends(
      context.deps,
      context.alice,
      { operationId, message },
      now,
    );
    expect(retryCode(outcome)).toBe("partial");
    const retried = context.gmail.calls
      .slice(2)
      .map((call) => decodeRaw(call.raw).headers.To);
    expect(retried).toEqual(["f@example.com"]);
  });

  it("treats another user's operation as missing", async () => {
    const context = await setup({ "b@example.com": rateLimited });
    const operationId = await send(context, ["b@example.com"]);
    const calls = context.gmail.calls.length;

    expect(
      await retryFailedSends(
        context.deps,
        context.bob,
        { operationId, message },
        now,
      ),
    ).toEqual({ ok: false, reason: "not-found" });
    expect(
      await retryFailedSends(
        context.deps,
        context.alice,
        { operationId: "not-an-id", message },
        now,
      ),
    ).toEqual({ ok: false, reason: "not-found" });
    expect(context.gmail.calls).toHaveLength(calls);
  });

  it("needs the message again for an immediate send, whose body was not stored", async () => {
    const context = await setup({ "b@example.com": rateLimited });
    const operationId = await send(context, ["b@example.com"]);
    const plan = await planRetry(context.store, context.alice, operationId);
    expect(plan).toMatchObject({
      retryable: 1,
      source: { kind: "compose", subject: "Following up", body: "" },
    });
    expect(
      await retryFailedSends(
        context.deps,
        context.alice,
        { operationId, message: null },
        now,
      ),
    ).toEqual({ ok: false, reason: "message-required" });
  });

  it("checks the account, switches, and sender again", async () => {
    const context = await setup({ "b@example.com": rateLimited });
    const operationId = await send(context, ["b@example.com"]);
    context.outcomes.current = {};
    const retry = () =>
      retryFailedSends(
        context.deps,
        context.alice,
        { operationId, message },
        now,
      );

    await updateUserSettings(
      context.store,
      context.owner,
      context.alice.id,
      { ...defaultUserSettings, sendingEnabled: false },
      now,
    );
    expect(await retry()).toMatchObject({
      reason: "rejected",
      rejection: { reason: "sending-disabled" },
    });
    await updateUserSettings(
      context.store,
      context.owner,
      context.alice.id,
      defaultUserSettings,
      now,
    );

    await reviewSenderIdentity(
      context.store,
      context.owner,
      context.sender.identity.id,
      "disable",
      null,
      now,
    );
    expect(await retry()).toMatchObject({
      rejection: { reason: "sender-unavailable" },
    });

    await setUserStatus(
      context.store,
      context.owner,
      context.alice.id,
      "DISABLED",
      now,
    );
    expect(await retry()).toMatchObject({
      rejection: { reason: "user-inactive" },
    });
    expect(context.gmail.calls).toHaveLength(1);
  });

  it("is refused when today's limit has no room", async () => {
    const context = await setup({ "b@example.com": rateLimited });
    const operationId = await send(context, ["b@example.com"]);
    await updateUserSettings(
      context.store,
      context.owner,
      context.alice.id,
      { ...defaultUserSettings, dailyTotalEmails: 1 },
      now,
    );
    context.outcomes.current = {};
    await send(context, ["c@example.com"]);
    const outcome = await retryFailedSends(
      context.deps,
      context.alice,
      { operationId, message },
      now,
    );
    expect(outcome).toMatchObject({
      rejection: { reason: "daily-limit-reached" },
    });
    expect(retryNotice(retryCode(outcome))?.message).toContain("limit");
  });
});

describe("retrying a scheduled occurrence", () => {
  it("uses the schedule's stored message while it is active", async () => {
    const outcomes: { current: Outcomes } = {
      current: { "rahul@example.com": rateLimited },
    };
    const context = await scheduleSetup({ gmail: gmailFor(outcomes) });
    const created = await createSchedule(
      context.deps,
      context.alice,
      scheduleInput(context, {
        type: "RECURRING",
        recurrence: { frequency: "DAILY" },
      }),
      now,
    );
    if (!created.ok) throw new Error(created.reason);
    const schedule = created.schedule;
    const firstRun = schedule.nextRunAt!;
    await executeScheduledOccurrence(
      context.execution,
      {
        scheduleId: schedule.id,
        scheduledTime: firstRun.replace(".000", ""),
      },
      new Date(firstRun),
    );
    const [record] = await context.store.listRecentSendRecords(
      context.alice.id,
      5,
    );
    expect(record).toMatchObject({
      status: "FAILED",
      failureCode: "gmail-rate-limited",
      scheduleId: schedule.id,
    });

    const deps = { ...context.execution, clock: () => new Date(firstRun) };
    expect(
      await planRetry(context.store, context.alice, record.operationId),
    ).toMatchObject({ source: { kind: "schedule" } });

    outcomes.current = {};
    const outcome = await retryFailedSends(
      deps,
      context.alice,
      { operationId: record.operationId, message: null },
      new Date(firstRun),
    );
    expect(retryCode(outcome)).toBe("retried");
    const sent = context.gmail.messages().at(-1);
    expect(sent?.body).toContain("Thanks for your time.");
    expect(
      await planRetry(context.store, context.alice, record.operationId),
    ).toEqual({ blocked: "nothing-to-retry" });
  });

  it("cannot retry once the schedule is cancelled and its message cleared", async () => {
    const outcomes: { current: Outcomes } = {
      current: { "rahul@example.com": rateLimited },
    };
    const context = await scheduleSetup({ gmail: gmailFor(outcomes) });
    const created = await createSchedule(
      context.deps,
      context.alice,
      scheduleInput(context, {
        type: "RECURRING",
        recurrence: { frequency: "DAILY" },
      }),
      now,
    );
    if (!created.ok) throw new Error(created.reason);
    const firstRun = created.schedule.nextRunAt!;
    await executeScheduledOccurrence(
      context.execution,
      {
        scheduleId: created.schedule.id,
        scheduledTime: firstRun.replace(".000", ""),
      },
      new Date(firstRun),
    );
    await cancelSchedule(
      context.deps,
      context.alice,
      created.schedule.id,
      new Date(firstRun),
    );
    const [record] = await context.store.listRecentSendRecords(
      context.alice.id,
      5,
    );
    expect(
      await planRetry(context.store, context.alice, record.operationId),
    ).toEqual({ blocked: "schedule-ended" });
  });

  it("cannot retry a one-time occurrence after its schedule ended", async () => {
    const outcomes: { current: Outcomes } = {
      current: { "rahul@example.com": rateLimited },
    };
    const context = await scheduleSetup({ gmail: gmailFor(outcomes) });
    const created = await createSchedule(
      context.deps,
      context.alice,
      scheduleInput(context),
      now,
    );
    if (!created.ok) throw new Error(created.reason);
    await executeScheduledOccurrence(
      context.execution,
      {
        scheduleId: created.schedule.id,
        scheduledTime: oneTimeInstant.replace(".000", ""),
      },
      new Date(oneTimeInstant),
    );
    const [record] = await context.store.listRecentSendRecords(
      context.alice.id,
      5,
    );
    expect(record.status).toBe("FAILED");
    expect(
      await planRetry(context.store, context.alice, record.operationId),
    ).toEqual({ blocked: "schedule-ended" });
  });
});

describe("retry notices", () => {
  it("are fixed messages for known codes only", () => {
    expect(retryNotice("retried")?.status).toBe("success");
    expect(retryNotice("uncertain")?.message).toMatch(/never retried/);
    expect(retryNotice("constructor")).toBeNull();
    expect(retryNotice("<script>")).toBeNull();
    expect(retryNotice(undefined)).toBeNull();
  });
});
