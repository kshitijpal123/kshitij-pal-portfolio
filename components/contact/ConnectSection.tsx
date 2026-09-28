import NextLink from "next/link";
import { Reveal } from "@/components/motion/Reveal";
import { buttonClassName } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Link } from "@/components/ui/Link";
import { Section } from "@/components/ui/Section";
import { siteConfig } from "@/lib/site/config";

export function ConnectSection() {
  const linkedIn = siteConfig.social.find(
    (link) => link.label === "LinkedIn",
  )?.href;

  return (
    <Section
      muted
      aria-labelledby="connect-heading"
      className="border-t border-border"
    >
      <Container>
        <Reveal className="max-w-narrow">
          <p className="flex items-center gap-3 font-mono text-meta text-muted-foreground uppercase">
            <span aria-hidden="true" className="h-px w-6 bg-border-strong" />
            Let&apos;s connect
          </p>

          <h2 id="connect-heading" className="mt-6 font-serif">
            Let&apos;s build something useful.
          </h2>

          <p className="mt-4 max-w-measure text-body-lg text-muted-foreground">
            I&apos;m open to backend engineering opportunities, technical
            conversations, and thoughtful collaboration.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <NextLink href="/contact" className={buttonClassName("primary")}>
              Get in touch
              <span aria-hidden="true">→</span>
            </NextLink>
            {linkedIn && (
              <Link
                href={linkedIn}
                variant="subtle"
                rel="me"
                className="inline-flex min-h-11 items-center text-body-sm"
              >
                LinkedIn
              </Link>
            )}
          </div>
        </Reveal>
      </Container>
    </Section>
  );
}
