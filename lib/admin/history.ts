import type {
  PublicUser,
  Schedule,
  ScheduleRun,
  SendRecord,
  SendStatus,
} from "@/lib/admin/model";
import { formatLocal, toLocal } from "@/lib/admin/recurrence";
import {
  failureCategory,
  type FailureCategory,
} from "@/lib/admin/scheduleExecution";
import type { AdminStore } from "@/lib/admin/store";
import {
  isWellFormedOperationId,
  normalizeEmail,
} from "@/lib/admin/validation";

/*
 * The signed-in user's sending history, read from their own SEND partition
 * only. Send record IDs begin with the operation's 13-digit millisecond
 * timestamp, so a date range is a key condition (no index needed), and the
 * other filters are applied while reading. Each request reads a bounded
 * number of records in fixed-size pages; it never loads the partition.
 */

export const historyPageSize = 25;

/** Records read per request at most, whatever the filters match. */
export const historyReadBudget = 500;

const readChunk = 100;

const statuses: readonly SendStatus[] = [
  "SENT",
  "FAILED",
  "UNCERTAIN",
  "RESERVED",
];
const categories: readonly FailureCategory[] = [
  "AUTHORIZATION",
  "VALIDATION",
  "LIMIT",
  "REJECTED",
  "TRANSIENT",
  "UNCERTAIN",
];

export type HistoryFilters = {
  status: SendStatus | null;
  /** UTC dates, `YYYY-MM-DD`, inclusive. */
  from: string | null;
  to: string | null;
  /** Lowercased substring of the recipient address. */
  recipient: string | null;
  /** Lowercased substring of the sender address. */
  sender: string | null;
  type: "individual" | "bulk" | null;
  origin: "immediate" | "scheduled" | null;
  category: FailureCategory | null;
  scheduleId: string | null;
};

