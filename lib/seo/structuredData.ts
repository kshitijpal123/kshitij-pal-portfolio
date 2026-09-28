import type { Article } from "@/lib/content/engineering";
import { siteConfig } from "@/lib/site/config";
import { absoluteUrl, siteUrl } from "@/lib/seo/siteUrl";

/*
 * schema.org JSON-LD, limited to what the site can state as fact: the
 * person, the website, and published articles. Every value comes from
 * `siteConfig` or typed content; URLs are included only when a site URL is
 * configured.
 */

type PersonNode = {
  "@type": "Person";
  "@id"?: string;
  name: string;
  jobTitle: string;
  url?: string;
  sameAs?: string[];
};

type WebSiteNode = {
  "@type": "WebSite";
  "@id": string;
  name: string;
  url: string;
  author: { "@id": string };
};

type ArticleNode = {
  "@type": "Article";
  headline: string;
  description: string;
  datePublished: string;
  dateModified?: string;
  author: PersonNode;
  url?: string;
  mainEntityOfPage?: string;
};

export type StructuredData =
  | { "@context": "https://schema.org"; "@graph": (PersonNode | WebSiteNode)[] }
  | ({ "@context": "https://schema.org" } & ArticleNode);

function person(base: string | null): PersonNode {
  const sameAs = siteConfig.social.flatMap((link) =>
    link.href ? [link.href] : [],
  );
  return {
    "@type": "Person",
    ...(base && { "@id": `${base}/#person` }),
    name: siteConfig.name,
    jobTitle: siteConfig.role,
    ...(base && { url: `${base}/` }),
    ...(sameAs.length > 0 && { sameAs }),
  };
}

/** Home: the person and, once the site URL is known, the website. */
export function homeStructuredData(
  base: string | null = siteUrl,
): StructuredData {
  const author = person(base);
  const graph: (PersonNode | WebSiteNode)[] = [author];

  if (base && author["@id"]) {
    graph.unshift({
      "@type": "WebSite",
      "@id": `${base}/#website`,
      name: siteConfig.name,
      url: `${base}/`,
      author: { "@id": author["@id"] },
    });
  }

  return { "@context": "https://schema.org", "@graph": graph };
}

export function articleStructuredData(
  article: Article,
  base: string | null = siteUrl,
): StructuredData {
  const url = absoluteUrl(article.href, base);

  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description,
    datePublished: article.publishedAt,
    ...(article.updatedAt && { dateModified: article.updatedAt }),
    author: person(base),
    ...(url && { url, mainEntityOfPage: url }),
  };
}

/**
 * JSON for a `<script type="application/ld+json">`. Escaping `<`, `>`, `&`,
 * and the JavaScript line separators keeps any string value from closing the
 * script element or breaking out of it.
 */
export function serializeJsonLd(data: StructuredData): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
