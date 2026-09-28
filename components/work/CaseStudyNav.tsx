import NextLink from "next/link";
import { buttonClassName } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Link } from "@/components/ui/Link";

/** Closing navigation shared by every case study. */
export function CaseStudyNav() {
  return (
    <nav
      aria-label="Case study"
      className="border-t border-border bg-surface-muted py-section"
    >
      <Container className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <NextLink href="/work" className={buttonClassName("secondary")}>
          Back to Work
          <span aria-hidden="true">→</span>
        </NextLink>
        <Link
          href="/contact"
          variant="subtle"
          className="inline-flex min-h-11 items-center text-body-sm"
        >
          Let&apos;s connect
        </Link>
      </Container>
    </nav>
  );
}
