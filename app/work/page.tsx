import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { ProjectEntry } from "@/components/work/ProjectEntry";
import { projects } from "@/lib/content/projects";
import { siteConfig } from "@/lib/site/config";

export const metadata: Metadata = {
  title: `${siteConfig.name} · Work`,
  description:
    "Selected engineering work and systems by Kshitij Pal, Backend Engineer, including the BillSync case study.",
};

export default function WorkPage() {
  return (
    <>
      <Section
        spacing="editorial"
        aria-labelledby="work-heading"
        className="pb-section"
      >
        <Container>
          <h1
            id="work-heading"
            className="font-serif text-h1 font-semibold sm:text-display"
          >
            Work
          </h1>
          <p className="mt-6 max-w-measure text-body-lg text-muted-foreground">
            Selected engineering work and systems I&apos;ve built or am
            currently developing.
          </p>
        </Container>
      </Section>

      <Section aria-label="Projects" className="border-t border-border">
        <Container>
          <ul className="divide-y divide-border">
            {projects.map((project) => (
              <li
                key={project.slug}
                className="py-10 first:pt-0 last:pb-0 lg:py-12"
              >
                <ProjectEntry project={project} />
              </li>
            ))}
          </ul>
        </Container>
      </Section>
    </>
  );
}
