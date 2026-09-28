import { render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import ArticlePage, {
  dynamicParams,
  generateMetadata,
  generateStaticParams,
} from "@/app/engineering/[slug]/page";
import { installIntersectionObserver } from "@/tests/helpers/intersectionObserver";

const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);

vi.mock("next/navigation", () => ({ notFound }));

beforeAll(() => {
  installIntersectionObserver();
});

const slug = "ai-extraction-is-not-the-source-of-truth";
const title = "Why AI extraction should not become your source of truth";

function props(value: string) {
  return {
    params: Promise.resolve({ slug: value }),
    searchParams: Promise.resolve({}),
  };
}

async function renderArticle() {
  render(await ArticlePage(props(slug)));
}

describe("ArticlePage (published article)", () => {
  it("renders the title as the only h1, labelling the article", async () => {
    await renderArticle();

    const h1 = document.querySelectorAll("h1");
    expect(h1).toHaveLength(1);
    expect(h1[0]).toHaveTextContent(title);
    expect(screen.getByRole("article", { name: title })).toBeInTheDocument();
  });

  it("renders the publication date and reading time", async () => {
    await renderArticle();

    const date = screen.getByText("September 28, 2026");
    expect(date.tagName).toBe("TIME");
    expect(date).toHaveAttribute("dateTime", "2026-09-28");
    expect(date.parentElement).toHaveTextContent(
      "September 28, 2026 · 5 min read",
    );
  });

  it("renders the MDX body with h2 sections and h3 only beneath an h2", async () => {
    await renderArticle();

    const levels = Array.from(
      document.querySelectorAll("article h1, article h2, article h3"),
      (heading) => Number(heading.tagName[1]),
    );
    expect(levels[0]).toBe(1);
    expect(levels[1]).toBe(2);
    levels.forEach((level, index) => {
      if (index > 0) {
        expect(level - (levels[index - 1] ?? 0)).toBeLessThanOrEqual(1);
      }
    });
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "An extraction is an interpretation",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "What is implemented" }),
    ).toBeInTheDocument();
    expect(document.querySelectorAll("pre code")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "BillSync" })).toHaveAttribute(
      "href",
      "/work/billsync",
    );
  });

  it("separates what is implemented, designed, and not built yet", async () => {
    await renderArticle();

    expect(
      screen
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual([
      "What is implemented",
      "What the architecture is designed to do",
      "What is not built yet",
    ]);
  });

  it("makes no metric, launch, customer, or production claims", async () => {
    await renderArticle();

    expect(screen.getByRole("article").textContent).not.toMatch(
      /production-ready|in production|launched|customers?|revenue|uptime|accuracy|latency|throughput|\d+\s?%/i,
    );
  });

  it("links back to Engineering and shows no adjacent links for a single article", async () => {
    await renderArticle();

    const nav = within(screen.getByRole("navigation", { name: "Articles" }));
    expect(
      nav.getByRole("link", { name: "Back to Engineering" }),
    ).toHaveAttribute("href", "/engineering");
    expect(
      nav.queryByText(/Previous article|Next article/),
    ).not.toBeInTheDocument();
  });
});

describe("ArticlePage routing", () => {
  it("prerenders only published articles and 404s anything else", () => {
    expect(generateStaticParams()).toEqual([{ slug }]);
    expect(dynamicParams).toBe(false);
  });

  it("calls notFound for an unknown slug", async () => {
    await expect(ArticlePage(props("unknown"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(notFound).toHaveBeenCalled();
  });

  it("titles the page from the article metadata", async () => {
    const metadata = await generateMetadata(props(slug));
    expect(metadata.title).toBe(title);
    expect(metadata.description).toMatch(/^Separating the original document/);
    expect(metadata.openGraph).toMatchObject({
      type: "article",
      publishedTime: "2026-09-28",
    });
    expect(await generateMetadata(props("unknown"))).toEqual({});
  });

  it("describes the article in JSON-LD from its typed metadata", async () => {
    await renderArticle();

    const scripts = document.querySelectorAll(
      'script[type="application/ld+json"]',
    );
    expect(scripts).toHaveLength(1);
    expect(JSON.parse(scripts[0].textContent ?? "")).toMatchObject({
      "@type": "Article",
      headline: title,
      datePublished: "2026-09-28",
      author: { "@type": "Person", name: "Kshitij Pal" },
    });
    expect(scripts[0].textContent).not.toMatch(/dateModified/);
  });
});
