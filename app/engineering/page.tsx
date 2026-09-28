import type { Metadata } from "next";
import { ArticleList } from "@/components/engineering/ArticleList";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { articles } from "@/lib/content/engineering";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Engineering",
  description:
    "Technical writing by Kshitij Pal, Backend Engineer: articles on engineering topics, systems explored or built, and lessons learned.",
  path: "/engineering",
});

export default function EngineeringPage() {
  return (
    <>
      <Section
        spacing="editorial"
        aria-labelledby="engineering-heading"
        className="pb-section"
      >
        <Container>
          <p className="flex items-center gap-3 font-mono text-meta text-muted-foreground uppercase">
            <span aria-hidden="true" className="h-px w-6 bg-border-strong" />
            Engineering
          </p>
          <h1
            id="engineering-heading"
            className="mt-6 font-serif text-h1 font-semibold sm:text-display"
          >
            Engineering
          </h1>
          <p className="mt-6 max-w-measure text-body-lg text-muted-foreground">
            A chronological collection of technical notes, engineering lessons,
            and systems I&apos;m exploring or building.
          </p>
        </Container>
      </Section>

      <Section aria-label="Articles" className="border-t border-border">
        <Container>
          <ArticleList articles={articles} />
        </Container>
      </Section>
    </>
  );
}
