import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage, { metadata } from "@/app/page";

describe("HomePage", () => {
  it("renders the home hero as the only top-level heading", () => {
    render(<HomePage />);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(
      "Backend Engineer building production-oriented systems.",
    );
  });

  it("defines a page title and description", () => {
    expect(metadata.title).toBe("Kshitij Pal · Backend Engineer");
    expect(metadata.description).toEqual(expect.any(String));
  });
});
