import NextLink from "next/link";
import { Reveal } from "@/components/motion/Reveal";
import { buttonClassName } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Link } from "@/components/ui/Link";
import { siteConfig } from "@/lib/site/config";

/**
 * Closing navigation of the Experience page. The résumé download appears only
 * once `siteConfig.resumeHref` points at a real PDF.
 */
export function ExperienceNav() {
  const { resumeHref } = siteConfig;

  return (
    <nav
      aria-label="Related"
      className="border-t border-border bg-surface-muted py-section"
    >
      <Container>
        <Reveal className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {resumeHref && (
            <a
              href={resumeHref}
              download
              className={buttonClassName("primary")}
            >
              Download resume <span className="font-mono text-meta">(PDF)</span>
            </a>
          )}
          <NextLink href="/about" className={buttonClassName("secondary")}>
            About me
            <span aria-hidden="true">→</span>
          </NextLink>
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
