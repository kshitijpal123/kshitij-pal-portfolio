import { StatusBadge } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/Button";
import { reviewSenderIdentityAction } from "@/lib/admin/actions";
import { formatTimestamp } from "@/lib/admin/format";
import type { SenderIdentityForReview } from "@/lib/admin/senderIdentities";
import { adminLimits } from "@/lib/admin/validation";

function Requester({ identity }: { identity: SenderIdentityForReview }) {
  return (
    <p className="text-body-sm break-words text-muted-foreground">
      Requested by{" "}
      {identity.requester
        ? `${identity.requester.name} (${identity.requester.email})`
        : "an unknown user"}{" "}
      · {formatTimestamp(identity.requestedAt)}
    </p>
  );
}

function DecisionButton({
  identityId,
  decision,
  label,
  email,
}: {
  identityId: string;
  decision: "approve" | "disable";
  label: string;
  email: string;
}) {
  return (
    <form action={reviewSenderIdentityAction}>
      <input type="hidden" name="identityId" value={identityId} />
      <input type="hidden" name="decision" value={decision} />
      <Button
        type="submit"
        variant={decision === "approve" ? "primary" : "secondary"}
      >
        {label} <span className="sr-only">{email}</span>
      </Button>
    </form>
  );
}

/** OWNER review queue: approve or reject requests, disable approvals. */
export function SenderReviewList({
  identities,
  emptyMessage,
}: {
  identities: SenderIdentityForReview[];
  emptyMessage: string;
}) {
  if (identities.length === 0) {
    return <p className="text-body-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <ul className="divide-y divide-border border-y border-border">
      {identities.map((identity) => {
        const reasonId = `reason-${identity.id}`;
        return (
          <li key={identity.id} className="grid gap-4 py-5">
            <div className="min-w-0">
              <p className="font-medium break-words">{identity.email}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusBadge value={identity.provider} />
                <StatusBadge value={identity.status} />
              </div>
              <div className="mt-2">
                <Requester identity={identity} />
              </div>
              {identity.rejectionReason && (
                <p className="mt-2 text-body-sm">
                  Reason: {identity.rejectionReason}
                </p>
              )}
            </div>

            {identity.status === "REQUESTED" && (
              <div className="grid gap-4 md:grid-cols-3 md:items-end">
                <DecisionButton
                  identityId={identity.id}
                  decision="approve"
                  label="Approve"
                  email={identity.email}
                />
                <form
                  action={reviewSenderIdentityAction}
                  className="grid gap-3 sm:flex sm:items-end md:col-span-2"
                >
                  <input type="hidden" name="identityId" value={identity.id} />
                  <input type="hidden" name="decision" value="reject" />
                  <div className="min-w-0 flex-1">
                    <label
                      htmlFor={reasonId}
                      className="block text-body-sm font-medium"
                    >
                      Rejection reason (optional)
                    </label>
                    <input
                      id={reasonId}
                      name="reason"
                      type="text"
                      maxLength={adminLimits.rejectionReason.max}
                      className="mt-2 block min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-body text-foreground transition-colors hover:border-foreground"
                    />
                  </div>
                  <Button type="submit" variant="secondary">
                    Reject <span className="sr-only">{identity.email}</span>
                  </Button>
                </form>
              </div>
            )}

            {identity.status === "APPROVED" && (
              <DecisionButton
                identityId={identity.id}
                decision="disable"
                label="Disable"
                email={identity.email}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
