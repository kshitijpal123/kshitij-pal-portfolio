import {
  maxDayOfMonth,
  type Recurrence,
  type Weekday,
  weekdays,
} from "@/lib/admin/model";

/*
 * Time zone arithmetic with the runtime's IANA database (`Intl`), never the
 * process's own zone. Local times are wall-clock values in a schedule's
 * zone; every stored instant is UTC. Occurrences follow EventBridge
 * Scheduler's rules for daylight saving time: a local time that does not
 * exist that day (spring forward) has no occurrence, and a local time that
 * happens twice (fall back) is one occurrence.
 */

const minuteMs = 60_000;
const dayMs = 24 * 60 * minuteMs;

export type LocalDate = { year: number; month: number; day: number };
export type LocalDateTime = LocalDate & { hour: number; minute: number };

const ianaAreas =
  "Africa|America|Antarctica|Arctic|Asia|Atlantic|Australia|Europe|Indian|Pacific";
/** Case-exact `Area/Location`; rejects abbreviations such as IST or EST. */
const ianaPattern = new RegExp(
  `^(?:${ianaAreas})(?:/[A-Z][A-Za-z0-9_+-]*){1,2}$`,
);

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string) {
  let format = formatters.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(timeZone, format);
  }
  return format;
}

/**
 * An IANA zone identifier such as `Asia/Kolkata`, or `UTC`, that the runtime
 * knows. Abbreviations (`IST`, `PST`), offsets, and other spellings are
 * refused even where `Intl` would map them to a zone.
 */
export function isValidTimeZone(value: string) {
  if (value !== "UTC" && !ianaPattern.test(value)) return false;
  try {
    formatter(value);
    return true;
  } catch {
    return false;
  }
}

/** Zones offered in the form: canonical `Area/Location` names and UTC. */
export function selectableTimeZones() {
  return [
    "UTC",
    ...Intl.supportedValuesOf("timeZone").filter((zone) =>
      ianaPattern.test(zone),
    ),
  ];
}

/** The wall-clock time in `timeZone` at a UTC instant (seconds dropped). */
export function toLocal(instant: number, timeZone: string): LocalDateTime {
  const parts: Record<string, number> = {};
  for (const part of formatter(timeZone).formatToParts(new Date(instant))) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
  };
}

function wallClockMs(local: LocalDateTime) {
  return Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
  );
}

function sameLocal(a: LocalDateTime, b: LocalDateTime) {
  return wallClockMs(a) === wallClockMs(b);
}

/** Offset of `timeZone` from UTC at an instant, in milliseconds. */
function offsetAt(instant: number, timeZone: string) {
  const floored = Math.floor(instant / minuteMs) * minuteMs;
  return wallClockMs(toLocal(floored, timeZone)) - floored;
}

/**
 * The UTC instant of a local time in `timeZone`; the earlier one when the
 * time happens twice, `null` when it does not exist that day.
 */
export function fromLocal(
  local: LocalDateTime,
  timeZone: string,
): number | null {
  const wall = wallClockMs(local);
  const candidates = [
    ...new Set([
      wall - offsetAt(wall - dayMs, timeZone),
      wall - offsetAt(wall + dayMs, timeZone),
    ]),
  ]
    .filter((instant) => sameLocal(toLocal(instant, timeZone), local))
    .sort((a, b) => a - b);
  return candidates[0] ?? null;
}

const localPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** `YYYY-MM-DDTHH:mm` (an `<input type="datetime-local">` value). */
export function parseLocal(value: string): LocalDateTime | null {
  const match = localPattern.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const check = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (
    year < 2000 ||
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute
  ) {
    return null;
  }
  return { year, month, day, hour, minute };
}

const pad = (value: number) => String(value).padStart(2, "0");

export function formatLocal(local: LocalDateTime) {
  return `${local.year}-${pad(local.month)}-${pad(local.day)}T${pad(local.hour)}:${pad(local.minute)}`;
}

export function timeOf(local: LocalDateTime) {
  return `${pad(local.hour)}:${pad(local.minute)}`;
}

function parseTime(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return { hour, minute };
}

function weekdayOf(date: LocalDate): Weekday {
  const sundayFirst = new Date(
    Date.UTC(date.year, date.month - 1, date.day),
  ).getUTCDay();
  return weekdays[(sundayFirst + 6) % 7];
}

