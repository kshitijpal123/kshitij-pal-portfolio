// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  createContact,
  deleteContact,
  listOwnContacts,
} from "@/lib/admin/contacts";
import type { Schedule } from "@/lib/admin/model";
import {
  executeScheduledOccurrence,
  failureCategory,
  occurrenceOperationId,
  parseTriggerPayload,
} from "@/lib/admin/scheduleExecution";
import { cancelSchedule, createSchedule } from "@/lib/admin/schedules";
import { reviewSenderIdentity } from "@/lib/admin/senderIdentities";
import { defaultUserSettings, updateUserSettings } from "@/lib/admin/settings";
import {
  createTemplate,
  deleteTemplate,
  listOwnTemplates,
} from "@/lib/admin/templates";
import { setUserStatus } from "@/lib/admin/users";
import { later } from "@/tests/helpers/admin";
import { createFakeGmail, decodeRaw } from "@/tests/helpers/mail";
import {
  dailyInput,
  now,
  oneTimeInstant,
  type ScheduleContext,
  scheduleInput,
  scheduleSetup,
} from "@/tests/helpers/schedule";

const minute = 60_000;

async function scheduled(
  context: ScheduleContext,
  input = scheduleInput(context),
) {
  const outcome = await createSchedule(context.deps, context.alice, input, now);
  if (!outcome.ok) throw new Error(outcome.reason);
  return outcome.schedule;
}

function event(schedule: Pick<Schedule, "id">, scheduledTime: string) {
  return {
    scheduleId: schedule.id,
    scheduledTime: new Date(scheduledTime).toISOString().replace(".000", ""),
  };
}

function run(
  context: ScheduleContext,
  schedule: Schedule,
  scheduledTime = oneTimeInstant,
  invokedAt = new Date(scheduledTime),
) {
  return executeScheduledOccurrence(
    { ...context.execution, clock: () => invokedAt },
    event(schedule, scheduledTime),
    invokedAt,
  );
}

async function stored(context: ScheduleContext, schedule: Schedule) {
  const current = await context.store.getSchedule(
    context.alice.id,
    schedule.id,
  );
  if (!current) throw new Error("missing");
  return current;
}

async function setLimits(
  context: ScheduleContext,
  limits: Partial<typeof defaultUserSettings>,
) {
  await updateUserSettings(
    context.store,
    context.owner,
    context.alice.id,
    { ...defaultUserSettings, ...limits },
    now,
  );
}

describe("scheduled execution", () => {
  it("sends a due one-time schedule through M3 as its owner, then completes it", async () => {
    const context = await scheduleSetup();
    const schedule = await scheduled(context);
    expect(await run(context, schedule)).toEqual({
      outcome: "SENT",
      failureCode: null,
    });

    expect(context.gmail.calls).toHaveLength(1);
    const message = decodeRaw(context.gmail.calls[0].raw);
    expect(message.headers.From).toContain("alice@gmail.com");
    expect(message.headers.To).toBe("rahul@example.com");
    expect(message.body).toBe("Hello,\r\n\r\nThanks for your time.");

    const [record] = await context.store.listRecentSendRecords(
      context.alice.id,
      10,
    );
    expect(record).toMatchObject({
      userId: context.alice.id,
      status: "SENT",
      scheduleId: schedule.id,
      recipient: "rahul@example.com",
    });
    expect(await stored(context, schedule)).toMatchObject({
      status: "COMPLETED",
      runCount: 1,
      lastRunStatus: "SENT",
      nextRunAt: null,
      body: "",
    });
    expect(
      await context.store.getScheduleRun(
        context.alice.id,
        schedule.id,
        schedule.startLocal,
      ),
    ).toMatchObject({ status: "SENT", sent: 1 });
    expect(await context.store.getScheduleCounts(context.alice.id)).toEqual({
      active: 0,
      recurring: 0,
    });
  });

  it("counts scheduled sends against the owner's daily quota", async () => {
    const context = await scheduleSetup();
    const schedule = await scheduled(context);
    await run(context, schedule);
    expect(
      await context.store.getDailyUsage(context.alice.id, "2026-10-12"),
    ).toMatchObject({ total: 1 });
  });

  it("never sends an occurrence twice, however often or concurrently it is invoked", async () => {
    const context = await scheduleSetup();
    const schedule = await scheduled(context);
    const results = await Promise.all(
      Array.from({ length: 4 }, () => run(context, schedule)),
    );
    expect(results.filter((r) => r.outcome === "SENT")).toHaveLength(1);
    expect(results.filter((r) => r.outcome === "duplicate")).toHaveLength(3);
    expect(await run(context, schedule)).toMatchObject({
      outcome: "not-active",
    });
    expect(context.gmail.calls).toHaveLength(1);
  });

  it("uses a deterministic M3 operation ID per occurrence", async () => {
    const context = await scheduleSetup();
    const schedule = await scheduled(context);
    const id = occurrenceOperationId(schedule, schedule.startLocal);
    expect(id).toMatch(/^\d{13}\.[A-Za-z0-9_-]{22}$/);
    expect(id.startsWith(String(Date.parse(oneTimeInstant)))).toBe(true);
    expect(occurrenceOperationId(schedule, schedule.startLocal)).toBe(id);
    expect(occurrenceOperationId(schedule, "2026-10-13T10:00")).not.toBe(id);
  });
});

