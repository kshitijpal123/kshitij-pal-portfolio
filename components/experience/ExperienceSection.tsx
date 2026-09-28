import { ExperienceRole } from "@/components/experience/ExperienceRole";
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
              <ExperienceRole entry={entry} headingLevel={3} />
            </StaggerItem>
          ))}
        </Stagger>
      </Container>
    </Section>
  );
}
