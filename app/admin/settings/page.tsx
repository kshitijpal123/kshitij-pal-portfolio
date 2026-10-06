import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { featureSwitches } from "@/components/admin/DashboardOverview";
import { PageHeading } from "@/components/admin/PageHeading";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { UserSettingsForm } from "@/components/admin/UserSettingsForm";
import { Button } from "@/components/ui/Button";
import { setUserStatusAction } from "@/lib/admin/actions";
import { getAdminStore } from "@/lib/admin/getAdminStore";
import { requireUser } from "@/lib/admin/session";
import {
  defaultUserSettings,
  getUserSettings,
  listUserSettings,
} from "@/lib/admin/settings";
import { getUserAdministration } from "@/lib/admin/users";

export const metadata: Metadata = { title: "Settings" };

/*
 * Everyone sees their own effective settings. Only the OWNER gets the
 * configuration forms; the actions refuse anyone else regardless.
 */
export default async function SettingsPage() {
  const user = await requireUser();
  const store = getAdminStore();
  const [settings, administration, allSettings] = await Promise.all([
    getUserSettings(store, user.id),
    getUserAdministration(store, user, new Date()),
    listUserSettings(store, user),
  ]);
  const limits = [
    { label: "Emails per day", value: settings.dailyTotalEmails },
    { label: "Bulk recipients per day", value: settings.dailyBulkRecipients },
    {
      label: "Recipients per bulk send",
      value: settings.maxBulkRecipientsPerOperation,
    },
    { label: "Active schedules", value: settings.maxScheduledEmails },
    {
      label: "Active repeating schedules",
      value: settings.maxRecurringSchedules,
    },
    {
      label: "Schedule ahead (days)",
      value: settings.maxFutureSchedulingWindowDays,
    },
  ];

  return (
    <AdminShell user={user} current="settings">
      <div className="grid gap-12">
        <PageHeading title="Settings">
          <p>
            Feature switches and the console&apos;s own safety limits. Daily
            limits reset at 00:00 UTC. They are not Google&apos;s Gmail quotas,
            which Google enforces separately.
          </p>
        </PageHeading>

        <section aria-labelledby="own-settings-heading">
          <h2 id="own-settings-heading" className="text-h3">
            Your settings
          </h2>
          <p className="mt-2 max-w-measure text-body-sm text-muted-foreground">
            Set by the owner and enforced on the server for every send and
            schedule.
          </p>
          <dl className="mt-4 grid gap-4 text-body-sm sm:grid-cols-3">
            {featureSwitches.map((feature) => (
              <div key={feature.name}>
                <dt className="text-muted-foreground">{feature.label}</dt>
                <dd className="mt-1 font-medium">
                  {settings[feature.name] ? "On" : "Off"}
                </dd>
              </div>
            ))}
            {limits.map((limit) => (
              <div key={limit.label}>
                <dt className="text-muted-foreground">{limit.label}</dt>
                <dd className="mt-1 font-mono">{limit.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {administration && allSettings && (
          <section aria-labelledby="settings-heading">
            <h2 id="settings-heading" className="text-h3">
              Account configuration
            </h2>
            <p className="mt-2 max-w-measure text-body-sm text-muted-foreground">
              Per account. Roles are fixed: one owner, everyone else a user.
              Defaults: {defaultUserSettings.dailyTotalEmails} emails and{" "}
              {defaultUserSettings.dailyBulkRecipients} bulk recipients per day,{" "}
              {defaultUserSettings.maxBulkRecipientsPerOperation} recipients per
              bulk send; {defaultUserSettings.maxScheduledEmails} active
              schedules, of which {defaultUserSettings.maxRecurringSchedules}{" "}
              repeating, with the first send at most{" "}
              {defaultUserSettings.maxFutureSchedulingWindowDays} days ahead.
            </p>
            <ul className="mt-4 divide-y divide-border border-y border-border">
              {administration.users.map((account) => {
                const accountSettings = allSettings.get(account.id);
                return accountSettings ? (
                  <li key={account.id} className="grid gap-3 py-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium break-words">
                        {account.name}{" "}
                        <span className="font-normal text-muted-foreground">
                          {account.email}
                        </span>
                      </p>
                      <StatusBadge value={account.role} />
                      <StatusBadge value={account.status} />
                    </div>
                    {account.role === "USER" && (
                      <form action={setUserStatusAction}>
                        <input type="hidden" name="userId" value={account.id} />
                        <input
                          type="hidden"
                          name="status"
                          value={
                            account.status === "ACTIVE" ? "DISABLED" : "ACTIVE"
                          }
                        />
                        <Button type="submit" variant="secondary">
                          {account.status === "ACTIVE"
                            ? "Disable account"
                            : "Re-enable account"}{" "}
                          <span className="sr-only">{account.name}</span>
                        </Button>
                      </form>
                    )}
                    <UserSettingsForm
                      settings={accountSettings}
                      userName={account.name}
                    />
                  </li>
                ) : null;
              })}
            </ul>
          </section>
        )}
      </div>
    </AdminShell>
  );
}
