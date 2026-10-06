import { StatusBadge } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/Button";
import { cancelScheduleAction } from "@/lib/admin/actions";
import { formatTimestamp } from "@/lib/admin/format";
import type { Schedule } from "@/lib/admin/model";
import { describeRecurrence, formatInZone } from "@/lib/admin/recurrence";
import {
  describeLastRun,
  describeScheduleFailure,
  effectiveScheduleStatus,
} from "@/lib/admin/schedules";

function recipientSummary(schedule: Schedule) {
  const count = schedule.contactIds.length + schedule.emails.length;
  const first = schedule.emails[0];
  if (count === 1 && first) return first;
  return `${count} ${count === 1 ? "recipient" : "recipients"}`;
}

/** The signed-in user's own schedules; ACTIVE ones can be cancelled. */
export function ScheduleList({
  schedules,
  now,
}: {
  schedules: Schedule[];
  now: Date;
}) {
  if (schedules.length === 0) {
    return (
      <p className="text-body-sm text-muted-foreground">No schedules yet.</p>
    );
  }

  return (
    <ul className="divide-y divide-border border-y border-border">
      {schedules.map((schedule) => {
        const status = effectiveScheduleStatus(schedule, now);
        const lastRun = describeLastRun(schedule);
        return (
          <li key={schedule.id} className="grid gap-3 py-5 text-body-sm">
            <div className="grid min-w-0 gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium break-words">
                  {schedule.subject}
                </span>
                <StatusBadge value={status} />
                <StatusBadge value={schedule.type} />
              </div>
              <p className="break-words">
                To {recipientSummary(schedule)} · from {schedule.senderEmail}
              </p>
              <p>
                {schedule.recurrence
                  ? `${describeRecurrence(schedule.recurrence)} (${schedule.timeZone})`
                  : `Once, ${formatInZone(schedule.startAt, schedule.timeZone)}`}
                {schedule.endAt &&
                  `, until ${formatInZone(schedule.endAt, schedule.timeZone)}`}
              </p>
              {schedule.nextRunAt && (
                <p>
                  Next send:{" "}
                  {formatInZone(schedule.nextRunAt, schedule.timeZone)}
                </p>
              )}
              {status === "OVERDUE" && (
                <p className="text-muted-foreground">
                  The scheduler has not run this send. Nothing is sent late;
                  cancel it if it is no longer needed.
                </p>
              )}
              {lastRun && schedule.lastRunAt && (
                <p className="text-muted-foreground">
                  Last run {formatTimestamp(schedule.lastRunAt)}: {lastRun}
                </p>
              )}
              {schedule.failureCode && (
                <p className="text-muted-foreground">
                  {describeScheduleFailure(schedule.failureCode)}
                </p>
              )}
              <p className="text-caption text-muted-foreground">
                {schedule.runCount} {schedule.runCount === 1 ? "run" : "runs"} ·
                created {formatTimestamp(schedule.createdAt)}
                {schedule.cancelledAt &&
                  ` · cancelled ${formatTimestamp(schedule.cancelledAt)}`}
                {schedule.completedAt &&
                  ` · ended ${formatTimestamp(schedule.completedAt)}`}
              </p>
            </div>
            {schedule.status === "ACTIVE" && (
              <form action={cancelScheduleAction}>
                <input type="hidden" name="scheduleId" value={schedule.id} />
                <Button type="submit" variant="secondary">
                  Cancel schedule{" "}
                  <span className="sr-only">{schedule.subject}</span>
                </Button>
              </form>
            )}
          </li>
        );
      })}
    </ul>
  );
}
