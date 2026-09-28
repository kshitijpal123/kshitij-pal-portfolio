import { ArticleEntry } from "@/components/engineering/ArticleEntry";
import type { Article } from "@/lib/content/engineering";

type ArticleListProps = {
  /** Published articles, newest first. */
  articles: readonly Article[];
};

/** The Engineering index list, or a deliberate empty state while it has none. */
export function ArticleList({ articles }: ArticleListProps) {
  if (articles.length === 0) {
    return (
      <p className="max-w-measure text-body-lg text-muted-foreground">
        Technical notes are being prepared. New engineering writing will appear
        here as it is published.
      </p>
    );
  }

  return (
    <ol className="divide-y divide-border">
      {articles.map((article) => (
        <li key={article.slug} className="py-10 first:pt-0 last:pb-0 lg:py-12">
          <ArticleEntry article={article} />
        </li>
      ))}
    </ol>
  );
}
