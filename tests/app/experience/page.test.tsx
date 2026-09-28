import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import ExperiencePage, { metadata } from "@/app/experience/page";
import { siteConfig } from "@/lib/site/config";
import { experienceNewestFirst } from "@/lib/site/experience";
import { installIntersectionObserver } from "@/tests/helpers/intersectionObserver";

const configuredResumeHref = siteConfig.resumeHref;

beforeAll(() => {
  installIntersectionObserver();
});

afterEach(() => {
  siteConfig.resumeHref = configuredResumeHref;
});

function getRoleItems() {
  const [list] = within(
    screen.getByRole("region", { name: "Roles" }),
  ).getAllByRole("list");
  expect(list.tagName).toBe("OL");
  return Array.from(list.children) as HTMLElement[];
}

function getRole(id: string) {
  const role = document.getElementById(id);
  if (!role) throw new Error(`no role with id "${id}"`);
  return within(role);
}

function listTexts(list: HTMLElement) {
  return within(list)
    .getAllByRole("listitem")
    .map((item) => item.textContent.replace("·", "").trim());
}

describe("ExperiencePage", () => {
  it("renders Experience as the only top-level heading", () => {
    render(<ExperiencePage />);

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Experience");
    expect(
      screen.getByText(
        "A detailed look at my backend engineering journey, responsibilities, and technical work.",
      ),
    ).toBeInTheDocument();
  });

  it("renders the three roles newest first with stable anchor ids", () => {
    render(<ExperiencePage />);

    const items = getRoleItems();
    expect(items.map((item) => item.id)).toEqual([
      "khaitan-co",
      "digicorp",
      "10x-academy",
    ]);
    expect(
      items.map(
        (item) => within(item).getByRole("heading", { level: 2 }).textContent,
      ),
    ).toEqual([
      "Backend Developer, Khaitan & Co",
      "Backend Developer, Digicorp Information Systems Pvt. Ltd.",
      "Full-Stack Developer Intern, The 10x Academy",
    ]);
  });

  it("names each role heading with its role and company", () => {
    render(<ExperiencePage />);

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Backend Developer, Khaitan & Co",
      }),
    ).toBeInTheDocument();
  });

  it("renders each role's facts and period", () => {
    render(<ExperiencePage />);

    const khaitan = getRole("khaitan-co");
    expect(khaitan.getByText("Current")).toBeInTheDocument();
    expect(document.getElementById("khaitan-co")).toHaveTextContent(
      "Jun 2024 – Present",
    );
    expect(
      khaitan.getByText("Noida, Uttar Pradesh, India"),
    ).toBeInTheDocument();
    expect(khaitan.getByText("On-site")).toBeInTheDocument();
    expect(khaitan.getByText("Full-time")).toBeInTheDocument();

    const digicorp = getRole("digicorp");
    expect(digicorp.getByText("Ahmedabad, Gujarat, India")).toBeInTheDocument();
    expect(digicorp.getByText("Remote")).toBeInTheDocument();
    expect(digicorp.getByText("2 years 4 months")).toBeInTheDocument();
    expect(digicorp.queryByText("Current")).not.toBeInTheDocument();

    const academy = getRole("10x-academy");
    expect(academy.getByText("7 months")).toBeInTheDocument();
    expect(academy.queryByText("Location")).not.toBeInTheDocument();
  });

  it("derives no duration for the current role", () => {
    render(<ExperiencePage />);

    expect(getRoleItems()[0].textContent).not.toMatch(
      /\b\d+\s*(years?|months?|yrs?|mos?)\b/i,
    );
  });

  it("marks up periods with time elements", () => {
    render(<ExperiencePage />);

    const khaitan = document.getElementById("khaitan-co");
    expect(
      Array.from(khaitan?.querySelectorAll("time") ?? [], (time) =>
        time.getAttribute("dateTime"),
      ),
    ).toEqual(["2024-06"]);
    const digicorp = document.getElementById("digicorp");
    expect(
      Array.from(digicorp?.querySelectorAll("time") ?? [], (time) => [
        time.getAttribute("dateTime"),
        time.textContent,
      ]),
    ).toEqual([
      ["2021-12", "Dec 2021"],
      ["2024-03", "Mar 2024"],
    ]);
  });

  it("renders the summary and engineering progression of every role", () => {
    render(<ExperiencePage />);

    for (const entry of experienceNewestFirst) {
      const role = getRole(entry.id);
      expect(role.getByText(entry.summary)).toBeInTheDocument();
      const progression = within(
        role.getByRole("heading", { level: 3, name: "Engineering progression" })
          .parentElement as HTMLElement,
      );
      expect(
        progression.getByText(entry.progression.label),
      ).toBeInTheDocument();
      expect(
        progression.getByText(entry.progression.statement),
      ).toBeInTheDocument();
    }
  });

  it("renders each engineering section as an h3 over a list", () => {
    render(<ExperiencePage />);

    for (const entry of experienceNewestFirst) {
      const role = getRole(entry.id);
      for (const section of entry.sections) {
        const heading = role.getByRole("heading", {
          level: 3,
          name: section.title,
        });
        const list = heading.nextElementSibling as HTMLElement;
        expect(list.tagName).toBe("UL");
        expect(
          within(list)
            .getAllByRole("listitem")
            .map((item) => item.textContent),
        ).toEqual(section.items);
      }
    }
  });

  it("describes the payment gateway generically", () => {
    render(<ExperiencePage />);

    expect(
      getRole("digicorp").getByText(/Kuwait-based payment gateway/),
    ).toBeInTheDocument();
  });

  it("lists verified technologies without ratings", () => {
    render(<ExperiencePage />);

    expect(
      listTexts(
        screen.getByRole("list", { name: "Technologies at Khaitan & Co" }),
      ),
    ).toEqual(experienceNewestFirst[0].technologies);
    expect(
      listTexts(
        screen.getByRole("list", {
          name: "Technologies at Digicorp Information Systems Pvt. Ltd.",
        }),
      ),
    ).toEqual(experienceNewestFirst[1].technologies);
    expect(
      getRole("10x-academy").queryByRole("heading", { name: "Technologies" }),
    ).not.toBeInTheDocument();

    const text = screen.getByRole("region", { name: "Roles" }).textContent;
    expect(text).not.toMatch(/\b(expert|intermediate|beginner)\b|%|★/i);
  });

  it("hides the technology separators from assistive technology", () => {
    render(<ExperiencePage />);

    const list = screen.getByRole("list", {
      name: "Technologies at Khaitan & Co",
    });
    for (const separator of list.querySelectorAll("span")) {
      expect(separator).toHaveAttribute("aria-hidden", "true");
    }
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
