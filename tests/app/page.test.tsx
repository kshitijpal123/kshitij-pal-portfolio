import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import HomePage, { metadata } from "@/app/page";
import { installIntersectionObserver } from "@/tests/helpers/intersectionObserver";

beforeAll(() => {
  installIntersectionObserver();
});

describe("HomePage", () => {
  it("renders the home hero as the only top-level heading", () => {
    render(<HomePage />);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(
      "Backend Engineer building production-oriented systems.",
    );
  });

  it("renders the experience section directly after the hero", () => {
    render(<HomePage />);

    const regions = screen.getAllByRole("region");
    expect(
      regions.map((region) => region.getAttribute("aria-labelledby")),
    ).toEqual(["home-hero-heading", "experience-heading"]);
    expect(
      screen.getByRole("heading", { level: 2, name: "Experience" }),
    ).toBeInTheDocument();
  });

  it("defines a page title and description", () => {
    expect(metadata.title).toBe("Kshitij Pal · Backend Engineer");
    expect(metadata.description).toEqual(expect.any(String));
  });
});
