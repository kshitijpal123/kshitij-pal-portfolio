import { createHash } from "node:crypto";
import { recordAudit } from "@/lib/admin/audit";
import {
  type Schedule,
  type ScheduleFailureCode,
  type ScheduleRun,
  type ScheduleRunStatus,
  toPublicUser,
} from "@/lib/admin/model";
import {
  formatLocal,
  fromLocal,
  isOccurrence,
  nextOccurrence,
  parseLocal,
  toLocal,
} from "@/lib/admin/recurrence";
import {
  type ScheduleTriggers,
  type TriggerPayload,
  triggerNameFor,
} from "@/lib/admin/scheduler";
import { occurrenceLatenessMs } from "@/lib/admin/schedules";
import { type SendDeps, sendEmail } from "@/lib/admin/sending";
import { getUserSettings } from "@/lib/admin/settings";
import type { RunCompletion, ScheduleAdvance } from "@/lib/admin/store";

/*
 * One invocation by EventBridge Scheduler: one occurrence of one schedule.
 * The payload names only the schedule and the intended time; everything
 * else (owner, sender, recipients, content) is read from DynamoDB, and the
 * send goes through M3's `sendEmail` with the schedule's owner as the actor,
 * so every sending gate applies. Each occurrence is claimed once, so a
 * repeated or concurrent invocation never sends again.
 */

const minuteMs = 60_000;

/** Scheduler may invoke slightly before the minute; never earlier. */
const earlyToleranceMs = minuteMs;

export type ExecutionDeps = SendDeps & {
  /** Deletes triggers that should no longer fire; `null` in tests. */
  triggers: Pick<ScheduleTriggers, "remove"> | null;
};

export type ExecutionOutcome =
  | "invalid-event"
  | "not-found"
  | "not-active"
  | "ended"
  | "invalid-occurrence"
  | "not-due"
  | "duplicate"
  | Exclude<ScheduleRunStatus, "RESERVED">;

export type ExecutionResult = {
  outcome: ExecutionOutcome;
  failureCode?: ScheduleFailureCode | null;
  /** For `duplicate`: what the earlier claim of this occurrence recorded. */
  previous?: ScheduleRunStatus | null;
};

const scheduleIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const scheduledTimePattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/**
 * Exactly the two fields Scheduler sends. Anything else, including a
 * recipient, sender, subject, body, or user ID, makes the event invalid.
 */
export function parseTriggerPayload(event: unknown): TriggerPayload | null {
  if (!event || typeof event !== "object" || Array.isArray(event)) return null;
  const fields = Object.keys(event).sort();
  if (fields.join(",") !== "scheduleId,scheduledTime") return null;
  const { scheduleId, scheduledTime } = event as Record<string, unknown>;
  if (typeof scheduleId !== "string" || !scheduleIdPattern.test(scheduleId)) {
    return null;
  }
  if (
    typeof scheduledTime !== "string" ||
    !scheduledTimePattern.test(scheduledTime) ||
    Number.isNaN(Date.parse(scheduledTime))
  ) {
    return null;
  }
  return { scheduleId, scheduledTime };
}

/**
 * The occurrence's key (local date and time in the schedule's zone) when
 * `instant` is a valid occurrence of the stored schedule, else `null`.
 */
export function occurrenceOf(schedule: Schedule, instant: number) {
  if (schedule.type === "ONE_TIME") {
    return Math.abs(instant - Date.parse(schedule.startAt)) < minuteMs
      ? schedule.startLocal
      : null;
  }
  if (!schedule.recurrence) return null;
  if (instant < Date.parse(schedule.startAt)) return null;
  if (schedule.endAt && instant > Date.parse(schedule.endAt)) return null;
  if (!isOccurrence(schedule.recurrence, schedule.timeZone, instant)) {
    return null;
  }
  return formatLocal(toLocal(instant, schedule.timeZone));
}

/**
 * The M3 operation ID for an occurrence: deterministic, so its send records
 * are the same however often the occurrence is invoked.
 */
export function occurrenceOperationId(schedule: Schedule, occurrence: string) {
  const local = parseLocal(occurrence);
  const instant =
    (local && fromLocal(local, schedule.timeZone)) ??
    Date.parse(schedule.startAt);
  const hash = createHash("sha256")
    .update(`schedule:${schedule.id}:${occurrence}`)
    .digest("base64url")
    .slice(0, 22);
  return `${String(instant).padStart(13, "0")}.${hash}`;
}

export type FailureCategory =
  | "AUTHORIZATION"
  | "VALIDATION"
  | "LIMIT"
  | "REJECTED"
  | "TRANSIENT"
  | "UNCERTAIN";

