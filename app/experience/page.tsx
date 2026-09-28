import type { Metadata } from "next";
import { ExperienceNav } from "@/components/experience/ExperienceNav";
import { ExperienceRole } from "@/components/experience/ExperienceRole";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { siteConfig } from "@/lib/site/config";
import { experience } from "@/lib/site/experience";

export const metadata: Metadata = {
  title: `Experience · ${siteConfig.name}`,
  description:
    "A detailed overview of Kshitij Pal's backend engineering experience, responsibilities, and technical work.",
};

export default function ExperiencePage() {
  return (
    <>
      <Section
        spacing="editorial"
        aria-labelledby="experience-heading"
        className="pb-section"
      >
        <Container>
          <p className="flex items-center gap-3 font-mono text-meta text-muted-foreground uppercase">
            <span aria-hidden="true" className="h-px w-6 bg-border-strong" />
            Experience
          </p>
          <h1
            id="experience-heading"
            className="mt-6 font-serif text-h1 font-semibold sm:text-display"
          >
            Experience
          </h1>
          <p className="mt-6 max-w-measure text-body-lg text-muted-foreground">
            A detailed look at my backend engineering experience,
            responsibilities, and technical work.
          </p>
        </Container>
      </Section>

      <Section aria-label="Roles" className="border-t border-border">
        <Container>
          <ol className="divide-y divide-border">
            {experience.map((entry) => (
              <li
                key={`${entry.company}-${entry.role}`}
                className="grid gap-8 py-10 first:pt-0 last:pb-0 lg:grid-cols-3 lg:gap-12 lg:py-12"
              >
                <ExperienceRole
                  entry={entry}
                  headingLevel={2}
                  revealTechnologies
                />
              </li>
            ))}
          </ol>
        </Container>
      </Section>

      <ExperienceNav />
    </>
  );
}
