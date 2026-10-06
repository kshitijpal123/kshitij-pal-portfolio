import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { FormStatus } from "@/components/admin/FormStatus";
import { GmailAccountList } from "@/components/admin/GmailAccountList";
import { OwnerOverview } from "@/components/admin/OwnerOverview";
import { PageHeading } from "@/components/admin/PageHeading";
import { ProfileSummary } from "@/components/admin/ProfileSummary";
import { getAdminStore } from "@/lib/admin/getAdminStore";
import { gmailNotice, listGmailAccounts } from "@/lib/admin/gmailConnections";
import { listSenderIdentitiesForReview } from "@/lib/admin/senderIdentities";
import { requireUser } from "@/lib/admin/session";
import { getUserAdministration } from "@/lib/admin/users";

export const metadata: Metadata = { title: "Console" };

export default async function DashboardPage({
  searchParams,
}: PageProps<"/admin">) {
  const user = await requireUser();
  const store = getAdminStore();
  const [administration, senderRequests, gmailAccounts, query] =
    await Promise.all([
      getUserAdministration(store, user, new Date()),
      listSenderIdentitiesForReview(store, user),
      listGmailAccounts(store, user),
      searchParams,
    ]);
  const notice = gmailNotice(query.gmail);

  return (
    <AdminShell user={user} current="dashboard">
      <div className="grid gap-10">
        <PageHeading title={`Welcome, ${user.name}`}>
          <p>
            Request the addresses you want to send from under Sender identities.
            Once the owner approves one, connect its Gmail account below.
          </p>
        </PageHeading>
        <ProfileSummary user={user} />
        <section aria-labelledby="gmail-heading">
          <h2 id="gmail-heading" className="text-h3">
            Gmail accounts
          </h2>
          <p className="mt-2 max-w-measure text-body-sm text-muted-foreground">
            Sending from an address needs both the owner&apos;s approval of the
            sender identity and your own Google authorization through Connect
            Gmail. Neither replaces the other. The console asks Google only for
            permission to send email, never to read it.
          </p>
          <FormStatus state={notice ?? { status: "idle" }} />
          <div className="mt-4">
            <GmailAccountList accounts={gmailAccounts} />
          </div>
        </section>
        {administration && senderRequests && (
          <OwnerOverview
            capacity={administration.capacity}
            pendingSenderRequests={
              senderRequests.filter(
                (identity) => identity.status === "REQUESTED",
              ).length
            }
          />
        )}
      </div>
    </AdminShell>
  );
}
