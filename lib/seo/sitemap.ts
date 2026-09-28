import type { MetadataRoute } from "next";
import { articles as publishedArticles } from "@/lib/content/engineering";
import { projects as allProjects } from "@/lib/content/projects";
import { siteConfig } from "@/lib/site/config";

/**
 * Every public page: the navigation pages, each case study, and each
 * published article. Drafts never reach the article registry, and the API
 * and 404 are not pages. `lastModified` is set only where content carries a
 * real date: an article's revision or publication date, and the newest of
 * those for the Engineering index.
 */
export function buildSitemap(
  base: string | null,
  { articles = publishedArticles, projects = allProjects } = {},
): MetadataRoute.Sitemap {
  if (!base) return [];

  const url = (path: string) => new URL(path, base).href;
  const articleDates = articles.map(
    (article) => article.updatedAt ?? article.publishedAt,
  );
  const latestArticle = articleDates.toSorted().at(-1);

  return [
    ...siteConfig.nav.map((item) => ({
      url: url(item.href),
      ...(item.href === "/engineering" &&
        latestArticle && { lastModified: latestArticle }),
    })),
    ...projects.map((project) => ({ url: url(project.href) })),
    ...articles.map((article, index) => ({
      url: url(article.href),
      lastModified: articleDates[index],
    })),
  ];
}
