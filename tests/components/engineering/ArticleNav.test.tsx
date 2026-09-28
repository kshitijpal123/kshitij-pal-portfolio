import { render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { ArticleNav } from "@/components/engineering/ArticleNav";
import { createArticleRegistry } from "@/lib/content/engineering";
import { articleFixture } from "@/tests/helpers/articles";
import { installIntersectionObserver } from "@/tests/helpers/intersectionObserver";

beforeAll(() => {
  installIntersectionObserver();
});

const registry = createArticleRegistry([
  articleFixture({ slug: "first", title: "First", publishedAt: "2026-01-01" }),
  articleFixture({
    slug: "second",
    title: "Second",
    publishedAt: "2026-02-01",
  }),
  articleFixture({ slug: "third", title: "Third", publishedAt: "2026-03-01" }),
]);

function nav() {
  return within(screen.getByRole("navigation", { name: "Articles" }));
}

describe("ArticleNav", () => {
  it("links to the older and newer articles by title", () => {
    render(<ArticleNav {...registry.getAdjacentArticles("second")} />);

    expect(
      nav().getByRole("link", { name: "Previous article First" }),
    ).toHaveAttribute("href", "/engineering/first");
    expect(
      nav().getByRole("link", { name: "Next article Third" }),
    ).toHaveAttribute("href", "/engineering/third");
  });

  it("omits the previous link for the oldest and the next link for the newest", () => {
    const { unmount } = render(
      <ArticleNav {...registry.getAdjacentArticles("first")} />,
    );
    expect(nav().queryByText(/Previous article/)).not.toBeInTheDocument();
    expect(nav().getByText(/Next article/)).toBeInTheDocument();
    unmount();

    render(<ArticleNav {...registry.getAdjacentArticles("third")} />);
    expect(nav().getByText(/Previous article/)).toBeInTheDocument();
    expect(nav().queryByText(/Next article/)).not.toBeInTheDocument();
  });

  it("always links back to Engineering, with no list when there is nothing adjacent", () => {
    render(<ArticleNav />);

    expect(nav().queryByRole("list")).not.toBeInTheDocument();
    expect(
      nav().getByRole("link", { name: "Back to Engineering" }),
    ).toHaveAttribute("href", "/engineering");
  });
});
