import {
  CreateScheduleCommand,
  DeleteScheduleCommand,
  SchedulerClient,
} from "@aws-sdk/client-scheduler";
import type { Schedule } from "@/lib/admin/model";
import { cronExpression } from "@/lib/admin/recurrence";

/*
 * EventBridge Scheduler is only the trigger: at each due time it invokes the
 * execution function with the schedule's ID and the intended time, and
 * nothing else. It holds no message, recipient, or sender; the function
 * loads all of that from DynamoDB. Nothing runs between occurrences.
 */

/** Seconds the invocation may wait or be retried by Scheduler. */
export const triggerMaxEventAgeSeconds = 3600;

/** What Scheduler passes to the execution function. */
export type TriggerPayload = { scheduleId: string; scheduledTime: string };

/** The Scheduler schedule's name for an application schedule. */
export function triggerNameFor(scheduleId: string) {
  return `mail-${scheduleId}`;
}

export type ScheduleTriggers = {
  /** Creates the trigger for an ACTIVE schedule; an existing one is kept. */
  create(schedule: Schedule): Promise<void>;
  /** Deletes the trigger; one already gone counts as deleted. */
  remove(schedule: Pick<Schedule, "triggerName">): Promise<void>;
};

export type SchedulerConfig = {
  /** The schedule group every trigger lives in. */
  groupName: string;
  /** ARN of the execution function. */
  targetArn: string;
  /** Role Scheduler assumes to invoke only that function. */
  roleArn: string;
};

function atExpression(iso: string) {
  return `at(${new Date(iso).toISOString().slice(0, 19)})`;
}

/**
 * The CreateSchedule request for a schedule. One-time schedules fire once
 * at their UTC instant; recurring ones use Scheduler's own recurrence in
 * the schedule's IANA zone, between its start and optional end. Both delete
 * themselves after their last invocation.
 */
export function createScheduleRequest(
  schedule: Schedule,
  config: SchedulerConfig,
) {
  const recurrence = schedule.type === "RECURRING" ? schedule.recurrence : null;
  const payload: TriggerPayload = {
    scheduleId: schedule.id,
    scheduledTime: "<aws.scheduler.scheduled-time>",
  };
  return {
    Name: schedule.triggerName,
    GroupName: config.groupName,
    ScheduleExpression: recurrence
      ? cronExpression(recurrence)
      : atExpression(schedule.startAt),
    ScheduleExpressionTimezone: recurrence ? schedule.timeZone : "UTC",
    ...(recurrence
      ? {
          // A minute early, so an occurrence exactly at the start fires.
          StartDate: new Date(Date.parse(schedule.startAt) - 60_000),
          ...(schedule.endAt ? { EndDate: new Date(schedule.endAt) } : {}),
        }
      : {}),
    FlexibleTimeWindow: { Mode: "OFF" as const },
    ActionAfterCompletion: "DELETE" as const,
    State: "ENABLED" as const,
    Target: {
      Arn: config.targetArn,
      RoleArn: config.roleArn,
      Input: JSON.stringify(payload),
      RetryPolicy: {
        MaximumRetryAttempts: 2,
        MaximumEventAgeInSeconds: triggerMaxEventAgeSeconds,
      },
    },
    ClientToken: schedule.id,
  };
}

function errorName(error: unknown) {
  return error instanceof Error ? error.name : "";
}

/** Deleting only; all the execution function itself may do. */
export function createAwsTriggerRemover(
  groupName: string,
  client: Pick<SchedulerClient, "send"> = new SchedulerClient({}),
): Pick<ScheduleTriggers, "remove"> {
  return {
    async remove(schedule) {
      try {
        await client.send(
          new DeleteScheduleCommand({
            Name: schedule.triggerName,
            GroupName: groupName,
          }),
        );
      } catch (error) {
        if (errorName(error) !== "ResourceNotFoundException") throw error;
      }
    },
  };
}

export function createAwsScheduleTriggers(
  config: SchedulerConfig,
  client: Pick<SchedulerClient, "send"> = new SchedulerClient({}),
): ScheduleTriggers {
  return {
    async create(schedule) {
      try {
        await client.send(
          new CreateScheduleCommand(createScheduleRequest(schedule, config)),
        );
      } catch (error) {
        // Same name: an earlier attempt of this creation already made it.
        if (errorName(error) !== "ConflictException") throw error;
      }
    },
    ...createAwsTriggerRemover(config.groupName, client),
  };
}

/**
 * Local development only: remembers triggers in this process and never
 * fires them, so schedules can be created and cancelled but nothing is
 * sent later.
 */
export function createMemoryScheduleTriggers() {
  const active = new Set<string>();
  const triggers: ScheduleTriggers = {
    async create(schedule) {
      active.add(schedule.triggerName);
    },
    async remove(schedule) {
      active.delete(schedule.triggerName);
    },
  };
  return { triggers, active };
}

export function getSchedulerConfig(
  env: Record<string, string | undefined> = process.env,
): SchedulerConfig | null {
  const groupName = env.SCHEDULER_GROUP_NAME?.trim();
  const targetArn = env.SCHEDULER_TARGET_ARN?.trim();
  const roleArn = env.SCHEDULER_ROLE_ARN?.trim();
  return groupName && targetArn && roleArn
    ? { groupName, targetArn, roleArn }
    : null;
}

let triggers: ScheduleTriggers | null | undefined;

/** Survives dev-server module reloads; never used in production. */
const devGlobal = globalThis as { adminScheduleTriggers?: ScheduleTriggers };

/**
 * EventBridge Scheduler when configured. Without it, production has no
 * triggers (scheduling reports itself unavailable), and development uses
 * the in-process stand-in that never fires.
 */
export function getScheduleTriggers(
  env: Record<string, string | undefined> = process.env,
): ScheduleTriggers | null {
  if (triggers !== undefined) return triggers;
  const config = getSchedulerConfig(env);
  if (config) {
    triggers = createAwsScheduleTriggers(config);
    return triggers;
  }
  if (env.NODE_ENV === "production") {
    triggers = null;
    return triggers;
  }
  if (!devGlobal.adminScheduleTriggers) {
    console.warn(
      "[admin] EventBridge Scheduler is not configured; schedules are kept in memory and never run.",
    );
    devGlobal.adminScheduleTriggers = createMemoryScheduleTriggers().triggers;
  }
  triggers = devGlobal.adminScheduleTriggers;
  return triggers;
}
