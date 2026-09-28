import { Link } from "@/components/ui/Link";
import {
  formatArticleDate,
  formatReadingTime,
  type Article,
} from "@/lib/content/engineering";

type ArticleEntryProps = {
  article: Article;
};

/** An Engineering index entry: date column, then title, description, and link. */
export function ArticleEntry({ article }: ArticleEntryProps) {
  const headingId = `article-${article.slug}-heading`;

  return (
    <article
      aria-labelledby={headingId}
      className="grid gap-3 lg:grid-cols-3 lg:gap-12"
    >
      <p className="font-mono text-meta text-muted-foreground uppercase lg:pt-2">
        <time dateTime={article.publishedAt}>
          {formatArticleDate(article.publishedAt)}
        </time>
      </p>

      <div className="lg:col-span-2">
        <h2 id={headingId} className="font-serif text-h3 sm:text-h2">
          {article.title}
        </h2>
        <p className="mt-3 max-w-measure text-body-lg text-muted-foreground">
          {article.description}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1">
          <p className="font-mono text-meta text-muted-foreground uppercase">
            {formatReadingTime(article.readingTime)}
          </p>
          <Link
            href={article.href}
            aria-describedby={headingId}
            className="inline-flex min-h-11 items-center font-medium"
          >
            Read article
            <span aria-hidden="true" className="ml-1.5">
              →
            </span>
          </Link>
        </div>
      </div>
    </article>
  );
}
