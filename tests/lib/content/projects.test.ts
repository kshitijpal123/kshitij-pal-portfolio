import { describe, expect, it } from "vitest";
import {
  getProject,
  projects,
  toProjects,
  type ProjectDefinition,
} from "@/lib/content/projects";

const requiredText = [
  "slug",
  "title",
  "tagline",
  "summary",
  "lede",
  "status",
  "type",
  "problem",
  "solution",
  "metaTitle",
] as const;

describe("projects", () => {
  it.each(projects.map((project) => [project.slug, project]))(
    "%s declares every required field",
    (_, project) => {
      for (const field of requiredText) {
        expect(project[field].trim(), field).not.toBe("");
      }
      expect(project.technologies.length).toBeGreaterThan(0);
      expect(project.focus.length).toBeGreaterThan(0);
      expect(typeof project.featured).toBe("boolean");
      expect(project.CaseStudy).toEqual(expect.any(Function));
    },
  );

  it("uses kebab-case slugs and derives each href from the slug", () => {
    for (const project of projects) {
      expect(project.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(project.href).toBe(`/work/${project.slug}`);
    }
  });

  it("has no duplicate slugs", () => {
    const slugs = projects.map((project) => project.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("lists BillSync first as the featured project", () => {
    expect(projects[0]).toMatchObject({
      slug: "billsync",
      title: "BillSync",
      featured: true,
      href: "/work/billsync",
    });
  });

  it("finds a project by slug and returns undefined for unknown slugs", () => {
    expect(getProject("billsync")?.title).toBe("BillSync");
    expect(getProject("unknown")).toBeUndefined();
  });

  it("orders featured projects first and keeps registry order otherwise", () => {
    const base = projects[0] as ProjectDefinition;
    const ordered = toProjects([
      { ...base, slug: "a", featured: false },
      { ...base, slug: "b", featured: true },
      { ...base, slug: "c", featured: false },
    ]);
    expect(ordered.map((project) => project.slug)).toEqual(["b", "a", "c"]);
  });
});
