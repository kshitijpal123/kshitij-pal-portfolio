import type {
  PublicUser,
  Recurrence,
  Schedule,
  ScheduleFailureCode,
  ScheduleStatus,
} from "@/lib/admin/model";
import {
  fromLocal,
  isValidTimeZone,
  nextOccurrence,
  parseLocal,
  timeOf,
} from "@/lib/admin/recurrence";
import { type ScheduleTriggers, triggerNameFor } from "@/lib/admin/scheduler";
import {
  checkSendDraft,
  describeFailureCode,
  describeSendRejection,
  type SendRejection,
} from "@/lib/admin/sending";
import { getUserSettings } from "@/lib/admin/settings";
import type { AdminStore } from "@/lib/admin/store";
import type { ScheduleInput } from "@/lib/admin/validation";

/*
 * Creating a schedule sends nothing. It stores the schedule (ACTIVE, counted
 * against the owner's limits) and creates its EventBridge Scheduler trigger;
 * the execution function sends when an occurrence is due. Every operation
 * takes the actor from the session and addresses schedules by the actor's
 * own ID, so another user's schedule is simply not found.
 */

const minuteMs = 60_000;
const dayMs = 24 * 60 * minuteMs;

/** The first send must be at least this far ahead, so its trigger exists. */
export const scheduleMinLeadMs = 2 * minuteMs;

/**
 * An occurrence invoked later than this after its time is not sent (it is
 * recorded as missed). Scheduler and Lambda retries stop within it too.
 */
export const occurrenceLatenessMs = 60 * minuteMs;

export type ScheduleDeps = {
  store: AdminStore;
  /** `null` while EventBridge Scheduler is not configured. */
  triggers: ScheduleTriggers | null;
};

export type ScheduleRejection =
  | SendRejection
  | {
      reason:
        | "not-configured"
        | "scheduling-disabled"
        | "recurring-disabled"
        | "start-too-soon"
        | "start-nonexistent"
        | "end-nonexistent"
        | "end-before-start"
        | "no-occurrence"
        | "scheduler-unavailable";
    }
  | { reason: "beyond-window"; days: number }
  | { reason: "schedule-limit"; active: number; max: number }
  | { reason: "recurring-limit"; recurring: number; max: number };

export type CreateScheduleOutcome =
  { ok: true; schedule: Schedule } | ({ ok: false } & ScheduleRejection);

function reject(rejection: ScheduleRejection): CreateScheduleOutcome {
  return { ok: false, ...rejection };
}

type Timing = {
  startAt: number;
  endAt: number | null;
  recurrence: Recurrence | null;
  firstRun: number;
};

/** Interprets the entered local times in the chosen IANA zone. */
function resolveTiming(
  input: ScheduleInput,
  now: Date,
  windowDays: number,
): Timing | ScheduleRejection {
  const start = parseLocal(input.startLocal);
  if (!start || !isValidTimeZone(input.timeZone)) {
    return { reason: "start-nonexistent" };
  }
  const startAt = fromLocal(start, input.timeZone);
  if (startAt === null) return { reason: "start-nonexistent" };
  if (startAt < now.getTime() + scheduleMinLeadMs) {
    return { reason: "start-too-soon" };
  }

  let recurrence: Recurrence | null = null;
  let firstRun = startAt;
  let endAt: number | null = null;
  if (input.type === "RECURRING") {
    if (!input.recurrence) return { reason: "no-occurrence" };
    recurrence = { ...input.recurrence, time: timeOf(start) };
    const first = nextOccurrence(recurrence, input.timeZone, startAt, true);
    if (first === null) return { reason: "no-occurrence" };
    firstRun = first;
    if (input.endLocal) {
      const end = parseLocal(input.endLocal);
      endAt = end ? fromLocal(end, input.timeZone) : null;
      if (endAt === null) return { reason: "end-nonexistent" };
      if (endAt <= startAt) return { reason: "end-before-start" };
      if (endAt < firstRun) return { reason: "no-occurrence" };
    }
  }

  // The window bounds the first send only; a recurrence may continue
  // beyond it, up to its end date.
  if (firstRun > now.getTime() + windowDays * dayMs) {
    return { reason: "beyond-window", days: windowDays };
  }
  return { startAt, endAt, recurrence, firstRun };
}

/**
 * Validates and stores a schedule for the actor, then creates its trigger.
 * The message must pass the same checks a send would pass now; every
 * occurrence passes them again when it runs. If the trigger cannot be
 * created, the schedule is marked FAILED (releasing its slot), so nothing
 * looks ACTIVE that will never run.
 */