function addDays(date: LocalDate, days: number): LocalDate {
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

function matchesDay(recurrence: Recurrence, date: LocalDate) {
  switch (recurrence.frequency) {
    case "DAILY":
      return true;
    case "WEEKLY":
      return recurrence.weekdays.includes(weekdayOf(date));
    case "MONTHLY":
      return date.day === recurrence.dayOfMonth;
  }
}

/** Longer than any gap between two occurrences (a month), with margin. */
const searchDays = 70;

/**
 * The first occurrence at or after (`inclusive`) or strictly after `from`,
 * computed from the recurrence's local time in its zone, never as "from +
 * interval", so late runs do not shift the timeline.
 */
export function nextOccurrence(
  recurrence: Recurrence,
  timeZone: string,
  from: number,
  inclusive = false,
): number | null {
  const { hour, minute } = parseTime(recurrence.time);
  let date: LocalDate = addDays(toLocal(from, timeZone), -1);
  for (let index = 0; index < searchDays; index++) {
    if (matchesDay(recurrence, date)) {
      const instant = fromLocal({ ...date, hour, minute }, timeZone);
      if (instant !== null && (inclusive ? instant >= from : instant > from)) {
        return instant;
      }
    }
    date = addDays(date, 1);
  }
  return null;
}

/**
 * Whether `instant` is one of the recurrence's occurrences: on a matching
 * day at exactly the local time. Both instants of a repeated local time
 * qualify; they share one occurrence key, so at most one runs.
 */
export function isOccurrence(
  recurrence: Recurrence,
  timeZone: string,
  instant: number,
) {
  if (instant % minuteMs !== 0) return false;
  const local = toLocal(instant, timeZone);
  const { hour, minute } = parseTime(recurrence.time);
  return (
    local.hour === hour &&
    local.minute === minute &&
    matchesDay(recurrence, local)
  );
}

export function isValidDayOfMonth(day: number) {
  return Number.isInteger(day) && day >= 1 && day <= maxDayOfMonth;
}

const cronDays: Record<Weekday, string> = {
  MONDAY: "MON",
  TUESDAY: "TUE",
  WEDNESDAY: "WED",
  THURSDAY: "THU",
  FRIDAY: "FRI",
  SATURDAY: "SAT",
  SUNDAY: "SUN",
};

/**
 * The EventBridge Scheduler expression for a recurrence, evaluated in the
 * schedule's zone. Generated from the structured recurrence only.
 */
export function cronExpression(recurrence: Recurrence) {
  const { hour, minute } = parseTime(recurrence.time);
  switch (recurrence.frequency) {
    case "DAILY":
      return `cron(${minute} ${hour} * * ? *)`;
    case "WEEKLY":
      return `cron(${minute} ${hour} ? * ${weekdays
        .filter((day) => recurrence.weekdays.includes(day))
        .map((day) => cronDays[day])
        .join(",")} *)`;
    case "MONTHLY":
      return `cron(${minute} ${hour} ${recurrence.dayOfMonth} * ? *)`;
  }
}

const weekdayNames: Record<Weekday, string> = {
  MONDAY: "Monday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday",
  FRIDAY: "Friday",
  SATURDAY: "Saturday",
  SUNDAY: "Sunday",
};

export function weekdayName(day: Weekday) {
  return weekdayNames[day];
}

export function describeRecurrence(recurrence: Recurrence) {
  switch (recurrence.frequency) {
    case "DAILY":
      return `Daily at ${recurrence.time}`;
    case "WEEKLY":
      return `Weekly on ${weekdays
        .filter((day) => recurrence.weekdays.includes(day))
        .map(weekdayName)
        .join(", ")} at ${recurrence.time}`;
    case "MONTHLY":
      return `Monthly on day ${recurrence.dayOfMonth} at ${recurrence.time}`;
  }
}

const months = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "12 Oct 2026, 10:00 Asia/Kolkata", locale-independent. */
export function formatInZone(iso: string, timeZone: string) {
  const local = toLocal(Date.parse(iso), timeZone);
  return `${local.day} ${months[local.month - 1]} ${local.year}, ${timeOf(local)} ${timeZone}`;
}
