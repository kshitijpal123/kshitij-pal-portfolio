import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { OwnerOverview } from "@/components/admin/OwnerOverview";
import { PageHeading } from "@/components/admin/PageHeading";
import { ProfileSummary } from "@/components/admin/ProfileSummary";
import { getAdminStore } from "@/lib/admin/getAdminStore";
import { listSenderIdentitiesForReview } from "@/lib/admin/senderIdentities";
import { requireUser } from "@/lib/admin/session";
import { getUserAdministration } from "@/lib/admin/users";

export const metadata: Metadata = { title: "Console" };

export default async function DashboardPage() {
  const user = await requireUser();
  const store = getAdminStore();
  const [administration, senderRequests] = await Promise.all([
    getUserAdministration(store, user, new Date()),
    listSenderIdentitiesForReview(store, user),
  ]);

  return (
    <AdminShell user={user} current="dashboard">
      <div className="grid gap-10">
        <PageHeading title={`Welcome, ${user.name}`}>
          <p>
            Request the addresses you want to send from under Sender identities.
            Connecting Gmail is not available yet.
          </p>
        </PageHeading>
        <ProfileSummary user={user} />
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
