import { StatusBadge } from "@/components/admin/StatusBadge";
import type { GmailAccount } from "@/lib/admin/gmailConnections";

/**
 * Each of the user's addresses with its approval and Gmail connection
 * status; only addresses with both can be chosen to send from. Public
 * connection fields only.
 */
export function GmailReadiness({ accounts }: { accounts: GmailAccount[] }) {
  if (accounts.length === 0) return null;
  return (
    <ul aria-label="Sender addresses" className="grid gap-2 text-body-sm">
      {accounts.map((account) => (
        <li
          key={account.identity.id}
          className="flex flex-wrap items-center gap-2"
        >
          <span className="font-medium break-words">
            {account.identity.email}
          </span>
          <StatusBadge value={account.identity.status} />
          <StatusBadge value={account.connection?.status ?? "NOT_CONNECTED"} />
          {!account.usable && (
            <span className="text-muted-foreground">
              {account.connection?.status === "REAUTH_REQUIRED"
                ? "Reconnect Gmail on the dashboard to send from this address."
                : "Not available for sending."}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
