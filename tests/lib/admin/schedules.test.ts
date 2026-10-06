// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createTemplate, listOwnTemplates } from "@/lib/admin/templates";
import { createContact, listOwnContacts } from "@/lib/admin/contacts";
import {
  cancelSchedule,
  createSchedule,
  describeScheduleRejection,
  effectiveScheduleStatus,
  getOwnSchedule,
  listOwnSchedules,
} from "@/lib/admin/schedules";
import { defaultUserSettings, updateUserSettings } from "@/lib/admin/settings";
import { validateSchedule } from "@/lib/admin/validation";
import { later } from "@/tests/helpers/admin";
import {
  dailyInput,
  now,
  oneTimeInstant,
  oneTimeStart,
  type ScheduleContext,
  scheduleInput,
  scheduleSetup,
} from "@/tests/helpers/schedule";

async function setLimits(
  context: ScheduleContext,
  limits: Partial<typeof defaultUserSettings>,
) {
  const outcome = await updateUserSettings(
    context.store,
    context.owner,
    context.alice.id,
    { ...defaultUserSettings, ...limits },
    now,
  );
  if (outcome !== "updated") throw new Error(outcome);
}

describe("creating schedules", () => {
  it("stores a one-time schedule for the actor in UTC and registers its trigger without sending", async () => {
    const context = await scheduleSetup();
    const outcome = await createSchedule(
      context.deps,
      context.alice,
      scheduleInput(context),
      now,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.schedule).toMatchObject({
      userId: context.alice.id,
      createdBy: context.alice.id,
      type: "ONE_TIME",
      status: "ACTIVE",
      senderEmail: "alice@gmail.com",
      timeZone: "Asia/Kolkata",
      startLocal: oneTimeStart,
      startAt: oneTimeInstant,
      nextRunAt: oneTimeInstant,
      runCount: 0,
      triggerName: `mail-${outcome.schedule.id}`,
    });
    expect(context.triggers.created.map((s) => s.id)).toEqual([
      outcome.schedule.id,
    ]);
    expect(context.gmail.calls).toHaveLength(0);
    expect(await context.store.getScheduleCounts(context.alice.id)).toEqual({
      active: 1,
      recurring: 0,
    });
    expect(
      await context.store.listRecentSendRecords(context.alice.id, 10),
    ).toEqual([]);
  });

  it("starts a recurrence at its first occurrence, with the time of day from the start", async () => {
    const context = await scheduleSetup();
    const outcome = await createSchedule(
      context.deps,
      context.alice,
      dailyInput(context, {
        startLocal: "2026-10-07T09:15",
        recurrence: { frequency: "WEEKLY", weekdays: ["FRIDAY"] },
        endLocal: "2026-11-30T23:00",
      }),
      now,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.schedule).toMatchObject({
      type: "RECURRING",
      recurrence: { frequency: "WEEKLY", weekdays: ["FRIDAY"], time: "09:15" },
      startAt: "2026-10-07T03:45:00.000Z",
      nextRunAt: "2026-10-09T03:45:00.000Z",
      endAt: "2026-11-30T17:30:00.000Z",
    });
    expect(await context.store.getScheduleCounts(context.alice.id)).toEqual({
      active: 1,
      recurring: 1,
    });
  });

  it("refuses times in the past, too soon, nonexistent, or beyond the window", async () => {
    const context = await scheduleSetup();
    const cases: [Partial<Parameters<typeof scheduleInput>[1]>, string][] = [
      [{ startLocal: "2026-10-01T10:00" }, "start-too-soon"],
      // 09:00 UTC is 14:30 in Kolkata; 14:31 is under 2 minutes away.
      [{ startLocal: "2026-10-06T14:31" }, "start-too-soon"],
      [
        { startLocal: "2027-03-14T02:30", timeZone: "America/New_York" },
        "start-nonexistent",
      ],
      [{ startLocal: "2026-11-06T10:00" }, "beyond-window"],
      [{ timeZone: "IST" }, "start-nonexistent"],
    ];
    for (const [overrides, reason] of cases) {
      const outcome = await createSchedule(
        context.deps,
        context.alice,
        scheduleInput(context, overrides),
        now,
      );
      expect(outcome, JSON.stringify(overrides)).toMatchObject({
        ok: false,
        reason,
      });
    }
    expect(context.triggers.created).toHaveLength(0);
    expect(await context.store.listSchedules(context.alice.id)).toEqual([]);
  });

  it("applies the OWNER's scheduling window to the first send", async () => {
    const context = await scheduleSetup();
    await setLimits(context, { maxFutureSchedulingWindowDays: 3 });
    expect(
      await createSchedule(
        context.deps,
        context.alice,
        scheduleInput(context),
        now,
      ),
    ).toMatchObject({ ok: false, reason: "beyond-window", days: 3 });
    expect(
      await createSchedule(
        context.deps,
        context.alice,
        scheduleInput(context, { startLocal: "2026-10-08T10:00" }),
        now,
      ),
    ).toMatchObject({ ok: true });
  });

  it("refuses a recurrence whose end leaves no occurrence", async () => {
    const context = await scheduleSetup();
    for (const [endLocal, reason] of [
      ["2026-10-07T09:00", "end-before-start"],
      ["2026-10-08T09:00", "no-occurrence"],
    ] as const) {
      const outcome = await createSchedule(
        context.deps,
        context.alice,
        dailyInput(context, {
          startLocal: "2026-10-07T09:30",
          recurrence: { frequency: "WEEKLY", weekdays: ["MONDAY"] },
          endLocal,
        }),
        now,
      );
      expect(outcome).toMatchObject({ ok: false, reason });
    }
  });

  it("applies every M3 sending check at creation", async () => {
    const context = await scheduleSetup();
    const bobTemplate = await createTemplate(
      context.store,
      context.bob,
      { name: "Bob's", subject: "Hi", body: "Hi" },
      now,
    );
    expect(bobTemplate).toBe("saved");
    const [template] = await listOwnTemplates(context.store, context.bob);
    await createContact(
      context.store,
      context.bob,
      {
        name: "Bob's friend",
        email: "f@example.com",
        company: null,
        notes: null,
      },
      now,
    );
    const [contact] = await listOwnContacts(context.store, context.bob);

    const cases: [Parameters<typeof scheduleInput>[1], string][] = [
      [
        { senderIdentityId: context.bobSender.identity.id },
        "sender-unavailable",
      ],
      [{ templateId: template.id }, "template-not-found"],
      [{ contactIds: [contact.id], emails: [] }, "recipient-not-found"],
      [{ emails: ["a@example.com", "b@example.com"] }, "bulk-disabled"],
      [{ subject: "Hi {{name}}" }, "unresolved-placeholder"],
    ];
    await setLimits(context, { bulkSendingEnabled: false });
    for (const [overrides, reason] of cases) {
      expect(
        await createSchedule(
          context.deps,
          context.alice,
          scheduleInput(context, overrides),
          now,
        ),
        reason,
      ).toMatchObject({ ok: false, reason });
    }

    await setLimits(context, { sendingEnabled: false });
    expect(
      await createSchedule(
        context.deps,
        context.alice,
        scheduleInput(context),
        now,
      ),
    ).toMatchObject({ ok: false, reason: "sending-disabled" });
    expect(await context.store.listSchedules(context.alice.id)).toEqual([]);
    expect(context.triggers.created).toHaveLength(0);
  });

  it("enforces the active and recurring limits, including under concurrency", async () => {
    const context = await scheduleSetup();
    await setLimits(context, {
      maxScheduledEmails: 3,
      maxRecurringSchedules: 1,
    });

    const recurring = await createSchedule(
      context.deps,
      context.alice,
      dailyInput(context),
      now,
    );
    expect(recurring.ok).toBe(true);
    expect(
      await createSchedule(
        context.deps,
        context.alice,
        dailyInput(context),
        now,
      ),
    ).toMatchObject({
      ok: false,
      reason: "recurring-limit",
      recurring: 1,
      max: 1,
    });

    const attempts = await Promise.all(
      Array.from({ length: 5 }, () =>
        createSchedule(
          context.deps,
          context.alice,
          scheduleInput(context),
          now,
        ),
      ),
    );
    expect(attempts.filter((outcome) => outcome.ok)).toHaveLength(2);
    expect(attempts.filter((outcome) => !outcome.ok)).toEqual(
      Array.from({ length: 3 }, () =>
        expect.objectContaining({ reason: "schedule-limit", max: 3 }),
      ),
    );
    expect(await context.store.getScheduleCounts(context.alice.id)).toEqual({
      active: 3,
      recurring: 1,
    });
    expect(context.triggers.created).toHaveLength(3);

    await setLimits(context, { maxScheduledEmails: 0 });
    const bobOutcome = await createSchedule(
      context.deps,
      context.bob,
      scheduleInput(context, {
        senderIdentityId: context.bobSender.identity.id,
      }),
      now,
    );
    expect(bobOutcome.ok).toBe(true);
  });

  it("marks the schedule FAILED and frees its slot when the trigger cannot be created", async () => {
    const context = await scheduleSetup();
    context.triggers.fail.create = true;
    const outcome = await createSchedule(
      context.deps,
      context.alice,
      scheduleInput(context),
      now,
    );
    expect(outcome).toMatchObject({
      ok: false,
      reason: "scheduler-unavailable",
    });
    const [stored] = await context.store.listSchedules(context.alice.id);
    expect(stored).toMatchObject({
      status: "FAILED",
      failureCode: "scheduler-unavailable",
      nextRunAt: null,
      body: "",
    });
    expect(context.triggers.removed).toEqual([stored.triggerName]);
    expect(await context.store.getScheduleCounts(context.alice.id)).toEqual({
      active: 0,
      recurring: 0,
    });
  });

  it("schedules nothing while Scheduler is not configured", async () => {
    const context = await scheduleSetup();
    expect(
      await createSchedule(
        { store: context.store, triggers: null },
        context.alice,
        scheduleInput(context),
        now,
      ),
    ).toMatchObject({ ok: false, reason: "not-configured" });
    expect(await context.store.listSchedules(context.alice.id)).toEqual([]);
  });

  it("explains every refusal without echoing content", () => {
    expect(
      describeScheduleRejection({ reason: "beyond-window", days: 30 }),
    ).toBe(
      "The first send must be within 30 days from now. Nothing was scheduled.",
    );
    expect(
      describeScheduleRejection({
        reason: "bulk-limit-exceeded",
        requested: 3,
        max: 2,
      }),
    ).toContain("Nothing was scheduled.");
  });
});

