import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { InvitationList } from "@/components/admin/InvitationList";
import { InviteForm } from "@/components/admin/InviteForm";
import { PageHeading } from "@/components/admin/PageHeading";
import { UserList } from "@/components/admin/UserList";
import { UserSettingsForm } from "@/components/admin/UserSettingsForm";
import { getAdminStore } from "@/lib/admin/getAdminStore";
import { requireOwner } from "@/lib/admin/session";
import { defaultUserSettings, listUserSettings } from "@/lib/admin/settings";
import { getUserAdministration } from "@/lib/admin/users";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const owner = await requireOwner();
  const store = getAdminStore();
  const [administration, settings] = await Promise.all([
    getUserAdministration(store, owner, new Date()),
    listUserSettings(store, owner),
  ]);
  if (!administration || !settings) redirect("/admin");

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

        <section aria-labelledby="settings-heading">
          <h2 id="settings-heading" className="text-h3">
            Sending settings
          </h2>
          <p className="mt-2 max-w-measure text-body-sm text-muted-foreground">
            Feature switches and the console&apos;s own daily safety limits per
            account, reset at 00:00 UTC. They are not Google&apos;s Gmail
            quotas, which Google enforces separately. Defaults:{" "}
            {defaultUserSettings.dailyTotalEmails} emails and{" "}
            {defaultUserSettings.dailyBulkRecipients} bulk recipients per day,{" "}
            {defaultUserSettings.maxBulkRecipientsPerOperation} recipients per
            bulk send.
          </p>
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {users.map((user) => {
              const userSettings = settings.get(user.id);
              return userSettings ? (
                <li key={user.id} className="grid gap-3 py-5">
                  <p className="font-medium break-words">
                    {user.name}{" "}
                    <span className="font-normal text-muted-foreground">
                      {user.email}
                    </span>
                  </p>
                  <UserSettingsForm
                    settings={userSettings}
                    userName={user.name}
                  />
                </li>
              ) : null;
            })}
          </ul>
        </section>

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
