import { Badge } from "@/components/ui/Badge";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import type { Project } from "@/lib/content/projects";
import { cx } from "@/lib/utils/cx";

type ProjectHeaderProps = {
  project: Project;
};

/**
 * The case-study hero. Above the fold, so it uses no motion primitives and
 * renders fully without JavaScript.
 */
export function ProjectHeader({ project }: ProjectHeaderProps) {
  return (
    <Section
      spacing="editorial"
      aria-labelledby="project-heading"
      className="pb-section"
    >
      <Container className="grid gap-12 lg:grid-cols-3 lg:gap-12">
        <div className="lg:col-span-2">
          <p className="flex items-center gap-3 font-mono text-meta text-muted-foreground uppercase">
            <span aria-hidden="true" className="h-px w-6 bg-border-strong" />
            {project.type} · {project.status}
          </p>
          <h1
            id="project-heading"
            className="mt-6 font-serif text-h1 font-semibold sm:text-display"
          >
            {project.title}
          </h1>
          <p className="mt-6 max-w-measure text-body-lg text-muted-foreground">
            {project.lede}
          </p>
        </div>

        <dl className="grid content-start gap-6 border-l border-border pl-4 lg:mt-3">
          <div>
            <dt className="font-mono text-meta text-muted-foreground uppercase">
              Status
            </dt>
            <dd className="mt-1.5">
              <Badge variant="accent">{project.status}</Badge>
            </dd>
          </div>
          <div>
            <dt className="font-mono text-meta text-muted-foreground uppercase">
              Focus
            </dt>
            <dd className="mt-1.5">
              <ul
                aria-label="Focus"
                className="flex flex-wrap gap-x-2 gap-y-1 text-body-sm"
              >
                {project.focus.map((area, index) => (
                  <li key={area}>
                    {area}
                    {index < project.focus.length - 1 && (
                      <span
                        aria-hidden="true"
                        className="ml-2 text-muted-foreground"
                      >
                        ·
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        </dl>

        <div className="grid gap-px overflow-hidden rounded-container border border-border bg-border md:grid-cols-2 lg:col-span-3">
          <ProblemSolutionItem label="Problem" text={project.problem} />
          <ProblemSolutionItem
            label="Solution"
            text={project.solution}
            accent
          />
        </div>
      </Container>
    </Section>
  );
}

type ProblemSolutionItemProps = {
  label: string;
  text: string;
  accent?: boolean;
};

function ProblemSolutionItem({
  label,
  text,
  accent,
}: ProblemSolutionItemProps) {
  return (
    <div className="bg-surface p-card">
      <p
        className={cx(
          "font-mono text-meta uppercase",
          accent ? "text-accent" : "text-muted-foreground",
        )}
      >
        {label}
      </p>
      <p className="mt-3 max-w-measure">{text}</p>
    </div>
  );
}
