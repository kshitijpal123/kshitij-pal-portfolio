import NextLink from "next/link";
import { ExperiencePeriod } from "@/components/experience/ExperiencePeriod";
import { JourneyMarker } from "@/components/experience/JourneyMarker";
import {
  experienceHref,
  isCurrentRole,
  type ExperienceEntry,
} from "@/lib/site/experience";
import { cx } from "@/lib/utils/cx";

type JourneyMilestoneProps = {
  entry: ExperienceEntry;
  index: number;
  /** The vertical rail continues dashed into the current trajectory. */
  leadsToTrajectory: boolean;
};

/**
 * One stage of the Home journey: company, role, period, and the progression
 * it represents. Below `lg` it hangs on a vertical rail; from `lg` it is one
 * column under the trajectory, which draws its marker.
 */
export function JourneyMilestone({
  entry,
  index,
  leadsToTrajectory,
}: JourneyMilestoneProps) {
  return (
    <>
      <div aria-hidden="true" className="flex flex-col items-center lg:hidden">
        <JourneyMarker variant={isCurrentRole(entry) ? "current" : "past"} />
        <span
          className={cx(
            "mt-1 flex-1",
            leadsToTrajectory
              ? "w-0 border-l border-dashed border-border-strong"
              : "w-px bg-border-strong",
          )}
        />
      </div>

      <div className="min-w-0 pb-12 lg:pb-0">
        <p className="font-mono text-meta text-muted-foreground uppercase">
          <span aria-hidden="true">
            {String(index + 1).padStart(2, "0")}
            <span className="mx-2">·</span>
          </span>
          <ExperiencePeriod entry={entry} />
        </p>
        <h3 className="mt-3 font-serif">
          <NextLink
            href={experienceHref(entry)}
            className="transition-colors hover:text-accent"
          >
            {entry.shortName}
          </NextLink>
        </h3>
        <p className="mt-1 text-body-sm text-muted-foreground">{entry.role}</p>
        <p className="mt-6 font-mono text-meta font-medium uppercase">
          {entry.progression.label}
        </p>
        <p className="mt-1.5 max-w-measure text-body-sm text-muted-foreground">
          {entry.progression.statement}
        </p>
      </div>
    </>
  );
}