export async function createSchedule(
  deps: ScheduleDeps,
  actor: PublicUser,
  input: ScheduleInput,
  now: Date,
): Promise<CreateScheduleOutcome> {
  const { store, triggers } = deps;
  if (!triggers) return reject({ reason: "not-configured" });

  const settings = await getUserSettings(store, actor.id);
  if (!settings.schedulingEnabled) {
    return reject({ reason: "scheduling-disabled" });
  }
  if (input.type === "RECURRING" && !settings.recurringEnabled) {
    return reject({ reason: "recurring-disabled" });
  }
  const timing = resolveTiming(
    input,
    now,
    settings.maxFutureSchedulingWindowDays,
  );
  if ("reason" in timing) return reject(timing);

  const draft = {
    senderIdentityId: input.senderIdentityId,
    contactIds: [...new Set(input.contactIds)],
    emails: [...new Set(input.emails)],
    templateId: input.templateId,
    subject: input.subject,
    body: input.body,
  };
  const problem = await checkSendDraft(store, actor, draft, now);
  if (problem) return reject(problem);
  const identity = await store.getSenderIdentity(draft.senderIdentityId);
  if (!identity || identity.userId !== actor.id) {
    return reject({ reason: "sender-unavailable" });
  }

  const id = crypto.randomUUID();
  const at = now.toISOString();
  const schedule: Schedule = {
    id,
    userId: actor.id,
    type: input.type,
    status: "ACTIVE",
    ...draft,
    senderEmail: identity.email,
    timeZone: input.timeZone,
    startLocal: input.startLocal,
    startAt: new Date(timing.startAt).toISOString(),
    endAt: timing.endAt === null ? null : new Date(timing.endAt).toISOString(),
    recurrence: timing.recurrence,
    nextRunAt: new Date(timing.firstRun).toISOString(),
    lastRunAt: null,
    lastRunStatus: null,
    lastRunFailure: null,
    runCount: 0,
    triggerName: triggerNameFor(id),
    failureCode: null,
    createdBy: actor.id,
    createdAt: at,
    updatedAt: at,
    cancelledAt: null,
    completedAt: null,
  };

  if ((await store.createSchedule(schedule, settings)) === "limit") {
    const counts = await store.getScheduleCounts(actor.id);
    return reject(
      counts.active >= settings.maxScheduledEmails
        ? {
            reason: "schedule-limit",
            active: counts.active,
            max: settings.maxScheduledEmails,
          }
        : {
            reason: "recurring-limit",
            recurring: counts.recurring,
            max: settings.maxRecurringSchedules,
          },
    );
  }

  try {
    await triggers.create(schedule);
  } catch {
    await store
      .endSchedule(schedule, {
        status: "FAILED",
        at: new Date().toISOString(),
        failureCode: "scheduler-unavailable",
      })
      .catch(() => false);
    // The request may have succeeded without an answer; never leave it.
    await triggers.remove(schedule).catch(() => undefined);
    return reject({ reason: "scheduler-unavailable" });
  }
  return { ok: true, schedule };
}

