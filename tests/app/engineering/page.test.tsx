import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import EngineeringPage, { metadata } from "@/app/engineering/page";

vi.mock("@/lib/content/engineering", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/content/engineering")>();
  const { articleFixture } = await import("@/tests/helpers/articles");
  return {
    ...actual,
    ...actual.createArticleRegistry([
      articleFixture({
        slug: "older",
        title: "Older",
        publishedAt: "2026-01-10",
      }),
      articleFixture({
        slug: "unfinished",
        title: "Unfinished",
        publishedAt: "2026-03-01",
        status: "draft",
      }),
      articleFixture({
        slug: "newer",
        title: "Newer",
        publishedAt: "2026-02-20",
      }),
    ]),
  };
});

describe("EngineeringPage", () => {
  it("renders Engineering as the only h1, with its eyebrow and intro", () => {
    render(<EngineeringPage />);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Engineering");
    expect(
      screen.getByText(/A chronological collection of technical notes/),
    ).toBeInTheDocument();
  });

  it("lists published articles newest first, linking to their routes", () => {
    render(<EngineeringPage />);

    const list = within(screen.getByRole("region", { name: "Articles" }));
    expect(
      list.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toEqual(["Newer", "Older"]);
    expect(
      list
        .getAllByRole("link", { name: "Read article" })
        .map((link) => link.getAttribute("href")),
    ).toEqual(["/engineering/newer", "/engineering/older"]);
  });

  it("does not render drafts or the word draft", () => {
    render(<EngineeringPage />);

    expect(screen.queryByText("Unfinished")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/draft/i);
  });

  it("defines a page title and description", () => {
    expect(metadata.title).toBe("Kshitij Pal · Engineering");
    expect(metadata.description).toEqual(expect.any(String));
  });
});
