import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeading } from "@/components/admin/PageHeading";
import { SenderIdentityList } from "@/components/admin/SenderIdentityList";
import { SenderRequestForm } from "@/components/admin/SenderRequestForm";
import { getAdminStore } from "@/lib/admin/getAdminStore";
import { listOwnSenderIdentities } from "@/lib/admin/senderIdentities";
import { requireUser } from "@/lib/admin/session";

export const metadata: Metadata = { title: "Sender identities" };

export default async function SendersPage() {
  const user = await requireUser();
  const identities = await listOwnSenderIdentities(getAdminStore(), user);

  return (
    <AdminShell user={user} current="senders">
      <div className="grid gap-12">
        <PageHeading title="Sender identities">
          <p>
            Ask the owner to approve the Gmail addresses you want to send from.
            Approval only authorizes an address for your account here; it does
            not connect Gmail. Once an address is approved, connect its Gmail
            account from the dashboard.
          </p>
        </PageHeading>

        <section aria-labelledby="request-heading">
          <h2 id="request-heading" className="text-h3">
            Request an address
          </h2>
          <div className="mt-4 max-w-measure">
            <SenderRequestForm />
          </div>
        </section>

        <section aria-labelledby="identities-heading">
          <h2 id="identities-heading" className="text-h3">
            Your requests
          </h2>
          <div className="mt-4">
            <SenderIdentityList identities={identities} />
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
