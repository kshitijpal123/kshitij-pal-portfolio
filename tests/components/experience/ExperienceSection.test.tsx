import { readdirSync, readFileSync } from "node:fs";
import { render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { ExperienceSection } from "@/components/experience/ExperienceSection";
import { experience } from "@/lib/site/experience";
import { installIntersectionObserver } from "@/tests/helpers/intersectionObserver";

beforeAll(() => {
  installIntersectionObserver();
});

function getRegion() {
  return screen.getByRole("region", { name: "Engineering Journey" });
}

function getMilestones() {
  const list = within(getRegion()).getByRole("list");
  expect(list.tagName).toBe("OL");
  return Array.from(list.children) as HTMLElement[];
}

describe("ExperienceSection", () => {
  it("renders a region labelled by its h2 and no h1", () => {
    render(<ExperienceSection />);

    expect(
      within(getRegion()).getByRole("heading", {
        level: 2,
        name: "Engineering Journey",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Three stages that shaped how I approach backend engineering.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it("renders every role from the canonical data, oldest first", () => {
    render(<ExperienceSection />);

    const milestones = getMilestones();
    expect(milestones).toHaveLength(experience.length);
    expect(
      milestones.map(
        (item) => within(item).getByRole("heading", { level: 3 }).textContent,
      ),
    ).toEqual(["10x Academy", "Digicorp", "Khaitan & Co"]);
  });

  it("shows each stage's role, period, and progression", () => {
    render(<ExperienceSection />);

    const [academy, digicorp, khaitan] = getMilestones().map((item) =>
      within(item),
    );
    expect(
      academy.getByText("Full-Stack Developer Intern"),
    ).toBeInTheDocument();
    expect(academy.getByText("Foundation")).toBeInTheDocument();
    expect(
      academy.getByText(
        "From learning software development to building applications.",
      ),
    ).toBeInTheDocument();
    expect(digicorp.getByText("Backend Engineering")).toBeInTheDocument();
    expect(
      digicorp.getByText(
        "From building applications to building production backend systems.",
      ),
    ).toBeInTheDocument();
    expect(khaitan.getByText("Architecture & Systems")).toBeInTheDocument();
    expect(
      khaitan.getByText(
        "From implementing backend systems to designing and evolving production architecture.",
      ),
    ).toBeInTheDocument();
    expect(getMilestones()[2]).toHaveTextContent("Jun 2024 – Present");
  });

  it("marks up periods with machine-readable time elements", () => {
    render(<ExperienceSection />);

    const times = Array.from(getRegion().querySelectorAll("time"), (time) => [
      time.getAttribute("dateTime"),
      time.textContent,
    ]);
    expect(times).toEqual([
      ["2021-05", "May 2021"],
      ["2021-11", "Nov 2021"],
      ["2021-12", "Dec 2021"],
      ["2024-03", "Mar 2024"],
      ["2024-06", "Jun 2024"],
    ]);
  });

  it("links each stage to its role on the Experience page", () => {
    render(<ExperienceSection />);

    expect(
      getMilestones().map((item) =>
        within(item).getByRole("link").getAttribute("href"),
      ),
    ).toEqual([
      "/experience#10x-academy",
      "/experience#digicorp",
      "/experience#khaitan-co",
    ]);
  });

  it("keeps full responsibilities off the Home page", () => {
    render(<ExperienceSection />);

    const text = getRegion().textContent;
    for (const item of experience) {
      for (const section of item.sections) {
        for (const responsibility of section.items) {
          expect(text).not.toContain(responsibility);
        }
      }
    }
  });

  it("continues into the current trajectory", () => {
    render(<ExperienceSection />);

    const region = within(getRegion());
    expect(region.getByText("Current trajectory")).toBeInTheDocument();
    expect(
      region.getByText("Backend · Cloud · Distributed Systems"),
    ).toBeInTheDocument();
  });

  it("links to the full Experience page", () => {
    render(<ExperienceSection />);

    expect(
      within(getRegion()).getByRole("link", { name: "View full experience" }),
    ).toHaveAttribute("href", "/experience");
  });

  it("hides the trajectory and rail markers from assistive technology", () => {
    render(<ExperienceSection />);

    for (const svg of getRegion().querySelectorAll("svg")) {
      expect(svg.closest("[aria-hidden='true']")).not.toBeNull();
      expect(svg).toHaveAttribute("focusable", "false");
    }
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("hard-codes no company or role outside the canonical data", () => {
    const sources = [
      ...readdirSync("components/experience").map(
        (file) => `components/experience/${file}`,
      ),
      "app/page.tsx",
      "app/experience/page.tsx",
    ];
    for (const source of sources) {
      expect(readFileSync(source, "utf8")).not.toMatch(
        /10x|Digicorp|Khaitan|Developer Intern|Backend Developer/,
      );
    }
  });

  it("contains no metrics or durations", () => {
    render(<ExperienceSection />);

    const text = getRegion().textContent;
    expect(text).not.toMatch(/\d+(\.\d+)?\s*(%|k\b|million|users)/i);
    expect(text).not.toMatch(/\b\d+\s*(years?|yrs?|months?|mos?)\b/i);
  });
});
