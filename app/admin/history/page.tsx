import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { controlClassName } from "@/components/admin/AdminField";
import { FormStatus } from "@/components/admin/FormStatus";
import { PageHeading } from "@/components/admin/PageHeading";
import { SendHistory } from "@/components/admin/SendHistory";
import { Button } from "@/components/ui/Button";
import { Link } from "@/components/ui/Link";
import { getAdminStore } from "@/lib/admin/getAdminStore";
import {
  type HistoryFilters,
  parseHistoryQuery,
  searchSendHistory,
} from "@/lib/admin/history";
import { retryNotice } from "@/lib/admin/retry";
import { requireUser } from "@/lib/admin/session";

export const metadata: Metadata = { title: "History" };

const selects = [
  {
    name: "status",
    label: "Status",
    options: [
      ["SENT", "Sent"],
      ["FAILED", "Not sent"],
      ["UNCERTAIN", "Unknown outcome"],
      ["RESERVED", "No result recorded"],
    ],
  },
  {
    name: "type",
    label: "Type",
    options: [
      ["individual", "Individual"],
      ["bulk", "Bulk"],
    ],
  },
  {
    name: "origin",
    label: "Origin",
    options: [
      ["immediate", "Sent now"],
      ["scheduled", "Scheduled"],
    ],
  },
  {
    name: "category",
    label: "Failure category",
    options: [
      ["AUTHORIZATION", "Authorization"],
      ["VALIDATION", "Validation"],
      ["LIMIT", "Limit"],
      ["REJECTED", "Rejected by Gmail"],
      ["TRANSIENT", "Temporary"],
      ["UNCERTAIN", "Uncertain"],
    ],
  },
] as const;

function queryString(filters: HistoryFilters, cursor: string) {
  const query = new URLSearchParams();
  const values: Record<string, string | null> = {
    status: filters.status,
    from: filters.from,
    to: filters.to,
    recipient: filters.recipient,
    sender: filters.sender,
    type: filters.type,
    origin: filters.origin,
    category: filters.category,
    schedule: filters.scheduleId,
  };
  for (const [key, value] of Object.entries(values)) {
    if (value) query.set(key, value);
  }
  query.set("cursor", cursor);
  return query.toString();
}

export default async function HistoryPage({
  searchParams,
}: PageProps<"/admin/history">) {
  const user = await requireUser();
  const query = await searchParams;
  const { filters, cursor, error } = parseHistoryQuery(query);
  const page = error
    ? null
    : await searchSendHistory(getAdminStore(), user, filters, cursor);
  const notice = retryNotice(query.retry);

  return (
    <AdminShell user={user} current="history">
      <div className="grid gap-10">
        <PageHeading title="History">
          <p>
            Every send from your account, newest first. Only your own sends are
            listed. Message bodies are not stored, so they are not shown.
          </p>
        </PageHeading>
        <FormStatus state={notice ?? { status: "idle" }} />

        <section aria-labelledby="filters-heading">
          <h2 id="filters-heading" className="text-h3">
            Search and filter
          </h2>
          <form
            method="get"
            action="/admin/history"
            aria-label="Filter history"
            className="mt-4 grid gap-4 sm:grid-cols-3"
          >
            {filters.scheduleId && (
              <input type="hidden" name="schedule" value={filters.scheduleId} />
            )}
            <div>
              <label
                htmlFor="history-recipient"
                className="block text-body-sm font-medium"
              >
                Recipient contains
              </label>
              <input
                id="history-recipient"
                name="recipient"
                type="search"
                defaultValue={filters.recipient ?? ""}
                maxLength={254}
                className={controlClassName}
              />
            </div>
            <div>
              <label
                htmlFor="history-sender"
                className="block text-body-sm font-medium"
              >
                Sender contains
              </label>
              <input
                id="history-sender"
                name="sender"
                type="search"
                defaultValue={filters.sender ?? ""}
                maxLength={254}
                className={controlClassName}
              />
            </div>
            {selects.map((select) => (
              <div key={select.name}>
                <label
                  htmlFor={`history-${select.name}`}
                  className="block text-body-sm font-medium"
                >
                  {select.label}
                </label>
                <select
                  id={`history-${select.name}`}
                  name={select.name}
                  defaultValue={
                    (select.name === "status"
                      ? filters.status
                      : select.name === "type"
                        ? filters.type
                        : select.name === "origin"
                          ? filters.origin
                          : filters.category) ?? ""
                  }
                  className={controlClassName}
                >
                  <option value="">Any</option>
                  {select.options.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <div>
              <label
                htmlFor="history-from"
                className="block text-body-sm font-medium"
              >
                From (UTC date)
              </label>
              <input
                id="history-from"
                name="from"
                type="date"
                defaultValue={filters.from ?? ""}
                className={controlClassName}
              />
            </div>
            <div>
              <label
                htmlFor="history-to"
                className="block text-body-sm font-medium"
              >
                To (UTC date)
              </label>
              <input
                id="history-to"
                name="to"
                type="date"
                defaultValue={filters.to ?? ""}
                className={controlClassName}
              />
            </div>
            <div className="flex flex-wrap items-end gap-4 sm:col-span-3">
              <Button type="submit">Search</Button>
              <Link href="/admin/history">Clear filters</Link>
            </div>
          </form>
        </section>

        <section aria-labelledby="results-heading">
          <h2 id="results-heading" className="text-h3">
            Sends
          </h2>
          {filters.scheduleId && (
            <p className="mt-2 text-body-sm text-muted-foreground">
              Showing sends from one schedule.
            </p>
          )}
          <div className="mt-4">
            {error || !page ? (
              <p role="alert" className="text-body-sm text-danger">
                {error}
              </p>
            ) : (
              <SendHistory
                records={page.records}
                emptyMessage={
                  cursor ? "No more matching sends." : "No matching sends."
                }
              />
            )}
          </div>
          {page?.truncated && (
            <p className="mt-3 text-body-sm text-muted-foreground">
              Searched as far back as one request allows. Continue to search
              older sends.
            </p>
          )}
          {page?.next && (
            <p className="mt-3 text-body-sm">
              <Link href={`/admin/history?${queryString(filters, page.next)}`}>
                {page.truncated ? "Continue searching" : "Older sends"}
              </Link>
            </p>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
