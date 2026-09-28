import { JourneyMarker } from "@/components/experience/JourneyMarker";
import { JourneyMilestone } from "@/components/experience/JourneyMilestone";
import { JourneyTrajectory } from "@/components/experience/JourneyTrajectory";
import { Reveal } from "@/components/motion/Reveal";
import { Stagger } from "@/components/motion/Stagger";
import { StaggerItem } from "@/components/motion/StaggerItem";
import { Container } from "@/components/ui/Container";
import { Link } from "@/components/ui/Link";
import { Section } from "@/components/ui/Section";
import { currentTrajectory, experience } from "@/lib/site/experience";

/**
 * The Home "Engineering Journey": every role in `lib/site/experience.ts`,
 * oldest first, as stages on a trajectory that continues into the current
 * direction. From `lg` the stages sit in columns under `JourneyTrajectory`;
 * below it they form a vertical rail.
 *
 * The desktop grid assumes three stages plus the current-trajectory column,
 * matching the stage positions drawn by `JourneyTrajectory`.
 */
export function ExperienceSection() {
  return (
    <Section
      aria-labelledby="journey-heading"
      className="border-t border-border"
    >
      <Container>
        <Reveal className="grid gap-4 lg:grid-cols-3 lg:gap-12">
          <h2 id="journey-heading" className="font-serif">
            Engineering Journey
          </h2>
          <p className="max-w-measure text-body-lg text-muted-foreground lg:col-span-2">
            Three stages that shaped how I approach backend engineering.
          </p>
        </Reveal>

        <div className="mt-12 lg:mt-20">
          <JourneyTrajectory className="hidden lg:block" />

          <div className="lg:mt-8 lg:grid lg:grid-cols-4">
            <Stagger as="ol" className="lg:col-span-3 lg:grid lg:grid-cols-3">
              {experience.map((entry, index) => (
                <StaggerItem
                  key={entry.id}
                  as="li"
                  className="flex gap-5 lg:block lg:pr-8"
                >
                  <JourneyMilestone
                    entry={entry}
                    index={index}
                    leadsToTrajectory={index === experience.length - 1}
                  />
                </StaggerItem>
              ))}
            </Stagger>

            <Reveal className="flex gap-5 lg:block">
              <div aria-hidden="true" className="lg:hidden">
                <JourneyMarker variant="next" />
              </div>
              <div>
                <p className="font-mono text-meta font-medium text-accent uppercase">
                  Current trajectory
                </p>
                <p className="mt-3 text-body-sm">
                  {currentTrajectory.join(" · ")}
                </p>
              </div>
            </Reveal>
          </div>
        </div>

        <p className="mt-12 lg:mt-16">
          <Link
            href="/experience"
            className="inline-flex min-h-11 items-center font-medium"
          >
            View full experience
            <span aria-hidden="true" className="ml-1.5">
              →
            </span>
          </Link>
        </p>
      </Container>
    </Section>
  );
}
