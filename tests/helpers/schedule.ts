import type { Schedule } from "@/lib/admin/model";
import type { ScheduleTriggers } from "@/lib/admin/scheduler";
import type { ExecutionDeps } from "@/lib/admin/scheduleExecution";
import type { ScheduleDeps } from "@/lib/admin/schedules";
import { createLocalTokenCipher } from "@/lib/admin/tokenCipher";
import type { ScheduleInput } from "@/lib/admin/validation";
import { now, seedOwner, seedUser } from "@/tests/helpers/admin";
import { createFakeGoogle } from "@/tests/helpers/gmail";
import { createFakeGmail, seedConnectedSender } from "@/tests/helpers/mail";

/** Records trigger calls like Scheduler would hold them; can be made to fail. */
export function createScheduleTriggers() {
  const active = new Set<string>();
  const created: Schedule[] = [];
  const removed: string[] = [];
  const fail = { create: false, remove: false };
  const triggers: ScheduleTriggers = {
    async create(schedule) {
      if (fail.create) throw new Error("ServiceUnavailable");
      created.push(schedule);
      active.add(schedule.triggerName);
    },
    async remove(schedule) {
      removed.push(schedule.triggerName);
      if (fail.remove) throw new Error("ServiceUnavailable");
      active.delete(schedule.triggerName);
    },
  };
  return { triggers, active, created, removed, fail };
}

/** A USER (Alice) with a connected sender, and Bob with his own. */
export async function scheduleSetup(
  options: { gmail?: ReturnType<typeof createFakeGmail> } = {},
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
  const bobSender = await seedConnectedSender(
    store,
    cipher,
    owner,
    bob,
    "bob@gmail.com",
  );
  const triggers = createScheduleTriggers();
  const google = createFakeGoogle();
  const gmail = options.gmail ?? createFakeGmail();
  const deps: ScheduleDeps = { store, triggers: triggers.triggers };
  const execution: ExecutionDeps = {
    store,
    google: google.client,
    cipher,
    gmail: gmail.client,
    triggers: triggers.triggers,
  };
  return {
    store,
    owner,
    alice,
    bob,
    sender,
    bobSender,
    triggers,
    google,
    gmail,
    deps,
    execution,
  };
}

export type ScheduleContext = Awaited<ReturnType<typeof scheduleSetup>>;

/** 2026-10-12 10:00 in Kolkata (04:30 UTC), six days after `now`. */
export const oneTimeStart = "2026-10-12T10:00";
export const oneTimeInstant = "2026-10-12T04:30:00.000Z";

export function scheduleInput(
  context: ScheduleContext,
  overrides: Partial<ScheduleInput> = {},
): ScheduleInput {
  return {
    senderIdentityId: context.sender.identity.id,
    contactIds: [],
    emails: ["rahul@example.com"],
    templateId: null,
    subject: "Following up",
    body: "Hello,\n\nThanks for your time.",
    type: "ONE_TIME",
    startLocal: oneTimeStart,
    endLocal: null,
    timeZone: "Asia/Kolkata",
    recurrence: null,
    ...overrides,
  };
}

/** Daily at 10:00 Kolkata, starting 2026-10-07. */
export function dailyInput(
  context: ScheduleContext,
  overrides: Partial<ScheduleInput> = {},
) {
  return scheduleInput(context, {
    type: "RECURRING",
    startLocal: "2026-10-07T10:00",
    recurrence: { frequency: "DAILY" },
    ...overrides,
  });
}

export function at(iso: string) {
  return new Date(iso);
}

export { now };
