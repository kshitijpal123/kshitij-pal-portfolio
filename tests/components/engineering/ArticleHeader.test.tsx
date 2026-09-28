import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArticleHeader } from "@/components/engineering/ArticleHeader";
import { createArticleRegistry } from "@/lib/content/engineering";
import { articleFixture } from "@/tests/helpers/articles";

function renderHeader(overrides: Parameters<typeof articleFixture>[0]) {
  const [article] = createArticleRegistry([articleFixture(overrides)]).articles;
  if (!article) {
    throw new Error("fixture must be published");
  }
  render(<ArticleHeader article={article} />);
}

describe("ArticleHeader", () => {
  it("renders the eyebrow, title, description, date, and reading time", () => {
    renderHeader({
      slug: "a",
      title: "A title",
      publishedAt: "2026-09-28",
      readingTime: 6,
    });

    expect(screen.getByText("Engineering")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "A title" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Description of a.")).toBeInTheDocument();
    expect(
      screen.getByText("September 28, 2026").parentElement,
    ).toHaveTextContent("September 28, 2026 · 6 min read");
    expect(screen.queryByText(/Updated/)).not.toBeInTheDocument();
  });

  it("shows both dates when the article has been updated", () => {
    renderHeader({
      slug: "a",
      publishedAt: "2026-09-28",
      updatedAt: "2026-10-05",
      readingTime: 6,
    });

    expect(screen.getByText("October 5, 2026")).toHaveAttribute(
      "dateTime",
      "2026-10-05",
    );
    expect(screen.getByText("October 5, 2026").parentElement).toHaveTextContent(
      "Published September 28, 2026 · Updated October 5, 2026 · 6 min read",
    );
  });

  it("names the series when there is one", () => {
    renderHeader({ slug: "a", series: "Message queues" });

    expect(screen.getByText("Message queues")).toBeInTheDocument();
  });
});