const categories: Record<ScheduleFailureCode, FailureCategory> = {
  "user-inactive": "AUTHORIZATION",
  "sending-disabled": "AUTHORIZATION",
  "scheduling-disabled": "AUTHORIZATION",
  "sender-unavailable": "AUTHORIZATION",
  "not-connected": "AUTHORIZATION",
  "reauth-required": "AUTHORIZATION",
  "gmail-auth-failed": "AUTHORIZATION",
  "contacts-disabled": "AUTHORIZATION",
  "templates-disabled": "AUTHORIZATION",
  "bulk-disabled": "AUTHORIZATION",
  "template-not-found": "VALIDATION",
  "no-recipients": "VALIDATION",
  "recipient-not-found": "VALIDATION",
  "invalid-recipient": "VALIDATION",
  "unresolved-placeholder": "VALIDATION",
  "invalid-message": "VALIDATION",
  missed: "VALIDATION",
  "bulk-limit-exceeded": "LIMIT",
  "daily-limit-reached": "LIMIT",
  "daily-bulk-limit-reached": "LIMIT",
  "gmail-rejected": "REJECTED",
  "gmail-unavailable": "TRANSIENT",
  "gmail-rate-limited": "TRANSIENT",
  busy: "TRANSIENT",
  "not-attempted": "TRANSIENT",
  "scheduler-unavailable": "TRANSIENT",
  interrupted: "UNCERTAIN",
};

/**
 * How an occurrence failed. None is retried automatically: the occurrence
 * is final, and a recurring schedule simply continues with its next one.
 */
export function failureCategory(
  status: ScheduleRunStatus,
  code: ScheduleFailureCode | null,
): FailureCategory | null {
  if (status === "UNCERTAIN") return "UNCERTAIN";
  if (status !== "FAILED") return null;
  return code ? categories[code] : "VALIDATION";
}

function failure(code: ScheduleFailureCode, at: string): RunCompletion {
  return {
    status: "FAILED",
    failureCode: code,
    sent: 0,
    failed: 0,
    uncertain: 0,
    at,
  };
}

/** Sends the occurrence through M3, or explains why it was not sent. */
async function runOccurrence(
  deps: ExecutionDeps,
  schedule: Schedule,
  run: ScheduleRun,
  scheduledFor: number,
  now: Date,
): Promise<RunCompletion> {
  const clock = deps.clock ?? (() => new Date());
  if (now.getTime() - scheduledFor > occurrenceLatenessMs) {
    return failure("missed", now.toISOString());
  }
  const user = await deps.store.getUserById(schedule.userId);
  if (!user) return failure("user-inactive", now.toISOString());
  // The OWNER's switches apply to every occurrence, not only at creation.
  const settings = await getUserSettings(deps.store, schedule.userId);
  if (
    !settings.schedulingEnabled ||
    (schedule.type === "RECURRING" && !settings.recurringEnabled)
  ) {
    return failure("scheduling-disabled", now.toISOString());
  }

  let outcome;
  try {
    outcome = await sendEmail(
      deps,
      toPublicUser(user),
      {
        operationId: run.operationId,
        senderIdentityId: schedule.senderIdentityId,
        contactIds: schedule.contactIds,
        emails: schedule.emails,
        templateId: schedule.templateId,
        subject: schedule.subject,
        body: schedule.body,
      },
      now,
      { scheduleId: schedule.id },
    );
  } catch {
    // Whatever was reserved stays counted and is never resent.
    return {
      status: "UNCERTAIN",
      failureCode: "interrupted",
      sent: 0,
      failed: 0,
      uncertain: 0,
      at: clock().toISOString(),
    };
  }
  const at = clock().toISOString();
  if (!outcome.ok) return failure(outcome.reason, at);

  let sent = 0;
  let failed = 0;
  let uncertain = 0;
  let failureCode: ScheduleFailureCode | null = null;
  for (const result of outcome.results) {
    if (result.status === "SENT" || result.status === "ALREADY_SENT") {
      sent += 1;
    } else if (result.status === "FAILED") {
      failed += 1;
      failureCode ??= result.failureCode ?? "not-attempted";
    } else {
      uncertain += 1;
    }
  }
  if (uncertain > 0) {
    return {
      status: "UNCERTAIN",
      failureCode: "gmail-unavailable",
      sent,
      failed,
      uncertain,
      at,
    };
  }
  return failed > 0
    ? { status: "FAILED", failureCode, sent, failed, uncertain, at }
    : { status: "SENT", failureCode: null, sent, failed, uncertain, at };
}

