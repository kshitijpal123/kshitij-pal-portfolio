import type { Metadata } from "next";
import NextLink from "next/link";
import { buttonClassName } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <Section spacing="editorial" aria-labelledby="not-found-heading">
      <Container>
        <p className="flex items-center gap-3 font-mono text-meta text-muted-foreground uppercase">
          <span aria-hidden="true" className="h-px w-6 bg-border-strong" />
          404
        </p>
        <h1
          id="not-found-heading"
          className="mt-6 font-serif text-h1 font-semibold sm:text-display"
        >
          Page not found
        </h1>
        <p className="mt-6 max-w-measure text-body-lg text-muted-foreground">
          The address may be mistyped, or the page may have moved.
        </p>
        <div className="mt-10">
          <NextLink href="/" className={buttonClassName("secondary")}>
            Back to Home
          </NextLink>
        </div>
      </Container>
    </Section>
  );
}
