import Image from "next/image";
import type { ReactNode } from "react";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { siteConfig } from "@/lib/site/config";

type ProfileGroup = {
  label: string;
  items: readonly string[];
};

type AboutHeaderProps = {
  /** Short facts beside the introduction, such as role and specialization. */
  profile: readonly ProfileGroup[];
  /** The introduction. */
  children: ReactNode;
};

/**
 * The About page header: eyebrow, h1, and introduction, with the portrait and
 * a profile summary in the side column. The portrait renders only while
 * `siteConfig.portrait` is set. Above the fold, so it uses no motion.
 */
export function AboutHeader({ profile, children }: AboutHeaderProps) {
  const { portrait } = siteConfig;

  return (
    <Section
      spacing="editorial"
      aria-labelledby="about-heading"
      className="pb-section"
    >
      <Container className="grid gap-12 lg:grid-cols-3 lg:gap-12">
        <div className="lg:col-span-2">
          <p className="flex items-center gap-3 font-mono text-meta text-muted-foreground uppercase">
            <span aria-hidden="true" className="h-px w-6 bg-border-strong" />
            About
          </p>
          <h1
            id="about-heading"
            className="mt-6 font-serif text-h1 font-semibold sm:text-display"
          >
            About
          </h1>
          <div className="mt-6 space-y-6">{children}</div>
        </div>

        <div className="flex flex-col gap-8 lg:mt-3">
          {portrait && (
            <Image
              src={portrait.src}
              alt={portrait.alt}
              width={portrait.width}
              height={portrait.height}
              sizes="(min-width: 40rem) 12rem, 10rem"
              className="w-40 rounded-container border border-border sm:w-48"
            />
          )}
          <dl className="grid content-start gap-6 border-l border-border pl-4">
            {profile.map((group) => (
              <div key={group.label}>
                <dt className="font-mono text-meta text-muted-foreground uppercase">
                  {group.label}
                </dt>
                <dd className="mt-1.5">
                  <ul
                    aria-label={group.label}
                    className="flex flex-wrap gap-x-2 gap-y-1 text-body-sm"
                  >
                    {group.items.map((item, index) => (
                      <li key={item}>
                        {item}
                        {index < group.items.length - 1 && (
                          <span
                            aria-hidden="true"
                            className="ml-2 text-muted-foreground"
                          >
                            ·
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </Container>
    </Section>
  );
}
