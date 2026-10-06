import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { ComposeForm } from "@/components/admin/ComposeForm";
import { GmailReadiness } from "@/components/admin/GmailReadiness";
import { PageHeading } from "@/components/admin/PageHeading";
import { SendHistory } from "@/components/admin/SendHistory";
import { Link } from "@/components/ui/Link";
import { listOwnContacts } from "@/lib/admin/contacts";
import { getAdminStore } from "@/lib/admin/getAdminStore";
import { listGmailAccounts } from "@/lib/admin/gmailConnections";
import { newOperationId } from "@/lib/admin/sending";
import { requireUser } from "@/lib/admin/session";
import { getOwnSendingAllowance } from "@/lib/admin/settings";
import { listOwnTemplates } from "@/lib/admin/templates";

export const metadata: Metadata = { title: "Compose" };

const historySize = 20;

export default async function ComposePage() {
  const user = await requireUser();
  const store = getAdminStore();
  const now = new Date();
  const [{ settings, usage }, accounts, history] = await Promise.all([
    getOwnSendingAllowance(store, user, now),
    listGmailAccounts(store, user),
    store.listRecentSendRecords(user.id, historySize),
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

  return (
    <AdminShell user={user} current="compose">
      <div className="grid gap-12">
        <PageHeading title="Compose">
          <p>
            Sends through your own Gmail account, so each message appears in its
            Sent folder. Every recipient gets a separate message.
          </p>
        </PageHeading>

        <section aria-labelledby="limits-heading">
          <h2 id="limits-heading" className="text-h3">
            Today&apos;s limits
          </h2>
          <p className="mt-2 max-w-measure text-body-sm text-muted-foreground">
            The console&apos;s own safety limits for your account, set by the
            owner and reset at 00:00 UTC. Google applies its own Gmail limits
            separately.
          </p>
          <dl className="mt-4 grid gap-4 text-body-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Emails today</dt>
              <dd className="mt-1 font-mono">
                {usage.total} / {settings.dailyTotalEmails}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Bulk recipients today</dt>
              <dd className="mt-1 font-mono">
                {settings.bulkSendingEnabled
                  ? `${usage.bulk} / ${settings.dailyBulkRecipients}`
                  : "Off"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Recipients per send</dt>
              <dd className="mt-1 font-mono">{maxRecipients}</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="compose-heading">
          <h2 id="compose-heading" className="text-h3">
            New message
          </h2>
          <div className="mt-4">
            <GmailReadiness accounts={accounts} />
          </div>
          <div className="mt-6 max-w-measure">
            {!settings.sendingEnabled ? (
              <p className="border-l-2 border-border-strong pl-3 text-body-sm">
                Sending is turned off for your account by the owner.
              </p>
            ) : senders.length === 0 ? (
              <p className="border-l-2 border-border-strong pl-3 text-body-sm">
                You need an approved sender identity with Gmail connected before
                you can send. Request one under{" "}
                <Link href="/admin/senders">Sender identities</Link>, then
                connect it from the <Link href="/admin">dashboard</Link>.
              </p>
            ) : (
              <ComposeForm
                operationId={newOperationId(now)}
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
              />
            )}
          </div>
        </section>

        <section aria-labelledby="history-heading">
          <h2 id="history-heading" className="text-h3">
            Recent sends
          </h2>
          <div className="mt-4">
            <SendHistory records={history} />
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
