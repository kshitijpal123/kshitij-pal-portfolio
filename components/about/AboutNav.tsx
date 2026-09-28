import NextLink from "next/link";
import { Reveal } from "@/components/motion/Reveal";
import { buttonClassName } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Link } from "@/components/ui/Link";

/** Closing navigation of the About page. */
export function AboutNav() {
  return (
    <nav
      aria-label="Related"
      className="border-t border-border bg-surface-muted py-section"
    >
      <Container>
        <Reveal className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <NextLink href="/experience" className={buttonClassName("secondary")}>
            View experience
            <span aria-hidden="true">→</span>
          </NextLink>
          <Link
            href="/work"
            variant="subtle"
            className="inline-flex min-h-11 items-center text-body-sm"
          >
            Explore my work
          </Link>
          <Link
            href="/contact"
            variant="subtle"
            className="inline-flex min-h-11 items-center text-body-sm"
          >
            Let&apos;s connect
          </Link>
        </Reveal>
      </Container>
    </nav>
  );
}
