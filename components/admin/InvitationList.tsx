import { StatusBadge } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/Button";
import { revokeInvitationAction } from "@/lib/admin/actions";
import { formatTimestamp } from "@/lib/admin/format";
import type { PublicInvitation } from "@/lib/admin/model";

function detail(invitation: PublicInvitation) {
  switch (invitation.status) {
    case "ACCEPTED":
      return `Accepted ${formatTimestamp(invitation.acceptedAt ?? invitation.createdAt)}`;
    case "REVOKED":
      return `Revoked ${formatTimestamp(invitation.revokedAt ?? invitation.createdAt)}`;
    case "EXPIRED":
      return `Expired ${formatTimestamp(invitation.expiresAt)}`;
    default:
      return `Expires ${formatTimestamp(invitation.expiresAt)}`;
  }
}

export function InvitationList({
  invitations,
}: {
  invitations: PublicInvitation[];
}) {
  if (invitations.length === 0) {
    return <p className="text-body-sm text-muted-foreground">None yet.</p>;
  }

  return (
    <ul className="divide-y divide-border border-y border-border">
      {invitations.map((invitation) => (
        <li
          key={invitation.id}
          className="grid gap-3 py-4 sm:grid-cols-3 sm:items-center"
        >
          <div className="min-w-0 sm:col-span-2">
            <p className="font-medium break-words">{invitation.email}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge value={invitation.status} />
            </div>
            <p className="mt-2 text-caption text-muted-foreground">
              Created {formatTimestamp(invitation.createdAt)} ·{" "}
              {detail(invitation)}
            </p>
          </div>
          {invitation.status === "PENDING" && (
            <form
              action={revokeInvitationAction}
              className="sm:justify-self-end"
            >
              <input type="hidden" name="invitationId" value={invitation.id} />
              <Button type="submit" variant="secondary">
                Revoke{" "}
                <span className="sr-only">
                  invitation for {invitation.email}
                </span>
              </Button>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}