describe("trigger payload trust", () => {
  it("accepts exactly the schedule ID and scheduled time", () => {
    const valid = {
      scheduleId: "8c5d2f9e-1b0a-4c3d-9e8f-7a6b5c4d3e2f",
      scheduledTime: "2026-10-12T04:30:00Z",
    };
    expect(parseTriggerPayload(valid)).toEqual(valid);
    for (const forged of [
      null,
      "string",
      [valid],
      { ...valid, recipient: "attacker@example.com" },
      { ...valid, emails: ["attacker@example.com"] },
      { ...valid, body: "phish" },
      { ...valid, userId: "someone" },
      { ...valid, senderIdentityId: "x" },
      { scheduleId: valid.scheduleId },
      { ...valid, scheduleId: "SCHEDULE#user/1" },
      { ...valid, scheduleId: "8C5D2F9E-1B0A-4C3D-9E8F-7A6B5C4D3E2F" },
      { ...valid, scheduledTime: "2026-10-12 04:30" },
      { ...valid, scheduledTime: "<aws.scheduler.scheduled-time>" },
      { ...valid, scheduledTime: 1760243400000 },
    ]) {
      expect(parseTriggerPayload(forged), JSON.stringify(forged)).toBeNull();
    }
  });

  it("ignores recipients, content, or a user carried by the event", async () => {
    const context = await scheduleSetup();
    const schedule = await scheduled(context);
    const result = await executeScheduledOccurrence(
      context.execution,
      {
        ...event(schedule, oneTimeInstant),
        emails: ["attacker@example.com"],
        userId: context.bob.id,
      },
      new Date(oneTimeInstant),
    );
    expect(result).toEqual({ outcome: "invalid-event" });
    expect(context.gmail.calls).toHaveLength(0);
    expect(await stored(context, schedule)).toMatchObject({ status: "ACTIVE" });
  });

  it("removes the trigger of a schedule that does not exist and sends nothing", async () => {
    const context = await scheduleSetup();
    const missing = { id: "00000000-0000-4000-8000-000000000000" };
    expect(
      await executeScheduledOccurrence(
        context.execution,
        event(missing, oneTimeInstant),
        new Date(oneTimeInstant),
      ),
    ).toEqual({ outcome: "not-found" });
    expect(context.triggers.removed).toEqual([`mail-${missing.id}`]);
    expect(context.gmail.calls).toHaveLength(0);
  });

  it("refuses a time that is not an occurrence, or is not due yet", async () => {
    const context = await scheduleSetup();
    const schedule = await scheduled(context);
    const instant = Date.parse(oneTimeInstant);
    expect(
      await run(
        context,
        schedule,
        new Date(instant + 5 * minute).toISOString(),
      ),
    ).toEqual({ outcome: "invalid-occurrence" });
    expect(
      await executeScheduledOccurrence(
        context.execution,
        event(schedule, oneTimeInstant),
        new Date(instant - 5 * minute),
      ),
    ).toEqual({ outcome: "not-due" });
    expect(context.gmail.calls).toHaveLength(0);
    expect(await stored(context, schedule)).toMatchObject({
      status: "ACTIVE",
      runCount: 0,
    });
  });

  it("never sends with a sender the stored owner does not hold", async () => {
    const context = await scheduleSetup();
    const tampered: Schedule = {
      ...(await scheduled(context)),
      id: "11111111-2222-4333-8444-555555555555",
      senderIdentityId: context.bobSender.identity.id,
      triggerName: "mail-11111111-2222-4333-8444-555555555555",
    };
    await context.store.createSchedule(tampered, defaultUserSettings);
    expect(await run(context, tampered)).toEqual({
      outcome: "FAILED",
      failureCode: "sender-unavailable",
    });
    expect(context.gmail.calls).toHaveLength(0);
  });
});

