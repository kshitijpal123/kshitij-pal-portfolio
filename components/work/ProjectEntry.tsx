import { Badge } from "@/components/ui/Badge";
import { Link } from "@/components/ui/Link";
import type { Project } from "@/lib/content/projects";

type ProjectEntryProps = {
  project: Project;
};

/** A Work index entry: metadata column, then description and technical areas. */
export function ProjectEntry({ project }: ProjectEntryProps) {
  const headingId = `project-${project.slug}-heading`;

  return (
    <article
      aria-labelledby={headingId}
      className="grid gap-8 lg:grid-cols-3 lg:gap-12"
    >
      <div>
        <p className="font-mono text-meta text-muted-foreground uppercase">
          {project.type}
        </p>
        <h2 id={headingId} className="mt-3 font-serif">
          {project.title}
        </h2>
        <p className="mt-2 text-body-lg text-muted-foreground">
          {project.tagline}
        </p>
        <dl className="mt-6">
          <dt className="font-mono text-meta text-muted-foreground uppercase">
            Status
          </dt>
          <dd className="mt-1.5">
            <Badge variant="accent">{project.status}</Badge>
          </dd>
        </dl>
      </div>

      <div className="lg:col-span-2">
        <p className="max-w-measure text-body-lg">{project.summary}</p>

        <h3 className="mt-8 text-body-sm">Key technical areas</h3>
        <ul className="mt-3 grid list-disc gap-x-8 gap-y-2 pl-5 text-muted-foreground marker:text-border-strong sm:grid-cols-2">
          {project.technologies.map((technology) => (
            <li key={technology}>{technology}</li>
          ))}
        </ul>

        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-1">
          <Link
            href={project.href}
            aria-describedby={headingId}
            className="inline-flex min-h-11 items-center font-medium"
          >
            Read case study
            <span aria-hidden="true" className="ml-1.5">
              →
            </span>
          </Link>
          {project.links?.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              variant="subtle"
              aria-describedby={headingId}
              className="inline-flex min-h-11 items-center text-body-sm"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </article>
  );
}
