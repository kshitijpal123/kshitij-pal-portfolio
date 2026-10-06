import { StatusBadge } from "@/components/admin/StatusBadge";
import { formatTimestamp } from "@/lib/admin/format";
import type { SenderIdentity } from "@/lib/admin/model";

/** The signed-in user's own sender identities. */
export function SenderIdentityList({
  identities,
}: {
  identities: SenderIdentity[];
}) {
  if (identities.length === 0) {
    return (
      <p className="text-body-sm text-muted-foreground">
        You have not requested any sender identities yet.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border border-y border-border">
      {identities.map((identity) => (
        <li key={identity.id} className="py-4">
          <p className="font-medium break-words">{identity.email}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge value={identity.provider} />
            <StatusBadge value={identity.status} />
          </div>
          <p className="mt-2 text-caption text-muted-foreground">
            Requested {formatTimestamp(identity.requestedAt)}
            {identity.reviewedAt &&
              ` · Reviewed ${formatTimestamp(identity.reviewedAt)}`}
          </p>
          {identity.rejectionReason && (
            <p className="mt-2 text-body-sm">
              Reason: {identity.rejectionReason}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
