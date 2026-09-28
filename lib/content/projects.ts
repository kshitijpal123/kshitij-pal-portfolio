import type { MDXContent } from "mdx/types";
import { billsync } from "@/content/projects/billsync/project";

export type ProjectLink = {
  label: string;
  href: string;
};

/**
 * One project, declared in `content/projects/<slug>/project.ts` next to the
 * `index.mdx` that holds its case study.
 */
export type ProjectDefinition = {
  /** Kebab-case; must match the project's directory name. */
  slug: string;
  title: string;
  /** One line naming what the project is. */
  tagline: string;
  /** Short description for the Work index and the page description. */
  summary: string;
  /** Opening paragraph of the case study. */
  lede: string;
  status: string;
  /** Kind of work, for example "Personal project". */
  type: string;
  /** Key technical areas and technologies, shown on the Work index. */
  technologies: readonly string[];
  /** Focus areas, shown in the case-study header. */
  focus: readonly string[];
  problem: string;
  solution: string;
  /** Document title of the case-study route. */
  metaTitle: string;
  /** Featured projects are listed first on the Work index. */
  featured: boolean;
  /** Only real, public destinations (repository, live site). */
  links?: readonly ProjectLink[];
  CaseStudy: MDXContent;
};

export type Project = ProjectDefinition & {
  href: string;
};

/** Registry order is the Work index order within featured and non-featured. */
const definitions: readonly ProjectDefinition[] = [billsync];

export function toProjects(
  entries: readonly ProjectDefinition[],
): readonly Project[] {
  return entries
    .map((entry) => ({ ...entry, href: `/work/${entry.slug}` }))
    .sort((a, b) => Number(b.featured) - Number(a.featured));
}

export const projects = toProjects(definitions);

export function getProject(slug: string): Project | undefined {
  return projects.find((project) => project.slug === slug);
}