/** The actor's own schedules, newest first. */
export async function listOwnSchedules(store: AdminStore, actor: PublicUser) {
  return (await store.listSchedules(actor.id))
    .filter((schedule) => schedule.userId === actor.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** One of the actor's own schedules, or `null` (also for anyone else's). */
export async function getOwnSchedule(
  store: AdminStore,
  actor: PublicUser,
  scheduleId: string,
) {
  const schedule = scheduleId
    ? await store.getSchedule(actor.id, scheduleId)
    : null;
  return schedule && schedule.userId === actor.id ? schedule : null;
}

export type CancelScheduleOutcome = "cancelled" | "not-found" | "not-active";

/**
 * Cancels one of the actor's ACTIVE schedules: the stored state changes
 * first (the execution function re-reads it before every occurrence, so
 * nothing is sent after this), then the trigger is deleted. A trigger that
 * cannot be deleted now is deleted by the execution function the next time
 * it fires. An occurrence Gmail already accepted cannot be undone.
 */
export async function cancelSchedule(
  deps: {
    store: AdminStore;
    triggers: Pick<ScheduleTriggers, "remove"> | null;
  },
  actor: PublicUser,
  scheduleId: string,
  now: Date,
): Promise<CancelScheduleOutcome> {
  const user = await deps.store.getUserById(actor.id);
  if (!user || user.status !== "ACTIVE") return "not-found";
  const schedule = await getOwnSchedule(deps.store, actor, scheduleId);
  if (!schedule) return "not-found";
  if (schedule.status !== "ACTIVE") return "not-active";
  const ended = await deps.store.endSchedule(schedule, {
    status: "CANCELLED",
    at: now.toISOString(),
    failureCode: null,
  });
  if (!ended) return "not-active";
  if (deps.triggers) {
    await deps.triggers.remove(schedule).catch(() => undefined);
  }
  return "cancelled";
}

/**
 * OVERDUE is derived when read, like an expired invitation: an ACTIVE
 * schedule whose next occurrence is past the lateness window without being
 * recorded. It still holds its slot until it runs or is cancelled.
 */
export type ScheduleDisplayStatus = ScheduleStatus | "OVERDUE";

export function effectiveScheduleStatus(
  schedule: Pick<Schedule, "status" | "nextRunAt">,
  now: Date,
): ScheduleDisplayStatus {
  return schedule.status === "ACTIVE" &&
    schedule.nextRunAt !== null &&
    Date.parse(schedule.nextRunAt) + occurrenceLatenessMs < now.getTime()
    ? "OVERDUE"
    : schedule.status;
}

export function describeScheduleRejection(
  rejection: ScheduleRejection,
): string {
  switch (rejection.reason) {
    case "not-configured":
      return "Scheduling is not configured on this server. Nothing was scheduled.";
    case "scheduling-disabled":
      return "Scheduling is turned off for your account. Nothing was scheduled.";
    case "recurring-disabled":
      return "Repeating schedules are turned off for your account. Nothing was scheduled.";
    case "start-too-soon":
      return "Choose a time at least 2 minutes from now.";
    case "start-nonexistent":
      return "That start time does not exist in the chosen time zone (for example, during a daylight saving change). Choose another time.";
    case "end-nonexistent":
      return "That end time does not exist in the chosen time zone. Choose another time.";
    case "end-before-start":
      return "The end must be after the start.";
    case "no-occurrence":
      return "No send falls between the start and the end. Change the dates or the days.";
    case "beyond-window":
      return `The first send must be within ${rejection.days} days from now. Nothing was scheduled.`;
    case "schedule-limit":
      return `You have ${rejection.active} of ${rejection.max} active schedules. Cancel one before scheduling another.`;
    case "recurring-limit":
      return `You have ${rejection.recurring} of ${rejection.max} active recurring schedules. Cancel one before adding another.`;
    case "scheduler-unavailable":
      return "The schedule could not be registered with the scheduler. Nothing was scheduled; try again later.";
    default:
      return describeSendRejection(rejection).replace(
        "Nothing was sent.",
        "Nothing was scheduled.",
      );
  }
}

const scheduleFailures: Record<ScheduleFailureCode, string> = {
  "not-connected": describeFailureCode("not-connected"),
  "reauth-required": describeFailureCode("reauth-required"),
  "gmail-auth-failed": describeFailureCode("gmail-auth-failed"),
  "gmail-rejected": describeFailureCode("gmail-rejected"),
  "gmail-rate-limited": describeFailureCode("gmail-rate-limited"),
  "gmail-unavailable": "Not sent: Google could not be reached.",
  "not-attempted": "Not sent: sending stopped before this recipient.",
  "user-inactive": "Not sent: the account is not active.",
  "sending-disabled": "Not sent: sending is turned off for the account.",
  "scheduling-disabled":
    "Not sent: scheduling (or repeating schedules) is turned off for the account.",
  "sender-unavailable":
    "Not sent: the sender address is no longer approved for this account.",
  "contacts-disabled": "Not sent: contacts are turned off for the account.",
  "templates-disabled": "Not sent: templates are turned off for the account.",
  "template-not-found": "Not sent: the template was deleted.",
  "no-recipients": "Not sent: no recipients.",
  "recipient-not-found": "Not sent: a chosen contact was deleted.",
  "invalid-recipient": "Not sent: a recipient address is not valid.",
  "bulk-disabled": "Not sent: sending to several recipients is turned off.",
  "bulk-limit-exceeded":
    "Not sent: more recipients than the per-send limit allows.",
  "daily-limit-reached": "Not sent: the daily sending limit was reached.",
  "daily-bulk-limit-reached": "Not sent: the daily bulk limit was reached.",
  "unresolved-placeholder":
    "Not sent: a placeholder had no value for a recipient.",
  "invalid-message": "Not sent: the message could not be built.",
  busy: "Not sent: another send with the same key was in progress.",
  missed: "Not sent: the scheduler invoked this occurrence too late.",
  interrupted:
    "Outcome unknown: sending stopped unexpectedly. Check the Sent folder in Gmail.",
  "scheduler-unavailable":
    "Not scheduled: the trigger could not be registered with the scheduler.",
};

/** A fixed explanation of a schedule's failure without an occurrence. */
export function describeScheduleFailure(code: ScheduleFailureCode) {
  return scheduleFailures[code];
}

/** The latest occurrence's outcome, in fixed words. */
export function describeLastRun(
  schedule: Pick<Schedule, "lastRunStatus" | "lastRunFailure">,
): string | null {
  switch (schedule.lastRunStatus) {
    case null:
      return null;
    case "SENT":
      return "Sent.";
    case "RESERVED":
      return "In progress or outcome unknown; not sent again.";
    case "UNCERTAIN":
      return describeFailureCode("gmail-unavailable");
    case "FAILED":
      return schedule.lastRunFailure
        ? scheduleFailures[schedule.lastRunFailure]
        : "Not sent.";
  }
}
