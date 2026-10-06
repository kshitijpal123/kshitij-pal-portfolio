import { SendHistory } from "@/components/admin/SendHistory";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Link } from "@/components/ui/Link";
import { Surface } from "@/components/ui/Surface";
import type { Dashboard } from "@/lib/admin/dashboard";
import type { UserSettings } from "@/lib/admin/model";
import { formatInZone } from "@/lib/admin/recurrence";
import { effectiveScheduleStatus } from "@/lib/admin/schedules";
import { describeFailureCode } from "@/lib/admin/sending";

export const featureSwitches = [
  { name: "sendingEnabled", label: "Sending" },
  { name: "bulkSendingEnabled", label: "Bulk sending" },
  { name: "schedulingEnabled", label: "Scheduling" },
  { name: "recurringEnabled", label: "Repeating schedules" },
  { name: "contactsEnabled", label: "Contacts" },
  { name: "templatesEnabled", label: "Templates" },
] as const satisfies readonly { name: keyof UserSettings; label: string }[];

/** The signed-in user's own usage, limits, readiness, and recent sends. */
export function DashboardOverview({
  dashboard,
  now,
}: {
  dashboard: Dashboard;
  now: Date;
}) {
  const { settings, usage, remaining, senders, schedules, attention } =
    dashboard;
  const connected = dashboard.gmailAccounts.filter(
    (account) => account.usable,
  ).length;
  const stats = [
    {
      label: "Emails sent today",
      value: `${usage.total} / ${settings.dailyTotalEmails}`,
      note: `${remaining.total} remaining`,
    },
    {
      label: "Bulk recipients today",
      value: `${usage.bulk} / ${settings.dailyBulkRecipients}`,
      note: `${remaining.bulk} remaining`,
    },
    {
      label: "Ready to send from",
      value: String(connected),
      note: `${senders.approved} approved, ${senders.requested} awaiting review`,
    },
    {
      label: "Active schedules",
      value: `${schedules.active} / ${settings.maxScheduledEmails}`,
      note: `${schedules.recurring} repeating of ${settings.maxRecurringSchedules}`,
    },
  ];
  const needsAttention =
    attention.sends.length +
      attention.reconnect.length +
      attention.schedules.length >
    0;

  return (
    <>
      <section aria-labelledby="usage-heading">
        <h2 id="usage-heading" className="text-h3">
          Today
        </h2>
        <p className="mt-2 max-w-measure text-body-sm text-muted-foreground">
          The console&apos;s own daily limits, set by the owner and reset at
          00:00 UTC. Google applies its own Gmail limits separately.
        </p>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {stats.map((stat) => (
            <li key={stat.label}>
              <Surface className="h-full">
                <p className="text-body-sm text-muted-foreground">
                  {stat.label}
                </p>
                <p className="mt-2 font-mono text-h2">{stat.value}</p>
                <p className="mt-1 text-body-sm text-muted-foreground">
                  {stat.note}
                </p>
              </Surface>
            </li>
          ))}
        </ul>
        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-body-sm">
          {featureSwitches.map((feature) => (
            <div key={feature.name} className="flex gap-2">
              <dt className="text-muted-foreground">{feature.label}</dt>
              <dd className="font-medium">
                {settings[feature.name] ? "On" : "Off"}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-body-sm">
          <Link href="/admin/settings">All your settings and limits</Link>
        </p>
      </section>

      <section aria-labelledby="attention-heading">
        <h2 id="attention-heading" className="text-h3">
          Needs attention
        </h2>
        {!needsAttention ? (
          <p className="mt-4 text-body-sm text-muted-foreground">
            Nothing needs attention.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {attention.reconnect.map((account) => (
              <li key={account.identity.id} className="py-3 text-body-sm">
                Gmail needs to be reconnected for{" "}
                <span className="font-medium break-words">
                  {account.identity.email}
                </span>
                . Use Connect Gmail below.
              </li>
            ))}
            {attention.sends.map((record) => (
              <li key={record.id} className="grid gap-1 py-3 text-body-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium break-words">
                    {record.recipient}
                  </span>
                  <StatusBadge value={record.status} />
                </div>
                <p className="text-muted-foreground">
                  {record.status === "UNCERTAIN"
                    ? "Gmail may have delivered this. It is never resent automatically; check the Sent folder in Gmail."
                    : record.failureCode
                      ? describeFailureCode(record.failureCode)
                      : "No result was recorded."}
                </p>
                <Link
                  href={`/admin/history/${record.operationId}`}
                  className="w-fit"
                >
                  Review{" "}
                  <span className="sr-only">
                    the send to {record.recipient}
                  </span>
                </Link>
              </li>
            ))}
            {attention.schedules.map((schedule) => (
              <li key={schedule.id} className="grid gap-1 py-3 text-body-sm">
                <p>
                  Schedule{" "}
                  <span className="font-medium break-words">
                    {schedule.subject}
                  </span>
                  {schedule.status === "FAILED"
                    ? " stopped after a failure."
                    : effectiveScheduleStatus(schedule, now) === "OVERDUE" &&
                        schedule.nextRunAt
                      ? ` has not run since ${formatInZone(schedule.nextRunAt, schedule.timeZone)}.`
                      : " had a problem on its last run."}
                </p>
                <Link href="/admin/schedules" className="w-fit">
                  View schedules{" "}
                  <span className="sr-only">for {schedule.subject}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="recent-heading">
        <h2 id="recent-heading" className="text-h3">
          Recent sends
        </h2>
        <div className="mt-4">
          <SendHistory records={dashboard.recent} />
        </div>
        <p className="mt-3 text-body-sm">
          <Link href="/admin/history">Search all sends</Link>
        </p>
      </section>
    </>
  );
}
