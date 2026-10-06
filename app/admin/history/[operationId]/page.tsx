import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { controlClassName } from "@/components/admin/AdminField";
import { FormStatus } from "@/components/admin/FormStatus";
import { PageHeading } from "@/components/admin/PageHeading";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Link } from "@/components/ui/Link";
import { retryOperationAction } from "@/lib/admin/actions";
import { formatTimestamp } from "@/lib/admin/format";
import { getAdminStore } from "@/lib/admin/getAdminStore";
import { getOperationDetail, sendFailureCategory } from "@/lib/admin/history";
import type { SendRecord } from "@/lib/admin/model";
import { formatInZone } from "@/lib/admin/recurrence";
import { isRetryable, planRetry, retryNotice } from "@/lib/admin/retry";
import { describeScheduleFailure } from "@/lib/admin/schedules";
import { describeFailureCode } from "@/lib/admin/sending";
import { requireUser } from "@/lib/admin/session";
import { adminLimits } from "@/lib/admin/validation";

export const metadata: Metadata = { title: "Operation" };

function outcome(record: SendRecord) {
  switch (record.status) {
    case "SENT":
      return "Accepted by Gmail.";
    case "UNCERTAIN":
      return "Unknown outcome: Gmail may have delivered it. It is never resent; check the Sent folder in Gmail.";
    case "RESERVED":
      return "No result was recorded. If this is not a send in progress, check the Sent folder in Gmail.";
    case "FAILED":
      return record.failureCode
        ? describeFailureCode(record.failureCode)
        : "Not sent.";
  }
}

export default async function OperationPage({
  params,
  searchParams,
}: PageProps<"/admin/history/[operationId]">) {
  const user = await requireUser();
  const [{ operationId }, query] = await Promise.all([params, searchParams]);
  const store = getAdminStore();
  const detail = await getOperationDetail(store, user, operationId);
  if (!detail) notFound();
  const plan = await planRetry(store, user, operationId);
  const notice = retryNotice(query.retry);
  const [first] = detail.records;
  const startedAt = new Date(Number(operationId.slice(0, 13))).toISOString();

  return (
    <AdminShell user={user} current="history">
      <div className="grid gap-10">
        <PageHeading title="Operation">
          <p>
            Started {formatTimestamp(startedAt)} from {first.senderEmail}, to{" "}
            {detail.records.length}{" "}
            {detail.records.length === 1 ? "recipient" : "recipients"}.
          </p>
        </PageHeading>
        <FormStatus state={notice ?? { status: "idle" }} />

        {first.scheduleId && (
          <section aria-labelledby="schedule-heading">
            <h2 id="schedule-heading" className="text-h3">
              Schedule
            </h2>
            {detail.schedule ? (
              <div className="mt-2 grid gap-1 text-body-sm">
                <p>
                  Made by the schedule{" "}
                  <span className="font-medium break-words">
                    {detail.schedule.subject}
                  </span>{" "}
                  <StatusBadge value={detail.schedule.status} />
                </p>
                {detail.run && (
                  <p className="text-muted-foreground">
                    Occurrence{" "}
                    {formatInZone(
                      detail.run.scheduledFor,
                      detail.schedule.timeZone,
                    )}
                    : {detail.run.status}
                    {detail.run.failureCode &&
                      ` — ${describeScheduleFailure(detail.run.failureCode)}`}
                  </p>
                )}
                <Link
                  href={`/admin/history?schedule=${detail.schedule.id}`}
                  className="w-fit"
                >
                  All sends from this schedule
                </Link>
              </div>
            ) : (
              <p className="mt-2 text-body-sm text-muted-foreground">
                Made by a schedule that is no longer stored.
              </p>
            )}
          </section>
        )}

        <section aria-labelledby="recipients-heading">
          <h2 id="recipients-heading" className="text-h3">
            Recipients
          </h2>
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {detail.records.map((record) => {
              const category = sendFailureCategory(record);
              return (
                <li key={record.id} className="grid gap-1 py-3 text-body-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium break-words">
                      {record.recipient}
                    </span>
                    <StatusBadge value={record.status} />
                    {record.bulk && <StatusBadge value="BULK" />}
                  </div>
                  <p className="break-words">{record.subject}</p>
                  <p className="text-muted-foreground">{outcome(record)}</p>
                  <p className="text-caption text-muted-foreground">
                    {record.attempts}{" "}
                    {record.attempts === 1 ? "attempt" : "attempts"}
                    {category && ` · ${category.toLowerCase()} failure`}
                    {isRetryable(record) && " · can be retried"} · updated{" "}
                    {formatTimestamp(record.completedAt ?? record.updatedAt)}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="retry-heading">
          <h2 id="retry-heading" className="text-h3">
            Retry
          </h2>
          {"blocked" in plan ? (
            <p className="mt-2 max-w-measure text-body-sm text-muted-foreground">
              {retryNotice(plan.blocked)?.message}
            </p>
          ) : (
            <form
              action={retryOperationAction}
              aria-label="Retry failed recipients"
              className="mt-4 grid max-w-measure gap-4"
            >
              <p className="text-body-sm text-muted-foreground">
                Sends again only to the {plan.retryable}{" "}
                {plan.retryable === 1 ? "recipient" : "recipients"} marked
                &ldquo;can be retried&rdquo;, with every check applied again:
                your account, the sender&apos;s approval and Gmail connection,
                your switches, and today&apos;s limits. Recipients already sent
                or with an unknown outcome are never sent again.
              </p>
              <input type="hidden" name="operationId" value={operationId} />
              {plan.source.kind === "compose" && (
                <>
                  <p className="text-body-sm">
                    The message body was not stored, so enter it again.
                  </p>
                  <div>
                    <label
                      htmlFor="retry-subject"
                      className="block text-body-sm font-medium"
                    >
                      Subject
                    </label>
                    <input
                      id="retry-subject"
                      name="subject"
                      required
                      maxLength={adminLimits.subject.max}
                      defaultValue={plan.source.subject}
                      className={controlClassName}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="retry-body"
                      className="block text-body-sm font-medium"
                    >
                      Message
                    </label>
                    <textarea
                      id="retry-body"
                      name="body"
                      required
                      rows={8}
                      maxLength={adminLimits.body.max}
                      defaultValue={plan.source.body}
                      className={controlClassName}
                    />
                  </div>
                </>
              )}
              <div>
                <Button type="submit">Retry failed recipients</Button>
              </div>
            </form>
          )}
        </section>

        <p className="text-body-sm">
          <Link href="/admin/history">Back to history</Link>
        </p>
      </div>
    </AdminShell>
  );
}
