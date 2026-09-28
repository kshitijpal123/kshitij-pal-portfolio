import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import ExperiencePage, { metadata } from "@/app/experience/page";
import { siteConfig } from "@/lib/site/config";
import { experience } from "@/lib/site/experience";
import { installIntersectionObserver } from "@/tests/helpers/intersectionObserver";

const configuredResumeHref = siteConfig.resumeHref;

beforeAll(() => {
  installIntersectionObserver();
});

afterEach(() => {
  siteConfig.resumeHref = configuredResumeHref;
});

function getRoles() {
  return screen.getByRole("region", { name: "Roles" });
}

describe("ExperiencePage", () => {
  it("renders Experience as the only top-level heading", () => {
    render(<ExperiencePage />);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Experience");
    expect(
      screen.getByText(
        "A detailed look at my backend engineering experience, responsibilities, and technical work.",
      ),
    ).toBeInTheDocument();
  });

  it("renders one entry per role in the canonical experience data", () => {
    render(<ExperiencePage />);

    const [list] = within(getRoles()).getAllByRole("list");
    expect(list.tagName).toBe("OL");
    expect(list.children).toHaveLength(experience.length);
  });

  it("renders the role as an h2 with company and location", () => {
    render(<ExperiencePage />);

    const roles = within(getRoles());
    expect(
      roles.getByRole("heading", { level: 2, name: "Backend Developer" }),
    ).toBeInTheDocument();
    expect(roles.getByText("Digicorp Information Systems")).toBeInTheDocument();
    expect(roles.getByText("Ahmedabad, India")).toBeInTheDocument();
    expect(roles.getByText(experience[0].summary)).toBeInTheDocument();
  });

  it("renders the responsibilities under an h3", () => {
    render(<ExperiencePage />);

    const heading = screen.getByRole("heading", {
      level: 3,
      name: "Responsibilities",
    });
    const list = heading.nextElementSibling as HTMLElement;
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(experience[0].responsibilities);
  });

  it("renders every technology group without ratings", () => {
    render(<ExperiencePage />);

    expect(
      screen.getByRole("heading", { level: 3, name: "Technologies" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("term").map((term) => term.textContent)).toEqual(
      experience[0].technologies.map((group) => group.label),
    );
    expect(
      within(screen.getByRole("list", { name: "Databases" }))
        .getAllByRole("listitem")
        .map((item) => item.textContent.replace("·", "").trim()),
    ).toEqual(["PostgreSQL", "MySQL", "MongoDB", "Microsoft SQL Server"]);

    const text = getRoles().textContent;
    expect(text).not.toMatch(/expert|advanced|intermediate|beginner|%/i);
  });

  it("renders no period or duration while none is verified", () => {
    render(<ExperiencePage />);

    const text = getRoles().textContent;
    expect(text).not.toMatch(/\b(19|20)\d{2}\b/);
    expect(text).not.toMatch(/\b\d+(\.\d+)?\+?\s*(years?|yrs?|months?)\b/i);
    expect(text).not.toMatch(/present/i);
  });

  it("links to About and Contact without a resume link while none is configured", () => {
    siteConfig.resumeHref = null;
    render(<ExperiencePage />);

    const nav = within(screen.getByRole("navigation", { name: "Related" }));
    expect(nav.getByRole("link", { name: /About me/ })).toHaveAttribute(
      "href",
      "/about",
    );
    expect(nav.getByRole("link", { name: "Let's connect" })).toHaveAttribute(
      "href",
      "/contact",
    );
    expect(
      screen.queryByRole("link", { name: /resume/i }),
    ).not.toBeInTheDocument();
  });

  it("offers the configured resume for download", () => {
    siteConfig.resumeHref = "/resume/kshitij-pal-resume.pdf";
    render(<ExperiencePage />);

    const link = within(
      screen.getByRole("navigation", { name: "Related" }),
    ).getByRole("link", { name: "Download resume (PDF)" });
    expect(link).toHaveAttribute("href", "/resume/kshitij-pal-resume.pdf");
    expect(link).toHaveAttribute("download");
  });

  it("defines the page title and description", () => {
    expect(metadata.title).toBe("Experience · Kshitij Pal");
    expect(metadata.description).toBe(
      "A detailed overview of Kshitij Pal's backend engineering experience, responsibilities, and technical work.",
    );
  });
});
