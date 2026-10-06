// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Recurrence } from "@/lib/admin/model";
import {
  cronExpression,
  describeRecurrence,
  formatInZone,
  formatLocal,
  fromLocal,
  isOccurrence,
  isValidTimeZone,
  nextOccurrence,
  parseLocal,
  selectableTimeZones,
  toLocal,
} from "@/lib/admin/recurrence";

const at = (iso: string) => Date.parse(iso);
const local = (value: string) => {
  const parsed = parseLocal(value);
  if (!parsed) throw new Error(value);
  return parsed;
};

describe("time zones", () => {
  it("accepts IANA identifiers and UTC only", () => {
    for (const zone of [
      "UTC",
      "Asia/Kolkata",
      "Europe/London",
      "America/New_York",
      "America/Argentina/Buenos_Aires",
    ]) {
      expect(isValidTimeZone(zone), zone).toBe(true);
    }
    for (const zone of [
      "",
      "IST",
      "EST",
      "PST8PDT",
      "asia/kolkata",
      "Etc/GMT+5",
      "+05:30",
      "GMT",
      "Mars/Olympus",
      "Asia/Kolkata ",
      "Asia/../Kolkata",
    ]) {
      expect(isValidTimeZone(zone), zone).toBe(false);
    }
  });

  it("offers only zones it accepts", () => {
    const zones = selectableTimeZones();
    expect(zones[0]).toBe("UTC");
    expect(zones).toContain("Europe/London");
    expect(zones).not.toContain("EST");
    expect(zones.every(isValidTimeZone)).toBe(true);
  });

  it("converts local times in the chosen zone, never the process zone", () => {
    expect(fromLocal(local("2026-10-12T10:00"), "Asia/Kolkata")).toBe(
      at("2026-10-12T04:30:00Z"),
    );
    expect(fromLocal(local("2026-10-12T10:00"), "UTC")).toBe(
      at("2026-10-12T10:00:00Z"),
    );
    expect(
      formatLocal(toLocal(at("2026-10-12T04:30:00Z"), "Asia/Kolkata")),
    ).toBe("2026-10-12T10:00");
  });

  it("has no instant for a skipped local time and the earlier for a repeated one", () => {
    // New York: 2026-03-08 02:00 jumps to 03:00; 2026-11-01 02:00 back to 01:00.
    expect(fromLocal(local("2026-03-08T02:30"), "America/New_York")).toBeNull();
    expect(fromLocal(local("2026-11-01T01:30"), "America/New_York")).toBe(
      at("2026-11-01T05:30:00Z"),
    );
  });

  it("parses only real datetime-local values", () => {
    expect(parseLocal("2026-10-12T10:00")).toEqual({
      year: 2026,
      month: 10,
      day: 12,
      hour: 10,
      minute: 0,
    });
    for (const value of [
      "2026-02-30T10:00",
      "2026-10-12T24:00",
      "2026-10-12T10:00:00",
      "2026-10-12 10:00",
      "1999-12-31T10:00",
      "2026-10-12T10:00Z",
      "",
    ]) {
      expect(parseLocal(value), value).toBeNull();
    }
  });

  it("formats an instant in its zone", () => {
    expect(formatInZone("2026-10-12T04:30:00.000Z", "Asia/Kolkata")).toBe(
      "12 Oct 2026, 10:00 Asia/Kolkata",
    );
  });
});

