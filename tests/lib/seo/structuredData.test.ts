import { describe, expect, it } from "vitest";
import { createArticleRegistry } from "@/lib/content/engineering";
import {
  articleStructuredData,
  homeStructuredData,
  serializeJsonLd,
} from "@/lib/seo/structuredData";
import { articleFixture } from "@/tests/helpers/articles";

const base = "https://portfolio.test";
const sameAs = [
  "https://github.com/kshitijpal123",
  "https://www.linkedin.com/in/kshitij-pal-963247195",
];

describe("homeStructuredData", () => {
  it("describes the website and the person once the site URL is known", () => {
    expect(homeStructuredData(base)).toEqual({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebSite",
          "@id": "https://portfolio.test/#website",
          name: "Kshitij Pal",
          url: "https://portfolio.test/",
          author: { "@id": "https://portfolio.test/#person" },
        },
        {
          "@type": "Person",
          "@id": "https://portfolio.test/#person",
          name: "Kshitij Pal",
          jobTitle: "Backend Engineer",
          url: "https://portfolio.test/",
          sameAs,
        },
      ],
    });
  });

  it("describes only the person, without URLs, when no site URL is set", () => {
    expect(homeStructuredData(null)).toEqual({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Person",
          name: "Kshitij Pal",
          jobTitle: "Backend Engineer",
          sameAs,
        },
      ],
    });
  });

  it("states no employer, organization, image, rating, or review", () => {
    const json = JSON.stringify(homeStructuredData(base));
    expect(json).not.toMatch(
      /worksFor|Organization|image|aggregateRating|review|email|telephone/i,
    );
  });
});

describe("articleStructuredData", () => {
  const { articles } = createArticleRegistry([
    articleFixture({ slug: "plain", publishedAt: "2026-03-01" }),
    articleFixture({
      slug: "revised",
      publishedAt: "2026-01-01",
      updatedAt: "2026-02-01",
    }),
  ]);
  const [plain, revised] = articles;

  it("describes the article from its typed metadata", () => {
    expect(articleStructuredData(plain, base)).toEqual({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "Title of plain",
      description: "Description of plain.",
      datePublished: "2026-03-01",
      author: {
        "@type": "Person",
        "@id": "https://portfolio.test/#person",
        name: "Kshitij Pal",
        jobTitle: "Backend Engineer",
        url: "https://portfolio.test/",
        sameAs,
      },
      url: "https://portfolio.test/engineering/plain",
      mainEntityOfPage: "https://portfolio.test/engineering/plain",
    });
  });

  it("adds dateModified only for a revised article", () => {
    expect(articleStructuredData(plain, base)).not.toHaveProperty(
      "dateModified",
    );
    expect(articleStructuredData(revised, base)).toMatchObject({
      dateModified: "2026-02-01",
    });
  });

  it("omits every URL when no site URL is set", () => {
    const data = articleStructuredData(plain, null);
    expect(data).not.toHaveProperty("url");
    expect(data).not.toHaveProperty("mainEntityOfPage");
    expect(JSON.stringify(data)).not.toMatch(
      /https?:\/\/(?!schema\.org|github\.com|www\.linkedin\.com)/,
    );
  });
});

describe("serializeJsonLd", () => {
  it("round-trips to the same data", () => {
    const data = homeStructuredData(base);
    expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
  });

  it("cannot close the script element or inject markup", () => {
    const { articles } = createArticleRegistry([
      articleFixture({
        slug: "hostile",
        title: "</script><script>alert(1)</script>",
        description: "A & B <b>\u2028\u2029",
      }),
    ]);
    const data = articleStructuredData(articles[0], base);
    const json = serializeJsonLd(data);

    expect(json).not.toMatch(/[<>&\u2028\u2029]/);
    expect(JSON.parse(json)).toEqual(data);
  });
});
