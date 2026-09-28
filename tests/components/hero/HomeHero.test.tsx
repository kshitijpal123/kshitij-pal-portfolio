import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HomeHero } from "@/components/hero/HomeHero";
import { siteConfig } from "@/lib/site/config";

const configuredPortrait = siteConfig.portrait;

afterEach(() => {
  siteConfig.portrait = configuredPortrait;
});

describe("HomeHero", () => {
  it("renders a single h1 with the positioning statement", () => {
    render(<HomeHero />);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(
      "Backend Engineer building production-oriented systems.",
    );
  });

  it("labels the hero region with its heading", () => {
    render(<HomeHero />);

    expect(
      screen.getByRole("region", {
        name: "Backend Engineer building production-oriented systems.",
      }),
    ).toBeInTheDocument();
  });

  it("renders the eyebrow and supporting copy", () => {
    render(<HomeHero />);

    expect(screen.getByText("Backend Engineer")).toBeInTheDocument();
    expect(
      screen.getByText(
        "I specialize in Node.js and TypeScript, building backend systems and APIs with a focus on architecture, reliability, and real-world engineering constraints.",
      ),
    ).toBeInTheDocument();
  });

  it("lists the technical specialization", () => {
    render(<HomeHero />);

    const list = screen.getByRole("list", { name: "Specialization" });
    expect(
      Array.from(list.querySelectorAll("li"), (item) => item.textContent),
    ).toEqual(["Node.js·", "TypeScript·", "Backend Architecture"]);
  });

  it("lists the supporting technologies", () => {
    render(<HomeHero />);

    const list = screen.getByRole("list", { name: "Technologies" });
    expect(
      Array.from(list.querySelectorAll("li"), (item) =>
        item.textContent.replace("·", ""),
      ),
    ).toEqual([
      "REST APIs",
      "PostgreSQL",
      "Distributed Systems",
      "Messaging",
      "Caching",
      "Cloud",
      "Docker",
      "CI/CD",
    ]);
  });

  it("hides the list separators from assistive technology", () => {
    render(<HomeHero />);

    for (const name of ["Specialization", "Technologies"]) {
      const list = screen.getByRole("list", { name });
      for (const separator of list.querySelectorAll("span")) {
        expect(separator).toHaveAttribute("aria-hidden", "true");
      }
    }
  });

  it("links the primary and secondary calls to action", () => {
    render(<HomeHero />);

    expect(
      screen.getByRole("link", { name: "Explore my work" }),
    ).toHaveAttribute("href", "/work");
    expect(screen.getByRole("link", { name: "Let's connect" })).toHaveAttribute(
      "href",
      "/contact",
    );
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("does not render a résumé link", () => {
    render(<HomeHero />);

    expect(
      screen.queryByRole("link", { name: /resume/i }),
    ).not.toBeInTheDocument();
  });

  it("renders no image while no portrait is configured", () => {
    siteConfig.portrait = null;
    render(<HomeHero />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders the configured portrait with its alt text", () => {
    siteConfig.portrait = {
      src: "/images/portrait.jpg",
      alt: "Portrait of the engineer",
      width: 600,
      height: 750,
    };
    render(<HomeHero />);

    expect(
      screen.getByRole("img", { name: "Portrait of the engineer" }),
    ).toBeInTheDocument();
  });
});
