import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import {
  formatArticleDate,
  formatReadingTime,
  type Article,
} from "@/lib/content/engineering";

type ArticleHeaderProps = {
  article: Article;
};

/**
 * The article header. Above the fold, so it uses no motion primitives and
 * renders fully without JavaScript.
 */
export function ArticleHeader({ article }: ArticleHeaderProps) {
  const { publishedAt, updatedAt } = article;

  return (
    <Section spacing="editorial" className="pb-section">
      <Container>
        <header className="max-w-narrow">
          <p className="flex items-center gap-3 font-mono text-meta text-muted-foreground uppercase">
            <span aria-hidden="true" className="h-px w-6 bg-border-strong" />
            Engineering
            {article.series && (
              <>
                <span aria-hidden="true">·</span>
                <span>{article.series}</span>
              </>
            )}
          </p>
          <h1
            id="article-heading"
            className="mt-6 font-serif text-h1 font-semibold"
          >
            {article.title}
          </h1>
          <p className="mt-6 max-w-measure text-body-lg text-muted-foreground">
            {article.description}
          </p>
          <p className="mt-6 font-mono text-meta text-muted-foreground uppercase">
            {updatedAt ? (
              <>
                Published{" "}
                <time dateTime={publishedAt}>
                  {formatArticleDate(publishedAt)}
                </time>{" "}
                · Updated{" "}
                <time dateTime={updatedAt}>{formatArticleDate(updatedAt)}</time>
              </>
            ) : (
              <time dateTime={publishedAt}>
                {formatArticleDate(publishedAt)}
              </time>
            )}{" "}
            · {formatReadingTime(article.readingTime)}
          </p>
        </header>
      </Container>
    </Section>
  );
}
