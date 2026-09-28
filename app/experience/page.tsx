import type { Metadata } from "next";
import { ExperienceNav } from "@/components/experience/ExperienceNav";
import { ExperienceRole } from "@/components/experience/ExperienceRole";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { pageMetadata } from "@/lib/seo/metadata";
import { experienceNewestFirst } from "@/lib/site/experience";

export const metadata: Metadata = pageMetadata({
  title: "Experience",
  description:
    "Kshitij Pal's professional backend engineering experience: roles, responsibilities, technical work, and progression from full-stack to backend engineering.",
  path: "/experience",
});

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
            A detailed look at my backend engineering journey, responsibilities,
            and technical work.
          </p>
        </Container>
      </Section>

      <Section aria-label="Roles" className="border-t border-border">
        <Container>
          <ol className="divide-y divide-border">
            {experienceNewestFirst.map((entry) => (
              <li
                key={entry.id}
                id={entry.id}
                className="grid scroll-mt-8 gap-8 py-12 first:pt-0 last:pb-0 lg:grid-cols-3 lg:gap-12 lg:py-16"
              >
                <ExperienceRole entry={entry} />
              </li>
            ))}
          </ol>
        </Container>
      </Section>

      <ExperienceNav />
    </>
  );
}
