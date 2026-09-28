import { Reveal } from "@/components/motion/Reveal";
import { Stagger } from "@/components/motion/Stagger";
import { StaggerItem } from "@/components/motion/StaggerItem";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { experience, type ExperienceEntry } from "@/lib/site/experience";

type ExperienceSectionProps = {
  entries?: readonly ExperienceEntry[];
};

export function ExperienceSection({
  entries = experience,
}: ExperienceSectionProps) {
  return (
    <Section
      aria-labelledby="experience-heading"
      className="border-t border-border"
    >
      <Container>
        <Reveal className="grid gap-4 lg:grid-cols-3 lg:gap-12">
          <h2 id="experience-heading" className="font-serif">
            Experience
          </h2>
          <p className="max-w-measure text-body-lg text-muted-foreground lg:col-span-2">
            Building backend systems across APIs, databases, cloud
            infrastructure, and distributed application components.
          </p>
        </Reveal>

        <Stagger
          as="ol"
          className="mt-12 divide-y divide-border border-t border-border lg:mt-16"
        >
          {entries.map((entry) => (
            <StaggerItem
              key={`${entry.company}-${entry.role}`}
              as="li"
              className="grid gap-8 py-10 last:pb-0 lg:grid-cols-3 lg:gap-12 lg:py-12"
            >
              <ExperienceEntryDetails entry={entry} />
            </StaggerItem>
          ))}
        </Stagger>
      </Container>
    </Section>
  );
}

function ExperienceEntryDetails({ entry }: { entry: ExperienceEntry }) {
  return (
    <>
      <div className="lg:sticky lg:top-8 lg:self-start">
        {entry.period && (
          <p className="mb-3 font-mono text-meta text-muted-foreground uppercase">
            {entry.period}
          </p>
        )}
        <h3>{entry.role}</h3>
        <p className="mt-1 font-serif text-body-lg">{entry.company}</p>
        <p className="mt-3 font-mono text-meta text-muted-foreground uppercase">
          {entry.location}
        </p>
      </div>

      <div className="lg:col-span-2">
        <p className="max-w-measure text-body-lg">{entry.summary}</p>

        <h4 className="mt-10 text-body-sm">Responsibilities</h4>
        <ul className="mt-3 max-w-measure list-disc space-y-2 pl-5 text-muted-foreground marker:text-border-strong">
          {entry.responsibilities.map((responsibility) => (
            <li key={responsibility}>{responsibility}</li>
          ))}
        </ul>

        <h4 className="mt-10 text-body-sm">Technologies</h4>
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
      </div>
    </>
  );
}
