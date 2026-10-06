import { StatusBadge } from "@/components/admin/StatusBadge";
import { Link } from "@/components/ui/Link";
import { formatTimestamp } from "@/lib/admin/format";
import type { SendRecord } from "@/lib/admin/model";
import { describeFailureCode } from "@/lib/admin/sending";

function detail(record: SendRecord) {
  if (record.status === "SENT") return null;
  if (record.status === "RESERVED") {
    return "No result was recorded. If this is not a send in progress, check the Sent folder in Gmail.";
  }
  return record.failureCode ? describeFailureCode(record.failureCode) : null;
}

/** The signed-in user's sends: recipient, subject, and outcome only. */
export function SendHistory({
  records,
  emptyMessage = "Nothing sent yet.",
}: {
  records: SendRecord[];
  emptyMessage?: string;
}) {
  if (records.length === 0) {
    return <p className="text-body-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <ul className="divide-y divide-border border-y border-border">
      {records.map((record) => {
        const note = detail(record);
        return (
          <li key={record.id} className="grid gap-1 py-3 text-body-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium break-words">
                {record.recipient}
              </span>
              <StatusBadge value={record.status} />
              {record.bulk && <StatusBadge value="BULK" />}
              {record.scheduleId && <StatusBadge value="SCHEDULED" />}
            </div>
            <p className="break-words">{record.subject}</p>
            <p className="text-caption text-muted-foreground">
              From {record.senderEmail} ·{" "}
              {formatTimestamp(record.completedAt ?? record.createdAt)}
            </p>
            {note && <p className="text-muted-foreground">{note}</p>}
            <Link
              href={`/admin/history/${record.operationId}`}
              variant="subtle"
              className="w-fit text-caption"
            >
              Operation details{" "}
              <span className="sr-only">for {record.recipient}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
