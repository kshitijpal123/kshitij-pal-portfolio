import { StatusBadge } from "@/components/admin/StatusBadge";
import { Link } from "@/components/ui/Link";
import type { OwnerDashboard } from "@/lib/admin/dashboard";

/**
 * OWNER only: each account's status, today's counters against its limits,
 * and schedule counts. Numbers only; no user's mail content.
 */
export function AccountsOverview({ overview }: { overview: OwnerDashboard }) {
  return (
    <section aria-labelledby="accounts-overview-heading">
      <h2 id="accounts-overview-heading" className="text-h3">
        Accounts overview
      </h2>
      <p className="mt-2 max-w-measure text-body-sm text-muted-foreground">
        {overview.active} active, {overview.disabled} disabled. Counters are for
        today (UTC).
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-body-sm">
          <thead className="border-b border-border text-muted-foreground">
            <tr>
              <th scope="col" className="py-2 pr-4 font-normal">
                Account
              </th>
              <th scope="col" className="py-2 pr-4 font-normal">
                Status
              </th>
              <th scope="col" className="py-2 pr-4 font-normal">
                Emails today
              </th>
              <th scope="col" className="py-2 pr-4 font-normal">
                Bulk today
              </th>
              <th scope="col" className="py-2 font-normal">
                Active schedules
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {overview.accounts.map(({ user, settings, usage, schedules }) => (
              <tr key={user.id}>
                <th scope="row" className="py-3 pr-4 font-medium">
                  <span className="block break-words">{user.name}</span>
                  <span className="block font-normal break-words text-muted-foreground">
                    {user.email}
                  </span>
                </th>
                <td className="py-3 pr-4">
                  <StatusBadge value={user.status} />
                </td>
                <td className="py-3 pr-4 font-mono">
                  {usage.total} of {settings.dailyTotalEmails}
                </td>
                <td className="py-3 pr-4 font-mono">
                  {usage.bulk} of {settings.dailyBulkRecipients}
                </td>
                <td className="py-3 font-mono">
                  {schedules.active} of {settings.maxScheduledEmails}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-body-sm">
        <Link href="/admin/settings">Configure accounts</Link>
      </p>
    </section>
  );
}