describe("validateSchedule", () => {
  function form(values: Record<string, string | string[]>) {
    const data = new FormData();
    for (const [key, value] of Object.entries(values)) {
      for (const item of [value].flat()) data.append(key, item);
    }
    return data;
  }
  const base = {
    senderIdentityId: "identity",
    emails: "rahul@example.com",
    subject: "Hello",
    body: "Body",
    startAt: "2026-10-12T10:00",
    timeZone: "Asia/Kolkata",
  };

  it("reads a one-time schedule and ignores recurrence fields", () => {
    expect(
      validateSchedule(
        form({ ...base, type: "ONE_TIME", frequency: "DAILY", endAt: "x" }),
      ),
    ).toMatchObject({
      success: true,
      data: {
        type: "ONE_TIME",
        startLocal: "2026-10-12T10:00",
        endLocal: null,
        timeZone: "Asia/Kolkata",
        recurrence: null,
        emails: ["rahul@example.com"],
      },
    });
  });

  it("reads only structured recurrences", () => {
    expect(
      validateSchedule(
        form({
          ...base,
          type: "RECURRING",
          frequency: "WEEKLY",
          weekday: ["FRIDAY", "MONDAY", "FUNDAY"],
          endAt: "2026-12-31T10:00",
        }),
      ),
    ).toMatchObject({
      success: true,
      data: {
        recurrence: { frequency: "WEEKLY", weekdays: ["MONDAY", "FRIDAY"] },
        endLocal: "2026-12-31T10:00",
      },
    });
    for (const [values, field] of [
      [{ frequency: "WEEKLY" }, "weekdays"],
      [{ frequency: "MONTHLY", dayOfMonth: "29" }, "dayOfMonth"],
      [{ frequency: "MONTHLY", dayOfMonth: "1.5" }, "dayOfMonth"],
      [{ frequency: "cron(0 * * * ? *)" }, "frequency"],
      [{ frequency: "HOURLY" }, "frequency"],
      [{ frequency: "DAILY", endAt: "soon" }, "endAt"],
      [{ frequency: "DAILY", timeZone: "EST" }, "timeZone"],
      [{ frequency: "DAILY", type: "EVERY_MINUTE" }, "type"],
    ] as const) {
      const result = validateSchedule(
        form({ ...base, type: "RECURRING", ...values }),
      );
      expect(result.success, JSON.stringify(values)).toBe(false);
      if (!result.success) expect(result.errors).toHaveProperty(field);
    }
  });
});

