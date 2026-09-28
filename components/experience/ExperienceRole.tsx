import { Reveal } from "@/components/motion/Reveal";
import type { ExperienceEntry } from "@/lib/site/experience";

const headingTags = {
  2: { role: "h2", detail: "h3" },
  3: { role: "h3", detail: "h4" },
} as const;

type ExperienceRoleProps = {
  entry: ExperienceEntry;
  /** Level of the role heading; its sub-headings sit one level below. */
  headingLevel: keyof typeof headingTags;
  /** Reveal the technology groups on scroll. Leave off inside another reveal. */
  revealTechnologies?: boolean;
};

/**
 * One role on the three-column grid: role, company, and location in the
 * first column; summary, responsibilities, and technologies in the other two.
 * Renders the two columns only, so the parent owns the grid.
 */
export function ExperienceRole({
  entry,
  headingLevel,
  revealTechnologies = false,
}: ExperienceRoleProps) {
  const { role: RoleHeading, detail: DetailHeading } =
    headingTags[headingLevel];

  const technologies = (
    <>
      <DetailHeading className="mt-10 text-body-sm">Technologies</DetailHeading>
      <dl className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2">
        {entry.technologies.map((group) => (
          <div key={group.label}>
            <dt className="font-mono text-meta text-muted-foreground uppercase">
              {group.label}
            </dt>
            <dd className="mt-1.5">
              <ul
                aria-label={group.label}
                className="flex flex-wrap gap-x-2 gap-y-1 text-body-sm"
              >
                {group.items.map((item, index) => (
                  <li key={item}>
                    {item}
                    {index < group.items.length - 1 && (
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
            </dd>
          </div>
        ))}
      </dl>
    </>
  );

  return (
    <>
      <div className="lg:sticky lg:top-8 lg:self-start">
        {entry.period && (
          <p className="mb-3 font-mono text-meta text-muted-foreground uppercase">
            {entry.period}
          </p>
        )}
        <RoleHeading>{entry.role}</RoleHeading>
        <p className="mt-1 font-serif text-body-lg">{entry.company}</p>
        <p className="mt-3 font-mono text-meta text-muted-foreground uppercase">
          {entry.location}
        </p>
      </div>

      <div className="lg:col-span-2">
        <p className="max-w-measure text-body-lg">{entry.summary}</p>

        <DetailHeading className="mt-10 text-body-sm">
          Responsibilities
        </DetailHeading>
        <ul className="mt-3 max-w-measure list-disc space-y-2 pl-5 text-muted-foreground marker:text-border-strong">
          {entry.responsibilities.map((responsibility) => (
            <li key={responsibility}>{responsibility}</li>
          ))}
        </ul>

        {revealTechnologies ? <Reveal>{technologies}</Reveal> : technologies}
      </div>
    </>
  );
}
