import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { controlClassName } from "@/components/admin/AdminField";
import { PageHeading } from "@/components/admin/PageHeading";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Link } from "@/components/ui/Link";
import {
  describeAuditAction,
  listAuditTrail,
  systemAuditSubject,
} from "@/lib/admin/audit";
import { formatTimestamp } from "@/lib/admin/format";
import { getAdminStore } from "@/lib/admin/getAdminStore";
import type { AuditEvent } from "@/lib/admin/model";
import { requireUser } from "@/lib/admin/session";
import { getUserAdministration } from "@/lib/admin/users";

export const metadata: Metadata = { title: "Audit log" };

const one = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : "";

function describeDetail(event: AuditEvent) {
  return Object.entries(event.detail)
    .filter(([, value]) => value !== null)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" · ");
}

/*
 * A user reads only their own trail. The OWNER can also read any account's
 * trail and the system trail (sign-ins to unknown accounts, failed setup).
 * Entries hold actions, outcomes, IDs, and counts; never tokens, secrets,
 * passwords, subjects, or bodies.
 */
export default async function AuditPage({
  searchParams,
}: PageProps<"/admin/audit">) {
  const user = await requireUser();
  const store = getAdminStore();
  const query = await searchParams;
  const requested = one(query.user) || user.id;
  const [trail, administration] = await Promise.all([
    listAuditTrail(store, user, requested, one(query.cursor) || null),
    getUserAdministration(store, user, new Date()),
  ]);
  const names = new Map(
    (administration?.users ?? [user]).map((account) => [account.id, account]),
  );
  const subjectLabel = (subject: string) =>
    subject === systemAuditSubject
      ? "System"
      : (names.get(subject)?.name ?? "Unknown account");

  return (
    <AdminShell user={user} current="audit">
      <div className="grid gap-10">
        <PageHeading title="Audit log">
          <p>
            Security-relevant actions, newest first, kept for one year. Only
            what happened and its result are recorded, never message content or
            credentials.
          </p>
        </PageHeading>

        {administration && (
          <form
            method="get"
            action="/admin/audit"
            aria-label="Choose an audit trail"
            className="flex flex-wrap items-end gap-4"
          >
            <div>
              <label
                htmlFor="audit-user"
                className="block text-body-sm font-medium"
              >
                Trail
              </label>
              <select
                id="audit-user"
                name="user"
                defaultValue={requested}
                className={controlClassName}
              >
                {administration.users.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} ({account.email})
                  </option>
                ))}
                <option value={systemAuditSubject}>System</option>
              </select>
            </div>
            <Button type="submit" variant="secondary">
              Show
            </Button>
          </form>
        )}

        <section aria-labelledby="audit-heading">
          <h2 id="audit-heading" className="text-h3">
            {trail ? subjectLabel(trail.subject) : "Audit trail"}
          </h2>
          {!trail ? (
            <p role="alert" className="mt-4 text-body-sm">
              That audit trail is not available.
            </p>
          ) : trail.events.length === 0 ? (
            <p className="mt-4 text-body-sm text-muted-foreground">
              No recorded events.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-border border-y border-border">
              {trail.events.map((event) => {
                const detail = describeDetail(event);
                return (
                  <li key={event.id} className="grid gap-1 py-3 text-body-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {describeAuditAction(event.action)}
                      </span>
                      <StatusBadge
                        value={event.outcome.toUpperCase().replace("-", "_")}
                      />
                    </div>
                    <p className="text-caption text-muted-foreground">
                      {formatTimestamp(event.at)}
                      {event.actorId === null
                        ? " · by the system"
                        : event.actorId !== trail.subject &&
                          ` · by ${subjectLabel(event.actorId)}`}
                      {event.targetId && ` · target ${event.targetId}`}
                    </p>
                    {detail && (
                      <p className="break-words text-muted-foreground">
                        {detail}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {trail?.next && (
            <p className="mt-3 text-body-sm">
              <Link
                href={`/admin/audit?${new URLSearchParams({
                  user: trail.subject,
                  cursor: trail.next,
                }).toString()}`}
              >
                Older events
              </Link>
            </p>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
