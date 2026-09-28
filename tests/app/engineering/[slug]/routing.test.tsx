import { render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import ArticlePage, {
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

vi.mock("@/lib/content/engineering", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/content/engineering")>();
  const { articleFixture } = await import("@/tests/helpers/articles");
  return {
    ...actual,
    ...actual.createArticleRegistry([
      articleFixture({
        slug: "first",
        title: "First",
        publishedAt: "2026-01-01",
      }),
      articleFixture({
        slug: "work-in-progress",
        publishedAt: "2026-01-15",
        status: "draft",
      }),
      articleFixture({
        slug: "second",
        title: "Second",
        publishedAt: "2026-02-01",
      }),
      articleFixture({
        slug: "third",
        title: "Third",
        publishedAt: "2026-03-01",
      }),
    ]),
  };
});

beforeAll(() => {
  installIntersectionObserver();
});

function props(slug: string) {
  return {
    params: Promise.resolve({ slug }),
    searchParams: Promise.resolve({}),
  };
}

describe("ArticlePage with drafts and several articles", () => {
  it("never prerenders, renders, or describes a draft", async () => {
    expect(generateStaticParams()).toEqual([
      { slug: "third" },
      { slug: "second" },
      { slug: "first" },
    ]);
    await expect(ArticlePage(props("work-in-progress"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(await generateMetadata(props("work-in-progress"))).toEqual({});
  });

  it("renders the article body", async () => {
    render(await ArticlePage(props("second")));

    expect(screen.getByText("Body of second")).toBeInTheDocument();
  });

  it("links to the chronologically adjacent published articles, skipping drafts", async () => {
    render(await ArticlePage(props("second")));

    const nav = within(screen.getByRole("navigation", { name: "Articles" }));
    expect(
      nav.getByRole("link", { name: "Previous article First" }),
    ).toHaveAttribute("href", "/engineering/first");
    expect(
      nav.getByRole("link", { name: "Next article Third" }),
    ).toHaveAttribute("href", "/engineering/third");
  });
});