describe("recurrence", () => {
  const daily: Recurrence = { frequency: "DAILY", time: "10:00" };
  const from = at("2026-10-06T09:00:00Z"); // Tuesday, 14:30 in Kolkata

  it("finds the next daily, weekly, and monthly occurrence in the zone", () => {
    expect(nextOccurrence(daily, "Asia/Kolkata", from)).toBe(
      at("2026-10-07T04:30:00Z"),
    );
    expect(
      nextOccurrence(
        {
          frequency: "WEEKLY",
          weekdays: ["MONDAY", "WEDNESDAY"],
          time: "10:00",
        },
        "Asia/Kolkata",
        from,
      ),
    ).toBe(at("2026-10-07T04:30:00Z"));
    expect(
      nextOccurrence(
        { frequency: "WEEKLY", weekdays: ["MONDAY"], time: "10:00" },
        "Asia/Kolkata",
        from,
      ),
    ).toBe(at("2026-10-12T04:30:00Z"));
    expect(
      nextOccurrence(
        { frequency: "MONTHLY", dayOfMonth: 28, time: "10:00" },
        "Asia/Kolkata",
        from,
      ),
    ).toBe(at("2026-10-28T04:30:00Z"));
    expect(
      nextOccurrence(
        { frequency: "MONTHLY", dayOfMonth: 5, time: "10:00" },
        "Asia/Kolkata",
        from,
      ),
    ).toBe(at("2026-11-05T04:30:00Z"));
  });

  it("includes the start itself only when asked", () => {
    const occurrence = at("2026-10-07T04:30:00Z");
    expect(nextOccurrence(daily, "Asia/Kolkata", occurrence, true)).toBe(
      occurrence,
    );
    expect(nextOccurrence(daily, "Asia/Kolkata", occurrence)).toBe(
      at("2026-10-08T04:30:00Z"),
    );
  });

  it("keeps the timeline after a late run and does not backfill", () => {
    const lateRun = at("2026-10-07T05:20:00Z");
    expect(nextOccurrence(daily, "Asia/Kolkata", lateRun)).toBe(
      at("2026-10-08T04:30:00Z"),
    );
    const daysLater = at("2026-10-10T12:00:00Z");
    expect(nextOccurrence(daily, "Asia/Kolkata", daysLater)).toBe(
      at("2026-10-11T04:30:00Z"),
    );
  });

  it("skips a day whose local time does not exist and runs a repeated time once", () => {
    const early: Recurrence = { frequency: "DAILY", time: "02:30" };
    expect(
      nextOccurrence(early, "America/New_York", at("2026-03-07T12:00:00Z")),
    ).toBe(at("2026-03-09T06:30:00Z"));

    const repeated: Recurrence = { frequency: "DAILY", time: "01:30" };
    const first = nextOccurrence(
      repeated,
      "America/New_York",
      at("2026-10-31T12:00:00Z"),
    );
    expect(first).toBe(at("2026-11-01T05:30:00Z"));
    expect(nextOccurrence(repeated, "America/New_York", first ?? 0)).toBe(
      at("2026-11-02T06:30:00Z"),
    );
  });

  it("recognises occurrences, both instants of a repeated time sharing a key", () => {
    expect(
      isOccurrence(daily, "Asia/Kolkata", at("2026-10-07T04:30:00Z")),
    ).toBe(true);
    expect(
      isOccurrence(daily, "Asia/Kolkata", at("2026-10-07T04:31:00Z")),
    ).toBe(false);
    expect(
      isOccurrence(daily, "Asia/Kolkata", at("2026-10-07T04:30:30Z")),
    ).toBe(false);
    const repeated: Recurrence = { frequency: "DAILY", time: "01:30" };
    for (const instant of ["2026-11-01T05:30:00Z", "2026-11-01T06:30:00Z"]) {
      expect(isOccurrence(repeated, "America/New_York", at(instant))).toBe(
        true,
      );
      expect(formatLocal(toLocal(at(instant), "America/New_York"))).toBe(
        "2026-11-01T01:30",
      );
    }
  });

  it("builds Scheduler expressions only from the structured recurrence", () => {
    expect(cronExpression(daily)).toBe("cron(0 10 * * ? *)");
    expect(
      cronExpression({
        frequency: "WEEKLY",
        weekdays: ["WEDNESDAY", "MONDAY"],
        time: "09:05",
      }),
    ).toBe("cron(5 9 ? * MON,WED *)");
    expect(
      cronExpression({ frequency: "MONTHLY", dayOfMonth: 28, time: "23:59" }),
    ).toBe("cron(59 23 28 * ? *)");
    expect(
      describeRecurrence({
        frequency: "WEEKLY",
        weekdays: ["FRIDAY", "MONDAY"],
        time: "09:05",
      }),
    ).toBe("Weekly on Monday, Friday at 09:05");
  });
});