export type HistoryQuery = {
  filters: HistoryFilters;
  cursor: string | null;
  error: string | null;
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const sendRecordIdPattern = /^\d{13}\.[A-Za-z0-9_-]{22}:[0-9a-f]{32}$/;

function one(value: string | string[] | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function pick<T extends string>(value: string, allowed: readonly T[]) {
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function validDate(value: string) {
  if (!datePattern.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isNaN(time) ||
    new Date(time).toISOString().slice(0, 10) !== value
    ? null
    : value;
}

function searchText(value: string) {
  const text = normalizeEmail(value).slice(0, 254);
  return text || null;
}

/**
 * Parses the history page's query string. Only known parameters with
 * allowed values are used; anything else is ignored.
 */
export function parseHistoryQuery(
  query: Record<string, string | string[] | undefined>,
): HistoryQuery {
  const filters: HistoryFilters = {
    status: pick(one(query.status), statuses),
    from: validDate(one(query.from)),
    to: validDate(one(query.to)),
    recipient: searchText(one(query.recipient)),
    sender: searchText(one(query.sender)),
    type: pick(one(query.type), ["individual", "bulk"] as const),
    origin: pick(one(query.origin), ["immediate", "scheduled"] as const),
    category: pick(one(query.category), categories),
    scheduleId: uuidPattern.test(one(query.schedule))
      ? one(query.schedule)
      : null,
  };
  const cursor = sendRecordIdPattern.test(one(query.cursor))
    ? one(query.cursor)
    : null;
  const error =
    filters.from && filters.to && filters.from > filters.to
      ? "The start date is after the end date."
      : null;
  return { filters, cursor, error };
}

/** How a send failed, in the same categories as scheduled occurrences. */
export function sendFailureCategory(
  record: Pick<SendRecord, "status" | "failureCode">,
): FailureCategory | null {
  return failureCategory(record.status, record.failureCode);
}

function timeBound(day: string, endOfDay: boolean) {
  const time = Date.parse(
    `${day}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`,
  );
  return String(time).padStart(13, "0");
}

/** Sort-key bounds for the date range; `~` sorts after every ID character. */
export function historyRange(filters: Pick<HistoryFilters, "from" | "to">) {
  return {
    lower: filters.from ? timeBound(filters.from, false) : "0",
    upper: filters.to ? `${timeBound(filters.to, true)}~` : "~",
  };
}

export function matchesHistoryFilters(
  record: SendRecord,
  filters: HistoryFilters,
) {
  if (filters.status && record.status !== filters.status) return false;
  if (filters.recipient && !record.recipient.includes(filters.recipient)) {
    return false;
  }
  if (filters.sender && !record.senderEmail.includes(filters.sender)) {
    return false;
  }
  if (filters.type && record.bulk !== (filters.type === "bulk")) return false;
  if (
    filters.origin &&
    Boolean(record.scheduleId) !== (filters.origin === "scheduled")
  ) {
    return false;
  }
  if (filters.scheduleId && record.scheduleId !== filters.scheduleId) {
    return false;
  }
  if (filters.category && sendFailureCategory(record) !== filters.category) {
    return false;
  }
  return true;
}

export type HistoryPage = {
  records: SendRecord[];
  /** Cursor for the next page, or `null` when nothing more was found. */
  next: string | null;
  /** The read budget ran out before a full page matched. */
  truncated: boolean;
};

/**
 * One page of the actor's matching send records, newest first. The cursor
 * is the ID of the last record the previous page read; it is accepted only
 * in the shape of a send record ID and within the requested range, and the
 * partition is always the actor's own.
 */
export async function searchSendHistory(
  store: AdminStore,
  actor: PublicUser,
  filters: HistoryFilters,
  cursor: string | null,
): Promise<HistoryPage> {
  const range = historyRange(filters);
  let after =
    cursor &&
    sendRecordIdPattern.test(cursor) &&
    cursor >= range.lower &&
    cursor <= range.upper
      ? cursor
      : null;
  const records: SendRecord[] = [];
  let read = 0;

  while (read < historyReadBudget) {
    const page = await store.listSendRecordsPage(actor.id, range, {
      after,
      limit: Math.min(readChunk, historyReadBudget - read),
    });
    for (const [index, record] of page.items.entries()) {
      read += 1;
      if (record.userId !== actor.id) continue;
      if (matchesHistoryFilters(record, filters)) records.push(record);
      if (records.length === historyPageSize) {
        const more = index < page.items.length - 1 || page.last !== null;
        return { records, next: more ? record.id : null, truncated: false };
      }
    }
    if (page.last === null || page.items.length === 0) {
      return { records, next: null, truncated: false };
    }
    after = page.last;
  }
  return { records, next: after, truncated: true };
}

export type OperationDetail = {
  operationId: string;
  records: SendRecord[];
  /** The schedule that made it, while it is still stored. */
  schedule: Schedule | null;
  /** The schedule's occurrence for this operation, while it is stored. */
  run: ScheduleRun | null;
};

/**
 * Every record of one of the actor's operations, or `null` when the actor
 * has none (another user's operation looks the same as a missing one).
 */
export async function getOperationDetail(
  store: AdminStore,
  actor: PublicUser,
  operationId: string,
): Promise<OperationDetail | null> {
  if (!isWellFormedOperationId(operationId)) return null;
  const records = (
    await store.listSendRecordsForOperation(actor.id, operationId)
  )
    .filter((record) => record.userId === actor.id)
    .sort((a, b) => a.recipient.localeCompare(b.recipient));
  if (records.length === 0) return null;

  const scheduleId = records[0].scheduleId;
  const stored = scheduleId
    ? await store.getSchedule(actor.id, scheduleId)
    : null;
  const schedule = stored?.userId === actor.id ? stored : null;
  let run: ScheduleRun | null = null;
  if (schedule) {
    const instant = Number(operationId.slice(0, 13));
    const occurrence = formatLocal(toLocal(instant, schedule.timeZone));
    const found = await store.getScheduleRun(actor.id, schedule.id, occurrence);
    run = found?.operationId === operationId ? found : null;
  }
  return { operationId, records, schedule, run };
}
