import { render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { ExperienceSection } from "@/components/experience/ExperienceSection";
import type { ExperienceEntry } from "@/lib/site/experience";
import { installIntersectionObserver } from "@/tests/helpers/intersectionObserver";

beforeAll(() => {
  installIntersectionObserver();
});

function getEntries() {
  const region = screen.getByRole("region", { name: "Experience" });
  const [entryList] = within(region).getAllByRole("list");
  expect(entryList.tagName).toBe("OL");
  return Array.from(entryList.children) as HTMLElement[];
}

function listTexts(list: HTMLElement) {
  return within(list)
    .getAllByRole("listitem")
    .map((item) => item.textContent.replace("·", "").trim());
}

describe("ExperienceSection", () => {
  it("renders a region labelled by its h2", () => {
    render(<ExperienceSection />);

    const region = screen.getByRole("region", { name: "Experience" });
    expect(
      within(region).getByRole("heading", { level: 2, name: "Experience" }),
    ).toBeInTheDocument();
    expect(
      within(region).getByText(
        "Building backend systems across APIs, databases, cloud infrastructure, and distributed application components.",
      ),
    ).toBeInTheDocument();
  });

  it("introduces no h1", () => {
    render(<ExperienceSection />);

    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it("renders the Digicorp role with its company and location", () => {
    render(<ExperienceSection />);

    expect(
      screen.getByRole("heading", { level: 3, name: "Backend Developer" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Digicorp Information Systems"),
    ).toBeInTheDocument();
    expect(screen.getByText("Ahmedabad, India")).toBeInTheDocument();
  });

  it("renders the role summary", () => {
    render(<ExperienceSection />);

    expect(
      screen.getByText(
        "Worked on production-oriented backend systems using Node.js and Express.js, building APIs, integrating databases and services, and contributing to cloud-based application delivery.",
      ),
    ).toBeInTheDocument();
  });

  it("renders the responsibilities as a list", () => {
    render(<ExperienceSection />);

    const heading = screen.getByRole("heading", {
      level: 4,
      name: "Responsibilities",
    });
    const list = heading.nextElementSibling as HTMLElement;
    expect(list.tagName).toBe("UL");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(7);
    expect(items[0]).toHaveTextContent(
      "Built and maintained backend APIs using Node.js and Express.js.",
    );
  });

  it("renders the technology groups as terms with their technologies", () => {
    render(<ExperienceSection />);

    const terms = screen.getAllByRole("term").map((term) => term.textContent);
    expect(terms).toEqual([
      "Backend",
      "Databases",
      "Infrastructure",
      "Systems",
      "Tooling",
      "Additional exposure",
    ]);

    expect(listTexts(screen.getByRole("list", { name: "Backend" }))).toEqual([
      "Node.js",
      "Express.js",
      "TypeScript",
      "REST APIs",
    ]);
    expect(listTexts(screen.getByRole("list", { name: "Databases" }))).toEqual([
      "PostgreSQL",
      "MySQL",
      "MongoDB",
      "Microsoft SQL Server",
    ]);
    expect(listTexts(screen.getByRole("list", { name: "Systems" }))).toEqual(
      expect.arrayContaining(["Redis", "RabbitMQ", "Microservices"]),
    );
    expect(
      listTexts(screen.getByRole("list", { name: "Infrastructure" })),
    ).toEqual(expect.arrayContaining(["Azure", "AWS", "Docker", "CI/CD"]));
    expect(listTexts(screen.getByRole("list", { name: "Tooling" }))).toEqual(
      expect.arrayContaining([
        "Git",
        "Jira",
        "Azure DevOps",
        "Swagger/OpenAPI",
      ]),
    );
    expect(
      listTexts(screen.getByRole("list", { name: "Additional exposure" })),
    ).toEqual(["Angular", "EJS"]);
  });

  it("hides the technology separators from assistive technology", () => {
    render(<ExperienceSection />);

    for (const definition of screen.getAllByRole("definition")) {
      for (const separator of definition.querySelectorAll("span")) {
        expect(separator).toHaveAttribute("aria-hidden", "true");
      }
    }
  });

  it("contains no metrics or unverified claims", () => {
    render(<ExperienceSection />);

    const text = screen.getByRole("region", { name: "Experience" }).textContent;
    expect(text).not.toMatch(/\d+(\.\d+)?\s*(%|x\b|k\b|million|users)/i);
    expect(text).not.toMatch(/led a team|owned the entire|architected/i);
  });

  it("renders no period while none is verified", () => {
    render(<ExperienceSection />);

    const region = screen.getByRole("region", { name: "Experience" });
    expect(region.textContent).not.toMatch(/\b(19|20)\d{2}\b/);
  });

  it("renders multiple entries in order with an optional period", () => {
    const entries: ExperienceEntry[] = [
      {
        company: "Second Company",
        role: "Senior Role",
        location: "Remote",
        period: "Later period",
        summary: "Second summary.",
        responsibilities: ["Second responsibility."],
        technologies: [{ label: "Stack", items: ["Tool A"] }],
      },
      {
        company: "First Company",
        role: "Junior Role",
        location: "Office",
        summary: "First summary.",
        responsibilities: ["First responsibility."],
        technologies: [{ label: "Stack", items: ["Tool B"] }],
      },
    ];
    render(<ExperienceSection entries={entries} />);

    const items = getEntries();
    expect(items).toHaveLength(2);
    expect(
      within(items[0]).getByRole("heading", { level: 3 }),
    ).toHaveTextContent("Senior Role");
    expect(within(items[0]).getByText("Later period")).toBeInTheDocument();
    expect(
      within(items[1]).getByRole("heading", { level: 3 }),
    ).toHaveTextContent("Junior Role");
    expect(within(items[1]).getByText("First Company")).toBeInTheDocument();
    expect(
      screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
    ).toEqual(["Senior Role", "Junior Role"]);
  });
});
