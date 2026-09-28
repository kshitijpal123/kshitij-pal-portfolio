import { describe, expect, it } from "vitest";
import {
  articles,
  createArticleRegistry,
  formatArticleDate,
  formatReadingTime,
  getArticle,
  isValidArticleDate,
} from "@/lib/content/engineering";
import { articleFixture } from "@/tests/helpers/articles";

describe("engineering articles", () => {
  it.each(articles.map((article) => [article.slug, article]))(
    "%s declares valid metadata",
    (_, article) => {
      expect(article.title.trim()).not.toBe("");
      expect(article.description.trim()).not.toBe("");
      expect(article.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(isValidArticleDate(article.publishedAt)).toBe(true);
      expect(Number.isInteger(article.readingTime)).toBe(true);
      expect(article.readingTime).toBeGreaterThan(0);
      expect(article.status).toBe("published");
      expect(article.href).toBe(`/engineering/${article.slug}`);
      expect(article.Content).toEqual(expect.any(Function));
    },
  );

  it("has no duplicate slugs", () => {
    const slugs = articles.map((article) => article.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("finds a published article by slug and returns undefined otherwise", () => {
    expect(getArticle("ai-extraction-is-not-the-source-of-truth")?.title).toBe(
      "Why AI extraction should not become your source of truth",
    );
    expect(getArticle("unknown")).toBeUndefined();
  });
});

describe("createArticleRegistry", () => {
  const registry = createArticleRegistry([
    articleFixture({ slug: "older", publishedAt: "2026-02-01" }),
    articleFixture({
      slug: "draft",
      publishedAt: "2026-06-01",
      status: "draft",
    }),
    articleFixture({ slug: "newest", publishedAt: "2026-05-01" }),
    articleFixture({ slug: "middle-b", publishedAt: "2026-03-01" }),
    articleFixture({ slug: "middle-a", publishedAt: "2026-03-01" }),
  ]);

  it("returns published articles only, newest first, same-day by slug", () => {
    expect(registry.articles.map((article) => article.slug)).toEqual([
      "newest",
      "middle-a",
      "middle-b",
      "older",
    ]);
  });

  it("does not look up drafts or unknown slugs", () => {
    expect(registry.getArticle("newest")?.href).toBe("/engineering/newest");
    expect(registry.getArticle("draft")).toBeUndefined();
    expect(registry.getArticle("unknown")).toBeUndefined();
  });

  it("finds the chronologically adjacent articles", () => {
    const slugs = (slug: string) => {
      const { previous, next } = registry.getAdjacentArticles(slug);
      return [previous?.slug, next?.slug];
    };
    expect(slugs("newest")).toEqual(["middle-a", undefined]);
    expect(slugs("middle-b")).toEqual(["older", "middle-a"]);
    expect(slugs("older")).toEqual([undefined, "middle-b"]);
    expect(slugs("draft")).toEqual([undefined, undefined]);
  });

  it("returns an empty list when nothing is published", () => {
    expect(
      createArticleRegistry([articleFixture({ slug: "a", status: "draft" })])
        .articles,
    ).toEqual([]);
  });

  it.each([
    ["a duplicate slug", [{ slug: "a" }, { slug: "a", status: "draft" }]],
    ["a slug that is not kebab-case", [{ slug: "Not_Kebab" }]],
    ["an empty title", [{ slug: "a", title: " " }]],
    ["an empty description", [{ slug: "a", description: "" }]],
    ["an invalid publication date", [{ slug: "a", publishedAt: "2026-02-30" }]],
    ["a non-ISO publication date", [{ slug: "a", publishedAt: "28/09/2026" }]],
    ["an invalid update date", [{ slug: "a", updatedAt: "2026-13-01" }]],
    [
      "an update before publication",
      [{ slug: "a", publishedAt: "2026-05-01", updatedAt: "2026-04-01" }],
    ],
    ["a zero reading time", [{ slug: "a", readingTime: 0 }]],
    ["a fractional reading time", [{ slug: "a", readingTime: 2.5 }]],
  ] as const)("rejects %s", (_, entries) => {
    expect(() =>
      createArticleRegistry(entries.map((entry) => articleFixture(entry))),
    ).toThrow();
  });
});

describe("formatting", () => {
  it("formats dates without depending on locale or time zone", () => {
    expect(formatArticleDate("2026-09-28")).toBe("September 28, 2026");
    expect(formatArticleDate("2027-01-01")).toBe("January 1, 2027");
    expect(formatArticleDate("2026-12-31")).toBe("December 31, 2026");
  });

  it("validates calendar dates", () => {
    expect(isValidArticleDate("2028-02-29")).toBe(true);
    expect(isValidArticleDate("2026-02-29")).toBe(false);
    expect(isValidArticleDate("2026-9-28")).toBe(false);
  });

  it("formats reading time in minutes", () => {
    expect(formatReadingTime(5)).toBe("5 min read");
  });
});
