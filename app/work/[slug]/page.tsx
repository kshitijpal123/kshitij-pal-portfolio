import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CaseStudyNav } from "@/components/work/CaseStudyNav";
import { ProjectHeader } from "@/components/work/ProjectHeader";
import { getProject, projects } from "@/lib/content/projects";
import { projectMetadata } from "@/lib/seo/metadata";

export const dynamicParams = false;

export function generateStaticParams() {
  return projects.map((project) => ({ slug: project.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/work/[slug]">): Promise<Metadata> {
  const project = getProject((await params).slug);

  return project ? projectMetadata(project) : {};
}

export default async function ProjectPage({
  params,
}: PageProps<"/work/[slug]">) {
  const project = getProject((await params).slug);

  if (!project) {
    notFound();
  }

  const { CaseStudy } = project;

  return (
    <article aria-labelledby="project-heading">
      <ProjectHeader project={project} />
      <CaseStudy />
      <CaseStudyNav />
    </article>
  );
}
