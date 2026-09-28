import { describe, expect, it } from "vitest";
import {
  currentTrajectory,
  durationInMonths,
  experience,
  experienceHref,
  experienceNewestFirst,
  formatDuration,
  formatYearMonth,
  isCurrentRole,
} from "@/lib/site/experience";

function entry(id: string) {
  const found = experience.find((item) => item.id === id);
  if (!found) throw new Error(`no experience entry "${id}"`);
  return found;
}

describe("experience data", () => {
  it("has three entries in chronological order", () => {
    expect(experience.map((item) => item.company)).toEqual([
      "The 10x Academy",
      "Digicorp Information Systems Pvt. Ltd.",
      "Khaitan & Co",
    ]);
    expect(experience.map((item) => item.shortName)).toEqual([
      "10x Academy",
      "Digicorp",
      "Khaitan & Co",
    ]);
  });

  it("lists the newest role first for the Experience page", () => {
    expect(experienceNewestFirst.map((item) => item.id)).toEqual([
      "khaitan-co",
      "digicorp",
      "10x-academy",
    ]);
  });

  it("uses stable, unique, kebab-case anchor ids", () => {
    const ids = experience.map((item) => item.id);
    expect(ids).toEqual(["10x-academy", "digicorp", "khaitan-co"]);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(experienceHref(entry("khaitan-co"))).toBe("/experience#khaitan-co");
  });

  it("stores machine-readable dates, with only the latest role current", () => {
    expect(experience.map((item) => [item.startDate, item.endDate])).toEqual([
      ["2021-05", "2021-11"],
      ["2021-12", "2024-03"],
      ["2024-06", null],
    ]);
    expect(experience.filter(isCurrentRole).map((item) => item.id)).toEqual([
      "khaitan-co",
    ]);
    for (const item of experience) {
      if (item.endDate) expect(item.endDate >= item.startDate).toBe(true);
    }
  });

  it("stores roles, employment, locations, and work modes", () => {
    expect(
      experience.map((item) => [
        item.role,
        item.employmentType,
        item.location,
        item.workMode,
      ]),
    ).toEqual([
      ["Full-Stack Developer Intern", "Full-time", undefined, "Remote"],
      ["Backend Developer", "Full-time", "Ahmedabad, Gujarat, India", "Remote"],
      [
        "Backend Developer",
        "Full-time",
        "Noida, Uttar Pradesh, India",
        "On-site",
      ],
    ]);
  });

  it("describes the engineering progression of each role", () => {
    expect(experience.map((item) => item.progression)).toEqual([
      {
        label: "Foundation",
        statement:
          "From learning software development to building applications.",
      },
      {
        label: "Backend Engineering",
        statement:
          "From building applications to building production backend systems.",
      },
      {
        label: "Architecture & Systems",
        statement:
          "From implementing backend systems to designing and evolving production architecture.",
      },
    ]);
  });

  it("groups each role's work into titled sections", () => {
    expect(
      experience.map((item) => item.sections.map((section) => section.title)),
    ).toEqual([
      ["Focus"],
      [
        "Backend Engineering",
        "Payment & Business Systems",
        "Software Engineering",
      ],
      [
        "Architecture & Backend Engineering",
        "Enterprise Workflow Systems",
        "HR Analytics & Reporting",
        "Cloud, CI/CD & Deployment",
        "AI & Automation",
      ],
    ]);
    for (const item of experience) {
      for (const section of item.sections) {
        expect(section.items.length).toBeGreaterThan(0);
      }
    }
  });

  it("keeps the supplied performance claim without a number", () => {
    const items = entry("khaitan-co").sections.flatMap((s) => s.items);
    expect(items).toContain(
      "Optimized complex MSSQL and Knex.js queries, reducing unnecessary database calls and improving performance.",
    );
  });

  it("lists only verified technologies", () => {
    expect(entry("10x-academy").technologies).toEqual([]);
    expect(entry("digicorp").technologies).toEqual([
      "Node.js",
      "REST APIs",
      "Microservices",
      "JavaScript",
      "SQL",
      "Payment Gateway Integration",
      "Git",
      "Agile",
      "Testing",
      "Code Reviews",
    ]);
    expect(entry("khaitan-co").technologies).toEqual([
      "Node.js",
      "TypeScript",
      "Microservices",
      "REST APIs",
      "MSSQL",
      "Knex.js",
      "RabbitMQ",
      "Redis",
      "Azure",
      "Azure AI",
      "n8n",
      "Airia",
      "JWT",
      "RBAC",
      "Swagger",
      "Git",
    ]);
    for (const item of experience) {
      expect(new Set(item.technologies).size).toBe(item.technologies.length);
    }
  });

  it("contains no metrics or unverified claims", () => {
    const text = JSON.stringify(experience);
    expect(text).not.toMatch(
      /\d+(\.\d+)?\s*(%|x faster|k\b|million|users|requests|ms\b)/i,
    );
    expect(text).not.toMatch(/led a team|team of|revenue|uptime/i);
  });

  it("names the current trajectory as areas, not titles", () => {
    expect(currentTrajectory).toEqual([
      "Backend",
      "Cloud",
      "Distributed Systems",
    ]);
  });
});

describe("experience dates", () => {
  it("formats a year-month without depending on locale", () => {
    expect(formatYearMonth("2021-05")).toBe("May 2021");
    expect(formatYearMonth("2024-12")).toBe("Dec 2024");
  });

  it("counts inclusive months in a completed role", () => {
    expect(durationInMonths("2021-05", "2021-11")).toBe(7);
    expect(durationInMonths("2021-12", "2024-03")).toBe(28);
    expect(durationInMonths("2024-06", "2024-06")).toBe(1);
  });

  it("formats a duration in years and months", () => {
    expect(formatDuration(1)).toBe("1 month");
    expect(formatDuration(7)).toBe("7 months");
    expect(formatDuration(12)).toBe("1 year");
    expect(formatDuration(28)).toBe("2 years 4 months");
  });
});