/**
 * A one-time schedule ends after its occurrence. A recurring one moves to
 * its next occurrence after both the intended time and now, computed from
 * the recurrence, so a late run neither shifts the timeline nor backfills
 * missed occurrences; past its end it is COMPLETED.
 */
function advanceAfter(
  schedule: Schedule,
  completion: RunCompletion,
  scheduledFor: number,
  now: Date,
): ScheduleAdvance {
  if (schedule.type === "ONE_TIME" || !schedule.recurrence) {
    return {
      kind: "end",
      end: {
        status: completion.status === "SENT" ? "COMPLETED" : "FAILED",
        at: completion.at,
        failureCode: null,
      },
    };
  }
  const next = nextOccurrence(
    schedule.recurrence,
    schedule.timeZone,
    Math.max(scheduledFor, now.getTime()),
  );
  if (
    next === null ||
    (schedule.endAt !== null && next > Date.parse(schedule.endAt))
  ) {
    return {
      kind: "end",
      end: { status: "COMPLETED", at: completion.at, failureCode: null },
    };
  }
  return { kind: "next", nextRunAt: new Date(next).toISOString() };
}

/**
 * Validates and runs one invocation. The stored schedule is authoritative:
 * it must exist, be ACTIVE, and have an occurrence at the payload's time
 * that is due now; the occurrence is claimed only while the schedule is
 * still ACTIVE, so a cancellation that commits first stops it.
 */
export async function executeScheduledOccurrence(
  deps: ExecutionDeps,
  event: unknown,
  now: Date,
): Promise<ExecutionResult> {
  const { store } = deps;
  const removeTrigger = (schedule: Pick<Schedule, "triggerName">) =>
    deps.triggers?.remove(schedule).catch(() => undefined);

  const payload = parseTriggerPayload(event);
  if (!payload) return { outcome: "invalid-event" };

  const schedule = await store.findSchedule(payload.scheduleId);
  if (!schedule) {
    await removeTrigger({ triggerName: triggerNameFor(payload.scheduleId) });
    return { outcome: "not-found" };
  }
  if (schedule.status !== "ACTIVE") {
    await removeTrigger(schedule);
    return { outcome: "not-active" };
  }

  const scheduledFor = Date.parse(payload.scheduledTime);
  if (
    schedule.type === "RECURRING" &&
    schedule.endAt !== null &&
    scheduledFor > Date.parse(schedule.endAt)
  ) {
    await store.endSchedule(schedule, {
      status: "COMPLETED",
      at: now.toISOString(),
      failureCode: null,
    });
    await removeTrigger(schedule);
    return { outcome: "ended" };
  }
  const occurrence = occurrenceOf(schedule, scheduledFor);
  if (!occurrence) return { outcome: "invalid-occurrence" };
  if (scheduledFor > now.getTime() + earlyToleranceMs) {
    return { outcome: "not-due" };
  }

  const run: ScheduleRun = {
    scheduleId: schedule.id,
    userId: schedule.userId,
    occurrence,
    scheduledFor: new Date(scheduledFor).toISOString(),
    operationId: occurrenceOperationId(schedule, occurrence),
    status: "RESERVED",
    failureCode: null,
    sent: 0,
    failed: 0,
    uncertain: 0,
    createdAt: now.toISOString(),
    completedAt: null,
  };
  const claim = await store.claimScheduleRun(run);
  if (claim === "duplicate") {
    const previous = await store.getScheduleRun(
      schedule.userId,
      schedule.id,
      occurrence,
    );
    return { outcome: "duplicate", previous: previous?.status ?? null };
  }
  if (claim === "not-active") {
    await removeTrigger(schedule);
    return { outcome: "not-active" };
  }

  const completion = await runOccurrence(
    deps,
    schedule,
    run,
    scheduledFor,
    now,
  );
  const advance = advanceAfter(schedule, completion, scheduledFor, now);
  await store.finishScheduleRun(schedule, run, completion, advance);
  if (advance.kind === "end" && schedule.type === "RECURRING") {
    await removeTrigger(schedule);
  }
  await recordAudit(
    store,
    {
      subject: schedule.userId,
      actorId: null,
      action: "schedule.run",
      outcome: completion.status === "SENT" ? "success" : "failure",
      targetId: schedule.id,
      detail: {
        type: schedule.type,
        occurrence,
        status: completion.status,
        failureCode: completion.failureCode,
        category: failureCategory(completion.status, completion.failureCode),
        sent: completion.sent,
        failed: completion.failed,
        uncertain: completion.uncertain,
      },
    },
    deps.clock?.() ?? now,
  );
  return { outcome: completion.status, failureCode: completion.failureCode };
}
