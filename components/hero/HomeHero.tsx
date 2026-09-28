import Image from "next/image";
import NextLink from "next/link";
import { TechnicalHeroVisual } from "@/components/hero/TechnicalHeroVisual";
import { buttonClassName } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { siteConfig } from "@/lib/site/config";
import { cx } from "@/lib/utils/cx";

const specialization = ["Node.js", "TypeScript", "Backend Architecture"];

const technologies = [
  "REST APIs",
  "PostgreSQL",
  "Distributed Systems",
  "Messaging",
  "Caching",
  "Cloud",
  "Docker",
  "CI/CD",
];

type InlineListProps = {
  label: string;
  items: readonly string[];
  className?: string;
};

/** Items wrap whole; each separator stays at the end of its item's line. */
function InlineList({ label, items, className }: InlineListProps) {
  return (
    <ul
      aria-label={label}
      className={cx("flex flex-wrap gap-x-2 gap-y-1 font-mono", className)}
    >
      {items.map((item, index) => (
        <li key={item}>
          {item}
          {index < items.length - 1 && (
            <span aria-hidden="true" className="ml-2 text-muted-foreground">
              ·
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function HomeHero() {
  const { portrait } = siteConfig;

  return (
    <Section spacing="editorial" aria-labelledby="home-hero-heading">
      <Container className="grid gap-12 lg:grid-cols-5 lg:items-end">
        <div className="lg:col-span-3">
          <p className="flex items-center gap-3 font-mono text-meta text-muted-foreground uppercase">
            <span aria-hidden="true" className="h-px w-6 bg-border-strong" />
            Backend Engineer
          </p>

          <h1
            id="home-hero-heading"
            className="mt-6 font-serif text-h1 font-semibold sm:text-display"
          >
            Backend Engineer building production-oriented systems.
          </h1>

          <p className="mt-6 max-w-measure text-body-lg text-muted-foreground">
            I specialize in Node.js and TypeScript, building backend systems and
            APIs with a focus on architecture, reliability, and real-world
            engineering constraints.
          </p>

          <div className="mt-8 flex flex-col gap-3 border-l border-border pl-4">
            <InlineList
              label="Specialization"
              items={specialization}
              className="text-body-sm font-medium text-foreground"
            />
            <InlineList
              label="Technologies"
              items={technologies}
              className="text-caption text-muted-foreground"
            />
          </div>

          <div className="mt-10 flex flex-wrap gap-3">
            <NextLink href="/work" className={buttonClassName("primary")}>
              Explore my work
            </NextLink>
            <NextLink href="/contact" className={buttonClassName("secondary")}>
              Let&apos;s connect
            </NextLink>
          </div>
        </div>

        {portrait ? (
          <div className="lg:col-span-2 lg:justify-self-end">
            <Image
              src={portrait.src}
              alt={portrait.alt}
              width={portrait.width}
              height={portrait.height}
              preload
              sizes="(min-width: 64rem) 16rem, 12rem"
              className="w-48 rounded-container border border-border lg:w-64"
            />
          </div>
        ) : (
          <TechnicalHeroVisual className="w-full max-w-88 lg:col-span-2 lg:justify-self-end" />
        )}
      </Container>
    </Section>
  );
}