describe("re-validation at execution", () => {
  async function failsWith(
    change: (context: ScheduleContext) => Promise<unknown>,
    failureCode: string,
  ) {
    const context = await scheduleSetup();
    const schedule = await scheduled(context);
    await change(context);
    expect(await run(context, schedule)).toEqual({
      outcome: "FAILED",
      failureCode,
    });
    expect(context.gmail.calls).toHaveLength(0);
    expect(await stored(context, schedule)).toMatchObject({
      status: "FAILED",
      lastRunStatus: "FAILED",
      lastRunFailure: failureCode,
    });
  }

  it("stops when the owner is disabled", () =>
    failsWith(
      (context) =>
        setUserStatus(
          context.store,
          context.owner,
          context.alice.id,
          "DISABLED",
          now,
        ),
      "user-inactive",
    ));

  it("stops when sending is turned off", () =>
    failsWith(
      (context) => setLimits(context, { sendingEnabled: false }),
      "sending-disabled",
    ));

  it("stops when the sender identity is disabled", () =>
    failsWith(
      (context) =>
        reviewSenderIdentity(
          context.store,
          context.owner,
          context.sender.identity.id,
          "disable",
          null,
          now,
        ),
      "sender-unavailable",
    ));

  it("stops when Gmail needs reconnecting", () =>
    failsWith(async (context) => {
      await context.store.saveGmailConnection({
        ...context.sender.connection,
        status: "REAUTH_REQUIRED",
        credentials: null,
      });
    }, "reauth-required"));

  it("stops when the daily limit is used up", () =>
    failsWith(
      (context) => setLimits(context, { dailyTotalEmails: 0 }),
      "daily-limit-reached",
    ));

  it("stops when the template was deleted", async () => {
    const context = await scheduleSetup();
    await createTemplate(
      context.store,
      context.alice,
      { name: "Follow-up", subject: "Hi", body: "Hi" },
      now,
    );
    const [template] = await listOwnTemplates(context.store, context.alice);
    const schedule = await scheduled(
      context,
      scheduleInput(context, { templateId: template.id }),
    );
    await deleteTemplate(context.store, context.alice, template.id);
    expect(await run(context, schedule)).toEqual({
      outcome: "FAILED",
      failureCode: "template-not-found",
    });
    expect(context.gmail.calls).toHaveLength(0);
  });

  it("stops when the OWNER turns templates off", async () => {
    const context = await scheduleSetup();
    await createTemplate(
      context.store,
      context.alice,
      { name: "Follow-up", subject: "Hi", body: "Hi" },
      now,
    );
    const [template] = await listOwnTemplates(context.store, context.alice);
    const schedule = await scheduled(
      context,
      scheduleInput(context, { templateId: template.id }),
    );
    await setLimits(context, { templatesEnabled: false });
    expect(await run(context, schedule)).toEqual({
      outcome: "FAILED",
      failureCode: "templates-disabled",
    });
    expect(context.gmail.calls).toHaveLength(0);
  });

  it("stops when a chosen contact was deleted, and uses current contact details otherwise", async () => {
    const context = await scheduleSetup();
    await createContact(
      context.store,
      context.alice,
      { name: "Rahul", email: "rahul@example.com", company: null, notes: null },
      now,
    );
    const [contact] = await listOwnContacts(context.store, context.alice);
    const schedule = await scheduled(
      context,
      scheduleInput(context, {
        contactIds: [contact.id],
        emails: [],
        subject: "Hi {{name}}",
      }),
    );
    await deleteContact(context.store, context.alice, contact.id);
    expect(await run(context, schedule)).toEqual({
      outcome: "FAILED",
      failureCode: "recipient-not-found",
    });
    expect(context.gmail.calls).toHaveLength(0);
  });
});

