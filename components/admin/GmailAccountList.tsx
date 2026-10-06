import type { ReactNode } from "react";
import { GmailConnectButton } from "@/components/admin/GmailConnectButton";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/Button";
import {
  disconnectGmailAction,
  startGmailConnectionAction,
  verifyGmailConnectionAction,
} from "@/lib/admin/actions";
import { formatTimestamp } from "@/lib/admin/format";
import type { GmailAccount } from "@/lib/admin/gmailConnections";

function ConnectionDates({ account }: { account: GmailAccount }) {
  const { connection } = account;
  if (!connection) return null;
  const parts =
    connection.status === "DISCONNECTED" && connection.disconnectedAt
      ? [`Disconnected ${formatTimestamp(connection.disconnectedAt)}`]
      : [
          `Connected ${formatTimestamp(connection.connectedAt)}`,
          connection.lastValidatedAt &&
            `Last checked ${formatTimestamp(connection.lastValidatedAt)}`,
        ];
  return (
    <p className="mt-2 text-caption text-muted-foreground">
      {parts.filter(Boolean).join(" · ")}
    </p>
  );
}

function readiness(account: GmailAccount) {
  if (account.usable) return "Approved by the owner and authorized by Google.";
  if (account.identity.status !== "APPROVED") {
    return "Not usable: the owner no longer approves this address.";
  }
  if (account.connection?.status === "REAUTH_REQUIRED") {
    return "Not usable: Google no longer accepts this connection. Reconnect Gmail.";
  }
  return "Not usable yet: approved, but Gmail is not connected.";
}

function IdentityAction({
  action,
  identityId,
  children,
}: {
  action: (formData: FormData) => Promise<void>;
  identityId: string;
  children: ReactNode;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="identityId" value={identityId} />
      {children}
    </form>
  );
}

/**
 * The signed-in user's approved addresses with their Gmail connection.
 * Sender approval and Google authorization are shown separately; both are
 * required. Only public connection fields reach this component.
 */
export function GmailAccountList({ accounts }: { accounts: GmailAccount[] }) {
  if (accounts.length === 0) {
    return (
      <p className="text-body-sm text-muted-foreground">
        No approved sender identities yet. Once the owner approves an address
        you requested, you can connect its Gmail account here.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border border-y border-border">
      {accounts.map((account) => {
        const { identity, connection } = account;
        const status = connection?.status ?? "NOT_CONNECTED";
        const canConnect =
          identity.status === "APPROVED" && status !== "CONNECTED";
        const canDisconnect =
          status === "CONNECTED" || status === "REAUTH_REQUIRED";
        return (
          <li key={identity.id} className="grid gap-4 py-5">
            <div className="min-w-0">
              <p className="font-medium break-words">{identity.email}</p>
              <dl className="mt-3 grid gap-3 text-body-sm sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground">Provider</dt>
                  <dd className="mt-1">
                    <StatusBadge value={identity.provider} />
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Sender identity</dt>
                  <dd className="mt-1">
                    <StatusBadge value={identity.status} />
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Gmail connection</dt>
                  <dd className="mt-1">
                    <StatusBadge value={status} />
                  </dd>
                </div>
              </dl>
              <ConnectionDates account={account} />
              <p className="mt-2 text-body-sm">{readiness(account)}</p>
            </div>

            <div className="flex flex-wrap gap-3">
              {canConnect && (
                <IdentityAction
                  action={startGmailConnectionAction}
                  identityId={identity.id}
                >
                  <GmailConnectButton>
                    {status === "NOT_CONNECTED" ? "Connect Gmail" : "Reconnect"}{" "}
                    <span className="sr-only">{identity.email}</span>
                  </GmailConnectButton>
                </IdentityAction>
              )}
              {status === "CONNECTED" && (
                <IdentityAction
                  action={verifyGmailConnectionAction}
                  identityId={identity.id}
                >
                  <Button type="submit" variant="secondary">
                    Check connection{" "}
                    <span className="sr-only">{identity.email}</span>
                  </Button>
                </IdentityAction>
              )}
              {canDisconnect && (
                <IdentityAction
                  action={disconnectGmailAction}
                  identityId={identity.id}
                >
                  <Button type="submit" variant="secondary">
                    Disconnect <span className="sr-only">{identity.email}</span>
                  </Button>
                </IdentityAction>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
