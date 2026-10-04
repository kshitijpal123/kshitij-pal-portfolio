import { describe, expect, it } from "vitest";
import { createArticleRegistry } from "@/lib/content/engineering";
import { getProject } from "@/lib/content/projects";
import {
  articleMetadata,
  pageMetadata,
  projectMetadata,
  rootMetadata,
  siteTitle,
} from "@/lib/seo/metadata";
import { articleFixture } from "@/tests/helpers/articles";

const base = "https://portfolio.test";

describe("rootMetadata", () => {
  it("sets the identity, title default, and template", () => {
    expect(rootMetadata(null)).toEqual({
      title: {
        default: "Kshitij Pal · Backend Engineer",
        template: "%s · Kshitij Pal",
      },
      authors: [{ name: "Kshitij Pal" }],
      creator: "Kshitij Pal",
    });
  });

  it("adds metadataBase and the author URL only with a site URL", () => {
    const metadata = rootMetadata(base);
    expect(metadata.metadataBase).toEqual(new URL(base));
    expect(metadata.authors).toEqual([
      { name: "Kshitij Pal", url: "https://portfolio.test/" },
    ]);
  });

  it("declares no publisher, icons, theme color, or social handle", () => {
    const metadata = rootMetadata(base);
    for (const key of [
      "publisher",
      "icons",
      "themeColor",
      "twitter",
      "openGraph",
    ]) {
      expect(metadata).not.toHaveProperty(key);
    }
  });
});

describe("pageMetadata", () => {
  const input = {
    title: "Work",
    description: "Projects.",
    path: "/work",
  };

  it("omits canonical and og:url while no site URL is configured", () => {
    const metadata = pageMetadata(input, null);
    expect(metadata).not.toHaveProperty("alternates");
    expect(metadata.openGraph).not.toHaveProperty("url");
  });

  it("gives the page a canonical URL and full social metadata", () => {
    expect(pageMetadata(input, base)).toEqual({
      title: "Work",
      description: "Projects.",
      alternates: { canonical: "https://portfolio.test/work" },
      openGraph: {
        type: "website",
        title: "Work · Kshitij Pal",
        description: "Projects.",
        url: "https://portfolio.test/work",
        siteName: "Kshitij Pal",
        locale: "en_US",
      },
      twitter: {
        card: "summary",
        title: "Work · Kshitij Pal",
        description: "Projects.",
      },
    });
  });

  it("uses the site title, unaffected by the template, for Home", () => {
    const metadata = pageMetadata({ description: "Home.", path: "/" }, base);
    expect(metadata.title).toEqual({ absolute: siteTitle });
    expect(metadata.alternates).toEqual({
      canonical: "https://portfolio.test/",
    });
    expect(metadata.openGraph).toMatchObject({ title: siteTitle });
  });

  it("references no image, since none exists yet", () => {
    const metadata = pageMetadata(input, base);
    expect(metadata.openGraph).not.toHaveProperty("images");
    expect(metadata.twitter).not.toHaveProperty("images");
    expect(metadata.twitter).toMatchObject({ card: "summary" });
  });
});

describe("projectMetadata", () => {
  it("describes BillSync from its metadata, including its status", () => {
    const billsync = getProject("billsync");
    if (!billsync) throw new Error("BillSync is not registered.");

    const metadata = projectMetadata(billsync, base);
    expect(metadata.title).toBe("BillSync Case Study");
    expect(metadata.description).toBe(
      `${billsync.summary} Currently being developed.`,
    );
    expect(metadata.alternates).toEqual({
      canonical: "https://portfolio.test/work/billsync",
    });
  });
});

describe("articleMetadata", () => {
  const { articles } = createArticleRegistry([
    articleFixture({ slug: "fresh", publishedAt: "2026-03-01" }),
    articleFixture({
      slug: "revised",
      publishedAt: "2026-01-01",
      updatedAt: "2026-02-01",
    }),
  ]);
  const [fresh, revised] = articles;

  it("marks the page as an article with its publication date", () => {
    const metadata = articleMetadata(fresh, base);
    expect(metadata.title).toBe("Title of fresh");
    expect(metadata.description).toBe("Description of fresh.");
    expect(metadata.alternates).toEqual({
      canonical: "https://portfolio.test/engineering/fresh",
    });
    expect(metadata.openGraph).toMatchObject({
      type: "article",
      publishedTime: "2026-03-01",
      authors: ["Kshitij Pal"],
    });
    expect(metadata.openGraph).not.toHaveProperty("modifiedTime");
  });

  it("adds the modified time only for a revised article", () => {
    expect(articleMetadata(revised, base).openGraph).toMatchObject({
      publishedTime: "2026-01-01",
      modifiedTime: "2026-02-01",
    });
  });
});