describe("failure policy", () => {
  it("records a missed occurrence instead of sending late", async () => {
    const context = await scheduleSetup();
    const schedule = await scheduled(context);
    expect(
      await run(
        context,
        schedule,
        oneTimeInstant,
        later(61 * minute, new Date(oneTimeInstant)),
      ),
    ).toEqual({ outcome: "FAILED", failureCode: "missed" });
    expect(context.gmail.calls).toHaveLength(0);
    expect(failureCategory("FAILED", "missed")).toBe("VALIDATION");
  });

  it("does not retry an occurrence Gmail rejected", async () => {
    const gmail = createFakeGmail(() => ({ ok: false, kind: "rejected" }));
    const context = await scheduleSetup({ gmail });
    const schedule = await scheduled(context);
    expect(await run(context, schedule)).toEqual({
      outcome: "FAILED",
      failureCode: "gmail-rejected",
    });
    expect(await run(context, schedule)).toMatchObject({
      outcome: "not-active",
    });
    expect(gmail.calls).toHaveLength(1);
    expect(failureCategory("FAILED", "gmail-rejected")).toBe("REJECTED");
  });

  it("never resends an occurrence whose outcome is uncertain", async () => {
    const gmail = createFakeGmail(() => ({ ok: false, kind: "uncertain" }));
    const context = await scheduleSetup({ gmail });
    const schedule = await scheduled(context, dailyInput(context));
    const first = "2026-10-07T04:30:00.000Z";
    expect(await run(context, schedule, first)).toEqual({
      outcome: "UNCERTAIN",
      failureCode: "gmail-unavailable",
    });
    expect(await run(context, schedule, first)).toEqual({
      outcome: "duplicate",
      previous: "UNCERTAIN",
    });
    expect(gmail.calls).toHaveLength(1);
    expect(await stored(context, schedule)).toMatchObject({
      status: "ACTIVE",
      lastRunStatus: "UNCERTAIN",
      nextRunAt: "2026-10-08T04:30:00.000Z",
    });
    expect(failureCategory("UNCERTAIN", "gmail-unavailable")).toBe("UNCERTAIN");
  });

  it("records an unexpected error during sending as uncertain, never retried", async () => {
    const context = await scheduleSetup();
    const schedule = await scheduled(context);
    const failing = {
      ...context.execution,
      store: {
        ...context.store,
        async reserveSends() {
          throw new Error("ProvisionedThroughputExceededException");
        },
      },
    };
    const instant = new Date(oneTimeInstant);
    expect(
      await executeScheduledOccurrence(
        failing,
        event(schedule, oneTimeInstant),
        instant,
      ),
    ).toEqual({ outcome: "UNCERTAIN", failureCode: "interrupted" });
    expect(context.gmail.calls).toHaveLength(0);
    expect(await stored(context, schedule)).toMatchObject({
      status: "FAILED",
      lastRunStatus: "UNCERTAIN",
      lastRunFailure: "interrupted",
    });
    expect(await run(context, schedule)).toMatchObject({
      outcome: "not-active",
    });
    expect(context.gmail.calls).toHaveLength(0);
    expect(failureCategory("UNCERTAIN", "interrupted")).toBe("UNCERTAIN");
  });
});

