import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { InvitationList } from "@/components/admin/InvitationList";
import { InviteForm } from "@/components/admin/InviteForm";
import { PageHeading } from "@/components/admin/PageHeading";
import { UserList } from "@/components/admin/UserList";
import { Link } from "@/components/ui/Link";
import { getAdminStore } from "@/lib/admin/getAdminStore";
import { requireOwner } from "@/lib/admin/session";
import { getUserAdministration } from "@/lib/admin/users";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const owner = await requireOwner();
  const store = getAdminStore();
  const administration = await getUserAdministration(store, owner, new Date());
  if (!administration) redirect("/admin");

  const { users, invitations, capacity } = administration;
  const full = capacity.used >= capacity.max;

  return (
    <AdminShell user={owner} current="users">
      <div className="grid gap-12">
        <PageHeading title="Users">
          <p>
            Current users:{" "}
            <span className="font-mono text-foreground">
              {capacity.users} / {capacity.max}
            </span>
            {capacity.pendingInvitations > 0 &&
              `, plus ${capacity.pendingInvitations} pending ${capacity.pendingInvitations === 1 ? "invitation" : "invitations"}`}
            .
          </p>
        </PageHeading>

        <section aria-labelledby="invite-heading">
          <h2 id="invite-heading" className="text-h3">
            Invite a user
          </h2>
          {full ? (
            <p className="mt-4 max-w-measure border-l-2 border-border-strong pl-3 text-body-sm">
              All {capacity.max} seats are in use, counting pending invitations.
              Revoke a pending invitation to invite someone else.
            </p>
          ) : (
            <div className="mt-4 max-w-measure">
              <InviteForm />
            </div>
          )}
        </section>

        <section aria-labelledby="users-heading">
          <h2 id="users-heading" className="text-h3">
            Accounts
          </h2>
          <div className="mt-4">
            <UserList users={users} />
          </div>
        </section>

        <p className="text-body-sm">
          Feature switches and limits per account are under{" "}
          <Link href="/admin/settings">Settings</Link>.
        </p>

        <section aria-labelledby="invitations-heading">
          <h2 id="invitations-heading" className="text-h3">
            Invitations
          </h2>
          <div className="mt-4">
            <InvitationList invitations={invitations} />
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
