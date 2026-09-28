import { ExperiencePeriod } from "@/components/experience/ExperiencePeriod";
import { Reveal } from "@/components/motion/Reveal";
import {
  durationInMonths,
  formatDuration,
  isCurrentRole,
  type ExperienceEntry,
} from "@/lib/site/experience";

/**
 * One role on the `/experience` page, on the three-column grid: period, role,
 * company, and role facts in the first column; summary, progression,
 * engineering sections, and technologies in the other two. Renders the two
 * columns only, so the parent owns the grid.
 */
export function ExperienceRole({ entry }: { entry: ExperienceEntry }) {
  const headingId = `${entry.id}-heading`;
  const current = isCurrentRole(entry);
  const facts = [
    { term: "Employment", value: entry.employmentType },
    { term: "Location", value: entry.location },
    { term: "Work mode", value: entry.workMode },
  ].filter((fact) => fact.value);

  return (
    <>
      <div className="lg:sticky lg:top-8 lg:self-start">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-meta text-muted-foreground uppercase">
          {current && <span className="text-accent">Current</span>}
          <span>
            <ExperiencePeriod entry={entry} />
          </span>
          {entry.endDate && (
            <span>
              {formatDuration(durationInMonths(entry.startDate, entry.endDate))}
            </span>
          )}
        </p>
        <h2 id={headingId} className="mt-4">
          {entry.role}
          <span className="sr-only">,</span>{" "}
          <span className="mt-1 block font-serif text-body-lg font-normal">
            {entry.company}
          </span>
        </h2>
        <dl className="mt-6 grid gap-3 text-body-sm">
          {facts.map((fact) => (
            <div key={fact.term}>
              <dt className="font-mono text-meta text-muted-foreground uppercase">
                {fact.term}
              </dt>
              <dd className="mt-0.5">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="lg:col-span-2">
        <p className="max-w-measure text-body-lg">{entry.summary}</p>

        <div className="mt-10 max-w-measure border-l-2 border-accent pl-5">
          <h3 className="font-mono text-meta font-normal text-muted-foreground uppercase">
            Engineering progression
          </h3>
          <p className="mt-2 font-mono text-body-sm font-medium text-accent uppercase">
            {entry.progression.label}
          </p>
          <p className="mt-1 font-serif text-body-lg">
            {entry.progression.statement}
          </p>
        </div>

        {entry.sections.map((section) => (
          <div key={section.title} className="mt-10">
            <h3 className="text-body">{section.title}</h3>
            <ul className="mt-3 max-w-measure list-disc space-y-2 pl-5 text-muted-foreground marker:text-border-strong">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}

        {entry.technologies.length > 0 && (
          <Reveal className="mt-10 border-t border-border pt-6">
            <h3 className="font-mono text-meta font-normal text-muted-foreground uppercase">
              Technologies
            </h3>
            <ul
              aria-label={`Technologies at ${entry.company}`}
              className="mt-3 flex flex-wrap gap-x-2 gap-y-1 text-body-sm"
            >
              {entry.technologies.map((technology, index) => (
                <li key={technology}>
                  {technology}
                  {index < entry.technologies.length - 1 && (
                    <span
                      aria-hidden="true"
                      className="ml-2 text-muted-foreground"
                    >
                      ·
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Reveal>
        )}
      </div>
    </>
  );
}
