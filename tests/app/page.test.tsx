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
      "journey-heading",
      "current-work-heading",
      "connect-heading",
    ]);
    expect(
      screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual([
      "Engineering Journey",
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
    expect(metadata.title).toEqual({
      absolute: "Kshitij Pal · Backend Engineer",
    });
    expect(metadata.description).toMatch(
      /^Backend Engineer building production-oriented systems with Node\.js and TypeScript/,
    );
  });

  it("describes the person in JSON-LD, with no URL until the domain is set", () => {
    const { container } = render(<HomePage />);

    const scripts = container.querySelectorAll(
      'script[type="application/ld+json"]',
    );
    expect(scripts).toHaveLength(1);
    expect(JSON.parse(scripts[0].textContent ?? "")).toEqual({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Person",
          name: "Kshitij Pal",
          jobTitle: "Backend Engineer",
          sameAs: [
            "https://github.com/kshitijpal123",
            "https://www.linkedin.com/in/kshitij-pal-963247195",
          ],
        },
      ],
    });
  });
});
