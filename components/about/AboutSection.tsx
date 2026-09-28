import type { ReactNode } from "react";
import { Reveal } from "@/components/motion/Reveal";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";

type AboutSectionProps = {
  /** Anchor id; the heading id is derived from it. */
  id: string;
  title: string;
  children: ReactNode;
};

/** One About section: heading in the first column, content in the other two. */
export function AboutSection({ id, title, children }: AboutSectionProps) {
  const headingId = `${id}-heading`;

  return (
    <Section
      id={id}
      aria-labelledby={headingId}
      className="border-t border-border"
    >
      <Container className="grid gap-8 lg:grid-cols-3 lg:gap-12">
        <Reveal className="lg:sticky lg:top-8 lg:self-start">
          <h2 id={headingId} className="font-serif">
            {title}
          </h2>
        </Reveal>
        <div className="min-w-0 space-y-6 lg:col-span-2">{children}</div>
      </Container>
    </Section>
  );
}
