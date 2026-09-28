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

  it("renders hero, experience, current work, then connect", () => {
    render(<HomePage />);

    const regions = screen.getAllByRole("region");
    expect(
      regions.map((region) => region.getAttribute("aria-labelledby")),
    ).toEqual([
      "home-hero-heading",
      "experience-heading",
      "current-work-heading",
      "connect-heading",
    ]);
    expect(
      screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual([
      "Experience",
      "Currently Working On",
      "Let's build something useful.",
    ]);
  });

  it("renders the technical visual inside the hero without adding focus stops", () => {
    render(<HomePage />);

    const hero = screen.getByRole("region", {
      name: "Backend Engineer building production-oriented systems.",
    });
    const visual = hero.querySelector("[aria-hidden='true'] svg[viewBox]");
    expect(visual).toBeInTheDocument();
    expect(visual?.querySelectorAll("a, button, [tabindex]")).toHaveLength(0);
    expect(
      Array.from(hero.querySelectorAll("a"), (link) => link.textContent),
    ).toEqual(["Explore my work", "Let's connect"]);
  });

  it("defines a page title and description", () => {
    expect(metadata.title).toBe("Kshitij Pal · Backend Engineer");
    expect(metadata.description).toEqual(expect.any(String));
  });
});
