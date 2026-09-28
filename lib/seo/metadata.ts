import type { Metadata } from "next";
import type { Article } from "@/lib/content/engineering";
import type { Project } from "@/lib/content/projects";
import { siteConfig } from "@/lib/site/config";
import { absoluteUrl, siteUrl } from "@/lib/seo/siteUrl";

/** The Home title, and the default for routes that set none. */
export const siteTitle = `${siteConfig.name} · ${siteConfig.role}`;

const titleTemplate = `%s · ${siteConfig.name}`;

/** Matches `<html lang="en">`. */
const locale = "en_US";

export function rootMetadata(base: string | null = siteUrl): Metadata {
  return {
    ...(base && { metadataBase: new URL(base) }),
    title: { default: siteTitle, template: titleTemplate },
    authors: [{ name: siteConfig.name, ...(base && { url: `${base}/` }) }],
    creator: siteConfig.name,
  };
}

type PageMetadataInput = {
  /** The route's own title, before the template; omitted for Home. */
  title?: string;
  description: string;
  /** Route path, for example `/work`. */
  path: string;
  article?: { publishedTime: string; modifiedTime?: string };
};

/**
 * A route's title, description, canonical URL, and social metadata. Next.js
 * replaces `openGraph` and `twitter` per route rather than merging them, so
 * every route receives the complete set from here.
 */
export function pageMetadata(
  { title, description, path, article }: PageMetadataInput,
  base: string | null = siteUrl,
): Metadata {
  const documentTitle = title ? titleTemplate.replace("%s", title) : siteTitle;
  const url = absoluteUrl(path, base);

  const shared = {
    title: documentTitle,
    description,
    ...(url && { url }),
    siteName: siteConfig.name,
    locale,
  };

  return {
    title: title ?? { absolute: siteTitle },
    description,
    ...(url && { alternates: { canonical: url } }),
    openGraph: article
      ? { ...shared, type: "article", authors: [siteConfig.name], ...article }
      : { ...shared, type: "website" },
    twitter: { card: "summary", title: documentTitle, description },
  };
}

export function projectMetadata(
  project: Project,
  base: string | null = siteUrl,
): Metadata {
  return pageMetadata(
    {
      title: project.metaTitle,
      description: `${project.summary} ${project.status}.`,
      path: project.href,
    },
    base,
  );
}

export function articleMetadata(
  article: Article,
  base: string | null = siteUrl,
): Metadata {
  return pageMetadata(
    {
      title: article.title,
      description: article.description,
      path: article.href,
      article: {
        publishedTime: article.publishedAt,
        ...(article.updatedAt && { modifiedTime: article.updatedAt }),
      },
    },
    base,
  );
}
