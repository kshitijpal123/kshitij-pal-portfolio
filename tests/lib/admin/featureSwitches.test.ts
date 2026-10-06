// @vitest-environment node
import { describe, expect, it } from "vitest";
import { executeScheduledOccurrence } from "@/lib/admin/scheduleExecution";
import {
  createSchedule,
  describeScheduleRejection,
} from "@/lib/admin/schedules";
import { defaultUserSettings, updateUserSettings } from "@/lib/admin/settings";
import {
  dailyInput,
  now,
  oneTimeInstant,
  type ScheduleContext,
  scheduleInput,
  scheduleSetup,
} from "@/tests/helpers/schedule";

async function configure(
  context: ScheduleContext,
  overrides: Partial<typeof defaultUserSettings>,
) {
  const result = await updateUserSettings(
    context.store,
    context.owner,
    context.alice.id,
    { ...defaultUserSettings, ...overrides },
    now,
  );
  expect(result).toBe("updated");
}

describe("scheduling switches", () => {
  it("refuse new schedules on the server when scheduling is off", async () => {
    const context = await scheduleSetup();
    await configure(context, { schedulingEnabled: false });
    for (const input of [scheduleInput(context), dailyInput(context)]) {
      const outcome = await createSchedule(
        context.deps,
        context.alice,
        input,
        now,
      );
      expect(outcome).toEqual({ ok: false, reason: "scheduling-disabled" });
    }
    expect(context.triggers.created).toHaveLength(0);
    expect(
      describeScheduleRejection({ reason: "scheduling-disabled" }),
    ).toContain("Scheduling is turned off");
  });

  it("refuse only repeating schedules when recurring is off", async () => {
    const context = await scheduleSetup();
    await configure(context, { recurringEnabled: false });
    expect(
      await createSchedule(
        context.deps,
        context.alice,
        dailyInput(context),
        now,
      ),
    ).toEqual({ ok: false, reason: "recurring-disabled" });
    expect(
      await createSchedule(
        context.deps,
        context.alice,
        scheduleInput(context),
        now,
      ),
    ).toMatchObject({ ok: true });
  });

  it("stop existing schedules from sending when turned off later", async () => {
    const context = await scheduleSetup();
    const created = await createSchedule(
      context.deps,
      context.alice,
      scheduleInput(context),
      now,
    );
    if (!created.ok) throw new Error(created.reason);
    await configure(context, { schedulingEnabled: false });

    const result = await executeScheduledOccurrence(
      context.execution,
      {
        scheduleId: created.schedule.id,
        scheduledTime: oneTimeInstant.replace(".000", ""),
      },
      new Date(oneTimeInstant),
    );
    expect(result).toEqual({
      outcome: "FAILED",
      failureCode: "scheduling-disabled",
    });
    expect(context.gmail.calls).toHaveLength(0);
  });

  it("stop existing repeating schedules when recurring is turned off", async () => {
    const context = await scheduleSetup();
    const created = await createSchedule(
      context.deps,
      context.alice,
      dailyInput(context),
      now,
    );
    if (!created.ok) throw new Error(created.reason);
    await configure(context, { recurringEnabled: false });
    const first = created.schedule.nextRunAt!;
    const result = await executeScheduledOccurrence(
      context.execution,
      {
        scheduleId: created.schedule.id,
        scheduledTime: first.replace(".000", ""),
      },
      new Date(first),
    );
    expect(result).toMatchObject({ failureCode: "scheduling-disabled" });
    expect(context.gmail.calls).toHaveLength(0);
  });

  it("audit each scheduled occurrence in the owner's trail without content", async () => {
    const context = await scheduleSetup();
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
    const trail = await context.store.listAuditEvents(context.alice.id, {
      after: null,
      limit: 10,
    });
    expect(trail.items).toEqual([
      expect.objectContaining({
        action: "schedule.run",
        actorId: null,
        outcome: "success",
        targetId: created.schedule.id,
        detail: expect.objectContaining({ status: "SENT", sent: 1 }),
      }),
    ]);
    expect(JSON.stringify(trail)).not.toMatch(
      /rahul@example\.com|Following up|Thanks for your time/,
    );
  });
});
