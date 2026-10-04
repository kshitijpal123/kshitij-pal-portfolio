import { describe, expect, it } from "vitest";
import { createArticleRegistry } from "@/lib/content/engineering";
import { buildSitemap } from "@/lib/seo/sitemap";
import { articleFixture } from "@/tests/helpers/articles";

const base = "https://portfolio.test";

describe("buildSitemap (repository content)", () => {
  const entries = buildSitemap(base);
  const urls = entries.map((entry) => entry.url);

  it("lists every public page, case study, and published article", () => {
    expect(urls).toEqual([
      "https://portfolio.test/",
      "https://portfolio.test/work",
      "https://portfolio.test/experience",
      "https://portfolio.test/engineering",
      "https://portfolio.test/about",
      "https://portfolio.test/contact",
      "https://portfolio.test/work/billsync",
      "https://portfolio.test/engineering/ai-extraction-is-not-the-source-of-truth",
    ]);
  });

  it("lists no API route, 404, or duplicate", () => {
    expect(urls.some((url) => /\/api\/|not-found|404/.test(url))).toBe(false);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("dates only what content dates: articles and the Engineering index", () => {
    const dated = entries.filter((entry) => entry.lastModified);
    expect(dated).toEqual([
      { url: "https://portfolio.test/engineering", lastModified: "2026-09-28" },
      {
        url: "https://portfolio.test/engineering/ai-extraction-is-not-the-source-of-truth",
        lastModified: "2026-09-28",
      },
    ]);
  });

  it("sets no invented change frequency or priority", () => {
    for (const entry of entries) {
      expect(entry).not.toHaveProperty("changeFrequency");
      expect(entry).not.toHaveProperty("priority");
    }
  });
});

describe("buildSitemap (fixtures)", () => {
  const { articles } = createArticleRegistry([
    articleFixture({ slug: "older", publishedAt: "2026-01-01" }),
    articleFixture({
      slug: "revised",
      publishedAt: "2026-02-01",
      updatedAt: "2026-04-01",
    }),
    articleFixture({
      slug: "unfinished",
      publishedAt: "2026-05-01",
      status: "draft",
    }),
  ]);

  it("never lists a draft", () => {
    const urls = buildSitemap(base, { articles }).map((entry) => entry.url);
    expect(urls.some((url) => url.includes("unfinished"))).toBe(false);
    expect(urls).toContain("https://portfolio.test/engineering/older");
  });

  it("uses an article's revision date, and the newest for the index", () => {
    const entries = buildSitemap(base, { articles });
    const find = (path: string) =>
      entries.find((entry) => entry.url === `${base}${path}`);

    expect(find("/engineering/revised")?.lastModified).toBe("2026-04-01");
    expect(find("/engineering/older")?.lastModified).toBe("2026-01-01");
    expect(find("/engineering")?.lastModified).toBe("2026-04-01");
  });

  it("leaves the Engineering index undated with no articles", () => {
    const entries = buildSitemap(base, { articles: [] });
    expect(
      entries.find((entry) => entry.url === `${base}/engineering`),
    ).not.toHaveProperty("lastModified");
  });
});

describe("buildSitemap without a site URL", () => {
  it("is empty rather than listing relative or invented URLs", () => {
    expect(buildSitemap(null)).toEqual([]);
  });
});