describe("recurring schedules", () => {
  const first = "2026-10-07T04:30:00.000Z";
  const second = "2026-10-08T04:30:00.000Z";

  it("advances along its own timeline, even after a late run", async () => {
    const context = await scheduleSetup();
    const schedule = await scheduled(context, dailyInput(context));
    expect(
      await run(context, schedule, first, later(20 * minute, new Date(first))),
    ).toMatchObject({ outcome: "SENT" });
    expect(await stored(context, schedule)).toMatchObject({
      status: "ACTIVE",
      runCount: 1,
      nextRunAt: second,
    });
    expect(await run(context, schedule, second)).toMatchObject({
      outcome: "SENT",
    });
    expect(context.gmail.calls).toHaveLength(2);
    expect(await stored(context, schedule)).toMatchObject({
      runCount: 2,
      nextRunAt: "2026-10-09T04:30:00.000Z",
    });
  });

  it("does not backfill occurrences it never ran", async () => {
    const context = await scheduleSetup();
    const schedule = await scheduled(context, dailyInput(context));
    const fourth = "2026-10-10T04:30:00.000Z";
    expect(await run(context, schedule, fourth)).toMatchObject({
      outcome: "SENT",
    });
    expect(context.gmail.calls).toHaveLength(1);
    expect(await stored(context, schedule)).toMatchObject({
      runCount: 1,
      nextRunAt: "2026-10-11T04:30:00.000Z",
    });
  });

  it("continues after a failed occurrence", async () => {
    const context = await scheduleSetup();
    const schedule = await scheduled(context, dailyInput(context));
    await setLimits(context, { dailyTotalEmails: 0 });
    expect(await run(context, schedule, first)).toEqual({
      outcome: "FAILED",
      failureCode: "daily-limit-reached",
    });
    expect(failureCategory("FAILED", "daily-limit-reached")).toBe("LIMIT");
    await setLimits(context, {});
    expect(await run(context, schedule, second)).toMatchObject({
      outcome: "SENT",
    });
    expect(await stored(context, schedule)).toMatchObject({
      status: "ACTIVE",
      runCount: 2,
      lastRunStatus: "SENT",
    });
  });

  it("completes at its end and deletes its trigger", async () => {
    const context = await scheduleSetup();
    const schedule = await scheduled(
      context,
      dailyInput(context, { endLocal: "2026-10-08T12:00" }),
    );
    await run(context, schedule, first);
    expect(context.triggers.removed).toEqual([]);
    await run(context, schedule, second);
    expect(await stored(context, schedule)).toMatchObject({
      status: "COMPLETED",
      nextRunAt: null,
      runCount: 2,
    });
    expect(context.triggers.removed).toEqual([schedule.triggerName]);
    expect(await context.store.getScheduleCounts(context.alice.id)).toEqual({
      active: 0,
      recurring: 0,
    });
  });

  it("refuses an occurrence outside the recurrence or after its end", async () => {
    const context = await scheduleSetup();
    const schedule = await scheduled(
      context,
      dailyInput(context, { endLocal: "2026-10-08T12:00" }),
    );
    expect(await run(context, schedule, "2026-10-07T05:30:00.000Z")).toEqual({
      outcome: "invalid-occurrence",
    });
    expect(
      await run(context, schedule, "2026-10-06T04:30:00.000Z", new Date(first)),
    ).toEqual({ outcome: "invalid-occurrence" });
    expect(await run(context, schedule, "2026-10-09T04:30:00.000Z")).toEqual({
      outcome: "ended",
    });
    expect(context.gmail.calls).toHaveLength(0);
  });
});

describe("cancellation races", () => {
  it("sends nothing once a cancellation has committed, and deletes the trigger", async () => {
    const context = await scheduleSetup();
    const schedule = await scheduled(context, dailyInput(context));
    await cancelSchedule(context.deps, context.alice, schedule.id, now);
    context.triggers.removed.length = 0;
    expect(await run(context, schedule, "2026-10-07T04:30:00.000Z")).toEqual({
      outcome: "not-active",
    });
    expect(context.gmail.calls).toHaveLength(0);
    expect(context.triggers.removed).toEqual([schedule.triggerName]);
  });

  it("records an occurrence already sending, without reviving a cancelled schedule", async () => {
    let cancel: () => Promise<unknown> = async () => undefined;
    const gmail = createFakeGmail(async () => {
      await cancel();
      return { ok: true, messageId: "m-1" };
    });
    const context = await scheduleSetup({ gmail });
    const schedule = await scheduled(context, dailyInput(context));
    cancel = () =>
      cancelSchedule(context.deps, context.alice, schedule.id, now);

    expect(
      await run(context, schedule, "2026-10-07T04:30:00.000Z"),
    ).toMatchObject({ outcome: "SENT" });
    expect(await stored(context, schedule)).toMatchObject({
      status: "CANCELLED",
      nextRunAt: null,
      lastRunStatus: "SENT",
      runCount: 1,
    });
    expect(await run(context, schedule, "2026-10-08T04:30:00.000Z")).toEqual({
      outcome: "not-active",
    });
    expect(gmail.calls).toHaveLength(1);
  });
});
