import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeading } from "@/components/admin/PageHeading";
import { SenderReviewList } from "@/components/admin/SenderReviewList";
import { getAdminStore } from "@/lib/admin/getAdminStore";
import { listSenderIdentitiesForReview } from "@/lib/admin/senderIdentities";
import { requireOwner } from "@/lib/admin/session";

export const metadata: Metadata = { title: "Approvals" };

export default async function ApprovalsPage() {
  const owner = await requireOwner();
  const identities = await listSenderIdentitiesForReview(
    getAdminStore(),
    owner,
  );
  if (!identities) redirect("/admin");

  const requested = identities.filter(
    (identity) => identity.status === "REQUESTED",
  );
  const reviewed = identities.filter(
    (identity) => identity.status !== "REQUESTED",
  );

  return (
    <AdminShell user={owner} current="approvals">
      <div className="grid gap-12">
        <PageHeading title="Sender identity approvals">
          <p>
            Approving an address lets that user send as it once they connect
            Gmail themselves. Approval is not Gmail authorization.
          </p>
        </PageHeading>

        <section aria-labelledby="requested-heading">
          <h2 id="requested-heading" className="text-h3">
            Awaiting review
          </h2>
          <div className="mt-4">
            <SenderReviewList
              identities={requested}
              emptyMessage="No requests are waiting."
            />
          </div>
        </section>

        <section aria-labelledby="reviewed-heading">
          <h2 id="reviewed-heading" className="text-h3">
            Reviewed
          </h2>
          <div className="mt-4">
            <SenderReviewList
              identities={reviewed}
              emptyMessage="Nothing reviewed yet."
            />
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
