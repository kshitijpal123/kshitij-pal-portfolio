import { Reveal } from "@/components/motion/Reveal";
import { Stagger } from "@/components/motion/Stagger";
import { StaggerItem } from "@/components/motion/StaggerItem";
import { Badge } from "@/components/ui/Badge";
import { Container } from "@/components/ui/Container";
import { Link } from "@/components/ui/Link";
import { Section } from "@/components/ui/Section";
import { Surface } from "@/components/ui/Surface";
import { currentWork, type CurrentWorkItem } from "@/lib/site/currentWork";

type CurrentWorkSectionProps = {
  items?: readonly CurrentWorkItem[];
};

export function CurrentWorkSection({
  items = currentWork,
}: CurrentWorkSectionProps) {
  return (
    <Section
      aria-labelledby="current-work-heading"
      className="border-t border-border"
    >
      <Container>
        <Reveal>
          <h2 id="current-work-heading" className="font-serif">
            Currently Working On
          </h2>
        </Reveal>

        <Stagger as="ul" className="mt-10 grid gap-6 lg:mt-12">
          {items.map((item, index) => (
            <StaggerItem key={item.name} as="li">
              <CurrentWorkDetails
                item={item}
                headingId={`current-work-item-${index}`}
              />
            </StaggerItem>
          ))}
        </Stagger>
      </Container>
    </Section>
  );
}

type CurrentWorkDetailsProps = {
  item: CurrentWorkItem;
  headingId: string;
};

function CurrentWorkDetails({ item, headingId }: CurrentWorkDetailsProps) {
  return (
    <Surface>
      <article aria-labelledby={headingId}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
          <h3 id={headingId} className="font-serif text-h2">
            {item.name}
          </h3>
          <dl className="sm:text-right">
            <dt className="font-mono text-meta text-muted-foreground uppercase">
              Status
            </dt>
            <dd className="mt-1.5">
              <Badge variant="accent">{item.status}</Badge>
            </dd>
          </dl>
        </div>

        <p className="mt-6 max-w-measure text-body-lg">{item.description}</p>

        <h4 className="mt-8 text-body-sm">Focus</h4>
        <ul className="mt-3 grid list-disc gap-x-8 gap-y-2 pl-5 text-muted-foreground marker:text-border-strong sm:grid-cols-2">
          {item.focus.map((area) => (
            <li key={area}>{area}</li>
          ))}
        </ul>

        {item.href && (
          <p className="mt-8">
            <Link
              href={item.href}
              aria-describedby={headingId}
              className="inline-flex min-h-11 items-center font-medium"
            >
              View project
              <span aria-hidden="true" className="ml-1.5">
                →
              </span>
            </Link>
          </p>
        )}
      </article>
    </Surface>
  );
}
