import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArticleList } from "@/components/engineering/ArticleList";
import { createArticleRegistry } from "@/lib/content/engineering";
import { articleFixture } from "@/tests/helpers/articles";

describe("ArticleList", () => {
  it("renders each article with its date, title, description, reading time, and link", () => {
    const { articles } = createArticleRegistry([
      articleFixture({
        slug: "queues",
        title: "Queues",
        description: "Why work leaves the request path.",
        publishedAt: "2026-09-28",
        readingTime: 4,
      }),
    ]);
    render(<ArticleList articles={articles} />);

    const entry = within(screen.getByRole("article"));
    expect(
      entry.getByRole("heading", { level: 2, name: "Queues" }),
    ).toBeInTheDocument();
    expect(entry.getByText("September 28, 2026")).toHaveAttribute(
      "dateTime",
      "2026-09-28",
    );
    expect(
      entry.getByText("Why work leaves the request path."),
    ).toBeInTheDocument();
    expect(entry.getByText("4 min read")).toBeInTheDocument();

    const link = entry.getByRole("link", { name: "Read article" });
    expect(link).toHaveAttribute("href", "/engineering/queues");
    expect(link).toHaveAccessibleDescription("Queues");
  });

  it("renders articles as an ordered list in the order given", () => {
    const { articles } = createArticleRegistry([
      articleFixture({ slug: "older", publishedAt: "2026-01-01" }),
      articleFixture({ slug: "newer", publishedAt: "2026-02-01" }),
    ]);
    render(<ArticleList articles={articles} />);

    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toEqual(["Title of newer", "Title of older"]);
  });

  it("renders a deliberate empty state when nothing is published", () => {
    render(<ArticleList articles={[]} />);

    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(
      screen.getByText(/Technical notes are being prepared/),
    ).toBeInTheDocument();
  });
});