describe("viewing and cancelling schedules", () => {
  async function withSchedule() {
    const context = await scheduleSetup();
    const outcome = await createSchedule(
      context.deps,
      context.alice,
      scheduleInput(context),
      now,
    );
    if (!outcome.ok) throw new Error(outcome.reason);
    return { ...context, schedule: outcome.schedule };
  }

  it("shows each user only their own schedules", async () => {
    const context = await withSchedule();
    expect(
      (await listOwnSchedules(context.store, context.alice)).map((s) => s.id),
    ).toEqual([context.schedule.id]);
    expect(await listOwnSchedules(context.store, context.bob)).toEqual([]);
    expect(
      await getOwnSchedule(context.store, context.bob, context.schedule.id),
    ).toBeNull();
    expect(
      await getOwnSchedule(context.store, context.owner, context.schedule.id),
    ).toBeNull();
  });

  it("lets no one else cancel a schedule, not even the OWNER", async () => {
    const context = await withSchedule();
    for (const actor of [context.bob, context.owner]) {
      expect(
        await cancelSchedule(context.deps, actor, context.schedule.id, now),
      ).toBe("not-found");
    }
    expect(
      await getOwnSchedule(context.store, context.alice, context.schedule.id),
    ).toMatchObject({ status: "ACTIVE" });
    expect(context.triggers.removed).toEqual([]);
  });

  it("cancels, frees the slot, clears the body, and deletes the trigger", async () => {
    const context = await withSchedule();
    expect(
      await cancelSchedule(
        context.deps,
        context.alice,
        context.schedule.id,
        now,
      ),
    ).toBe("cancelled");
    expect(
      await getOwnSchedule(context.store, context.alice, context.schedule.id),
    ).toMatchObject({
      status: "CANCELLED",
      cancelledAt: now.toISOString(),
      nextRunAt: null,
      body: "",
    });
    expect(context.triggers.removed).toEqual([context.schedule.triggerName]);
    expect(await context.store.getScheduleCounts(context.alice.id)).toEqual({
      active: 0,
      recurring: 0,
    });
    expect(
      await cancelSchedule(
        context.deps,
        context.alice,
        context.schedule.id,
        now,
      ),
    ).toBe("not-active");
  });

  it("still cancels when the trigger cannot be deleted now", async () => {
    const context = await withSchedule();
    context.triggers.fail.remove = true;
    expect(
      await cancelSchedule(
        context.deps,
        context.alice,
        context.schedule.id,
        now,
      ),
    ).toBe("cancelled");
    expect(
      await getOwnSchedule(context.store, context.alice, context.schedule.id),
    ).toMatchObject({ status: "CANCELLED" });
  });

  it("derives OVERDUE for an ACTIVE schedule well past its next send", async () => {
    const context = await withSchedule();
    const due = new Date(oneTimeInstant);
    expect(effectiveScheduleStatus(context.schedule, due)).toBe("ACTIVE");
    expect(
      effectiveScheduleStatus(context.schedule, later(61 * 60_000, due)),
    ).toBe("OVERDUE");
    expect(
      effectiveScheduleStatus(
        { status: "CANCELLED", nextRunAt: null },
        later(61 * 60_000, due),
      ),
    ).toBe("CANCELLED");
  });
});
