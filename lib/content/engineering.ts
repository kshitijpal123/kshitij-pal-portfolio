import type { MDXContent } from "mdx/types";
import { aiExtractionIsNotTheSourceOfTruth } from "@/content/engineering/ai-extraction-is-not-the-source-of-truth/article";
/** Only published articles are listed, routed, or prerendered. */
export type ArticleStatus = "published" | "draft";

/**
 * One article, declared in `content/engineering/<slug>/article.ts` next to the
 * `index.mdx` that holds its body.
 */
export type ArticleDefinition = {
  /** Kebab-case; must match the article's directory name. */
  slug: string;
  title: string;
  /** One or two sentences for the Engineering index and the page description. */
  description: string;
  /** Calendar date, `YYYY-MM-DD`. */
  publishedAt: string;
  /** Calendar date, `YYYY-MM-DD`; set only for a meaningful revision. */
  updatedAt?: string;
  /** Whole minutes, estimated from the word count when the article is written. */
  readingTime: number;
  status: ArticleStatus;
  /** Name of a series the article belongs to, when there is one. */
  series?: string;
  Content: MDXContent;
};

export type Article = ArticleDefinition & {
  href: string;
};

export type AdjacentArticles = {
  /** The next older article. */
  previous?: Article;
  /** The next newer article. */
  next?: Article;
};

/** Every article, published or draft. Order does not matter. */
const definitions: readonly ArticleDefinition[] = [
  aiExtractionIsNotTheSourceOfTruth,
];

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function isValidArticleDate(value: string): boolean {
  if (!datePattern.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

function validate(entries: readonly ArticleDefinition[]) {
  const seen = new Set<string>();

  for (const entry of entries) {
    const at = `Article "${entry.slug}"`;

    if (!slugPattern.test(entry.slug)) {
      throw new Error(`${at}: slug must be kebab-case.`);
    }
    if (seen.has(entry.slug)) {
      throw new Error(`${at}: duplicate slug.`);
    }
    seen.add(entry.slug);

    if (!entry.title.trim() || !entry.description.trim()) {
      throw new Error(`${at}: title and description are required.`);
    }
    if (!isValidArticleDate(entry.publishedAt)) {
      throw new Error(`${at}: publishedAt must be a YYYY-MM-DD date.`);
    }
    if (entry.updatedAt !== undefined) {
      if (!isValidArticleDate(entry.updatedAt)) {
        throw new Error(`${at}: updatedAt must be a YYYY-MM-DD date.`);
      }
      if (entry.updatedAt < entry.publishedAt) {
        throw new Error(`${at}: updatedAt is before publishedAt.`);
      }
    }
    if (!Number.isInteger(entry.readingTime) || entry.readingTime < 1) {
      throw new Error(`${at}: readingTime must be a positive whole number.`);
    }
  }
}

/**
 * Validates every definition, drafts included, then keeps the published ones,
 * newest first. Same-day articles are ordered by slug so the order is stable.
 */
export function createArticleRegistry(entries: readonly ArticleDefinition[]) {
  validate(entries);

  const articles: readonly Article[] = entries
    .filter((entry) => entry.status === "published")
    .map((entry) => ({ ...entry, href: `/engineering/${entry.slug}` }))
    .sort(
      (a, b) =>
        b.publishedAt.localeCompare(a.publishedAt) ||
        a.slug.localeCompare(b.slug),
    );

  function getArticle(slug: string): Article | undefined {
    return articles.find((article) => article.slug === slug);
  }

  function getAdjacentArticles(slug: string): AdjacentArticles {
    const index = articles.findIndex((article) => article.slug === slug);
    if (index === -1) {
      return {};
    }
    return { previous: articles[index + 1], next: articles[index - 1] };
  }

  return { articles, getArticle, getAdjacentArticles };
}

export const { articles, getArticle, getAdjacentArticles } =
  createArticleRegistry(definitions);

const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * `2026-09-28` → `September 28, 2026`. Built by hand rather than with `Intl`
 * so the output never depends on the runtime's locale or time zone.
 */
export function formatArticleDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return `${months[month - 1]} ${day}, ${year}`;
}

export function formatReadingTime(minutes: number): string {
  return `${minutes} min read`;
}
