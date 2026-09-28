import { formatYearMonth, type ExperienceEntry } from "@/lib/site/experience";

/** "May 2021 – Nov 2021" or "Jun 2024 – Present", with machine-readable months. */
export function ExperiencePeriod({ entry }: { entry: ExperienceEntry }) {
  return (
    <>
      <time dateTime={entry.startDate}>{formatYearMonth(entry.startDate)}</time>
      {" – "}
      {entry.endDate ? (
        <time dateTime={entry.endDate}>{formatYearMonth(entry.endDate)}</time>
      ) : (
        "Present"
      )}
    </>
  );
}
