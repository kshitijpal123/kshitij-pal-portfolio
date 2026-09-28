import NextLink from "next/link";
import { Reveal } from "@/components/motion/Reveal";
import { buttonClassName } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import type { AdjacentArticles, Article } from "@/lib/content/engineering";

/**
 * Closing navigation for an article: the chronologically adjacent articles,
 * when they exist, and the way back to the index.
 */
export function ArticleNav({ previous, next }: AdjacentArticles) {
  return (
    <nav
      aria-label="Articles"
      className="border-t border-border bg-surface-muted py-section"
    >
      <Container>
        <Reveal className="grid gap-10">
          {(previous || next) && (
            <ul className="grid gap-6 sm:grid-cols-2 sm:gap-12">
              {previous && (
                <AdjacentLink article={previous} direction="previous" />
              )}
              {next && <AdjacentLink article={next} direction="next" />}
            </ul>
          )}
          <div>
            <NextLink
              href="/engineering"
              className={buttonClassName("secondary")}
            >
              <span aria-hidden="true">←</span>
              Back to Engineering
            </NextLink>
          </div>
        </Reveal>
      </Container>
    </nav>
  );
}

type AdjacentLinkProps = {
  article: Article;
  /** `previous` is the next older article, `next` the next newer one. */
  direction: "previous" | "next";
};

function AdjacentLink({ article, direction }: AdjacentLinkProps) {
  const isNext = direction === "next";

  return (
    <li className={isNext ? "sm:col-start-2 sm:text-right" : undefined}>
      <NextLink
        href={article.href}
        className="group inline-flex min-h-11 flex-col justify-center text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="font-mono text-meta uppercase">
          {isNext ? (
            <>
              Next article <span aria-hidden="true">→</span>
            </>
          ) : (
            <>
              <span aria-hidden="true">←</span> Previous article
            </>
          )}
        </span>{" "}
        <span className="mt-1.5 font-serif text-body-lg text-foreground underline decoration-border-strong underline-offset-4 transition-colors group-hover:decoration-foreground">
          {article.title}
        </span>
      </NextLink>
    </li>
  );
}
