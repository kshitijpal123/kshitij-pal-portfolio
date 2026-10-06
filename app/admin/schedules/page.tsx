import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { GmailReadiness } from "@/components/admin/GmailReadiness";
import { PageHeading } from "@/components/admin/PageHeading";
import { ScheduleForm } from "@/components/admin/ScheduleForm";
import { ScheduleList } from "@/components/admin/ScheduleList";
import { Link } from "@/components/ui/Link";
import { listOwnContacts } from "@/lib/admin/contacts";
import { getAdminStore } from "@/lib/admin/getAdminStore";
import { listGmailAccounts } from "@/lib/admin/gmailConnections";
import { selectableTimeZones } from "@/lib/admin/recurrence";
import { getScheduleTriggers } from "@/lib/admin/scheduler";
import { listOwnSchedules } from "@/lib/admin/schedules";
import { requireUser } from "@/lib/admin/session";
import { getUserSettings } from "@/lib/admin/settings";
import { listOwnTemplates } from "@/lib/admin/templates";

export const metadata: Metadata = { title: "Schedules" };

export default async function SchedulesPage() {
  const user = await requireUser();
  const store = getAdminStore();
  const now = new Date();
  const [settings, accounts, schedules, counts] = await Promise.all([
    getUserSettings(store, user.id),
    listGmailAccounts(store, user),
    listOwnSchedules(store, user),
    store.getScheduleCounts(user.id),
  ]);
  const [contacts, templates] = await Promise.all([
    settings.contactsEnabled ? listOwnContacts(store, user) : [],
    settings.templatesEnabled ? listOwnTemplates(store, user) : [],
  ]);
  const senders = accounts
    .filter((account) => account.usable)
    .map((account) => ({
      id: account.identity.id,
      email: account.identity.email,
    }));
  const maxRecipients = settings.bulkSendingEnabled
    ? settings.maxBulkRecipientsPerOperation
    : 1;
  const configured = getScheduleTriggers() !== null;
  const full = counts.active >= settings.maxScheduledEmails;

  return (
    <AdminShell user={user} current="schedules">
      <div className="grid gap-12">
        <PageHeading title="Schedules">
          <p>
            Send a message later, once or on a repeating timetable. Each send
            goes through your Gmail account with the same checks and daily
            limits as sending now, applied again at the time it runs.
          </p>
        </PageHeading>

        <section aria-labelledby="schedule-limits-heading">
          <h2 id="schedule-limits-heading" className="text-h3">
            Scheduling limits
          </h2>
          <p className="mt-2 max-w-measure text-body-sm text-muted-foreground">
            Set by the owner. Cancelled and finished schedules free their place.
            A schedule cannot be edited; cancel it and create a new one.
          </p>
          <dl className="mt-4 grid gap-4 text-body-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Active schedules</dt>
              <dd className="mt-1 font-mono">
                {counts.active} / {settings.maxScheduledEmails}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Active repeating</dt>
              <dd className="mt-1 font-mono">
                {counts.recurring} / {settings.maxRecurringSchedules}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">First send within</dt>
              <dd className="mt-1 font-mono">
                {settings.maxFutureSchedulingWindowDays} days
              </dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="schedule-new-heading">
          <h2 id="schedule-new-heading" className="text-h3">
            New schedule
          </h2>
          <div className="mt-4">
            <GmailReadiness accounts={accounts} />
          </div>
          <div className="mt-6 max-w-measure">
            {!configured ? (
              <p className="border-l-2 border-border-strong pl-3 text-body-sm">
                Scheduling is not configured on this server.
              </p>
            ) : !settings.sendingEnabled ? (
              <p className="border-l-2 border-border-strong pl-3 text-body-sm">
                Sending is turned off for your account by the owner.
              </p>
            ) : full ? (
              <p className="border-l-2 border-border-strong pl-3 text-body-sm">
                You have reached your limit of active schedules. Cancel one
                below to schedule another.
              </p>
            ) : senders.length === 0 ? (
              <p className="border-l-2 border-border-strong pl-3 text-body-sm">
                You need an approved sender identity with Gmail connected before
                you can schedule. Request one under{" "}
                <Link href="/admin/senders">Sender identities</Link>, then
                connect it from the <Link href="/admin">dashboard</Link>.
              </p>
            ) : (
              <ScheduleForm
                senders={senders}
                contacts={contacts.map(({ id, name, email, company }) => ({
                  id,
                  name,
                  email,
                  company,
                }))}
                templates={templates.map(({ id, name, subject, body }) => ({
                  id,
                  name,
                  subject,
                  body,
                }))}
                bulkEnabled={settings.bulkSendingEnabled}
                maxRecipients={maxRecipients}
                timeZones={selectableTimeZones()}
                windowDays={settings.maxFutureSchedulingWindowDays}
                recurringAllowed={
                  counts.recurring < settings.maxRecurringSchedules
                }
              />
            )}
          </div>
        </section>

        <section aria-labelledby="schedule-list-heading">
          <h2 id="schedule-list-heading" className="text-h3">
            Your schedules
          </h2>
          <div className="mt-4">
            <ScheduleList schedules={schedules} now={now} />
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
