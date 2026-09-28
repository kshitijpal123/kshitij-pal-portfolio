import { render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import {
  JourneyTrajectory,
  livePulse,
  livePulseVariants,
} from "@/components/experience/JourneyTrajectory";
import {
  enterViewport,
  installIntersectionObserver,
} from "@/tests/helpers/intersectionObserver";

beforeAll(() => {
  installIntersectionObserver();
});

function renderTrajectory() {
  const { container } = render(<JourneyTrajectory className="w-full" />);
  const wrapper = container.firstElementChild;
  const svg = container.querySelector("svg");
  if (!wrapper || !svg) throw new Error("trajectory did not render an svg");
  return { wrapper, svg };
}

describe("JourneyTrajectory", () => {
  it("renders a scalable svg", () => {
    const { wrapper, svg } = renderTrajectory();

    expect(wrapper).toHaveClass("w-full");
    expect(svg).toHaveAttribute("viewBox", "0 0 1200 200");
  });

  it("is decorative, with no text, roles, or focus stops", () => {
    const { wrapper, svg } = renderTrajectory();

    expect(wrapper).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(svg.querySelectorAll("text")).toHaveLength(0);
    expect(
      wrapper.querySelectorAll("a, button, [tabindex], [role]"),
    ).toHaveLength(0);
  });

  it("uses only design token colors", () => {
    const { svg } = renderTrajectory();

    for (const element of svg.querySelectorAll("[fill], [stroke]")) {
      expect(element.getAttribute("fill") ?? "none").toBe("none");
      expect(element.getAttribute("stroke")).toBeNull();
    }
  });

  it("starts hidden and marks animated parts for the no-script fallback", () => {
    const { svg } = renderTrajectory();

    const parts = svg.querySelectorAll("[data-motion-reveal]");
    expect(parts.length).toBeGreaterThan(0);
    const clipSweeps = svg.querySelectorAll("clipPath [data-motion-reveal]");
    expect(clipSweeps).toHaveLength(3);
    for (const sweep of clipSweeps) {
      expect(sweep.getAttribute("style")).toMatch(/translateX\(-\d+/);
    }
  });

  it("settles in its complete state after entering the viewport, once", async () => {
    const { svg } = renderTrajectory();

    enterViewport();

    await waitFor(
      () => {
        for (const part of svg.querySelectorAll("[data-motion-reveal]")) {
          expect(part).not.toHaveStyle({ opacity: "0" });
          expect(part.getAttribute("style") ?? "").not.toMatch(
            /translate[XY]?\(-?[1-9]/,
          );
        }
      },
      { timeout: 4000 },
    );
  });
});

type LiveTarget = {
  opacity: number[];
  scale: number[];
  transition: {
    delay: number;
    duration: number;
    ease: string;
    repeat: number;
  };
};

function resolveLive(reduce: boolean) {
  const live = livePulseVariants.live;
  if (typeof live !== "function") throw new Error("live must be dynamic");
  return live({ delay: 2, duration: livePulse.duration, reduce }, {}, {});
}

describe("JourneyTrajectory live current marker", () => {
  it("rings only the current stage, once", () => {
    const { svg } = renderTrajectory();

    const pulses = svg.querySelectorAll("[data-journey-pulse]");
    expect(pulses).toHaveLength(1);
    expect(pulses[0]).toHaveAttribute("cx", "600");
    expect(pulses[0]).toHaveAttribute("r", "28");
  });

  it("leaves the center dot, inner ring, and other stages static", () => {
    const { svg } = renderTrajectory();

    const pulse = svg.querySelector("[data-journey-pulse]");
    const centerDot = svg.querySelector("circle.fill-accent");
    const innerRing = svg.querySelector('circle[cx="600"][r="17"]');
    expect(centerDot).not.toBeNull();
    expect(innerRing).not.toBeNull();
    expect(centerDot).not.toHaveAttribute("data-journey-pulse");
    expect(innerRing).not.toHaveAttribute("data-journey-pulse");
    expect(pulse?.contains(centerDot)).toBe(false);
    expect(
      svg.querySelectorAll('circle:not([cx="600"])[data-journey-pulse]'),
    ).toHaveLength(0);
  });

  it("breathes slowly and gently, repeating with an ease-in-out curve", () => {
    const target = resolveLive(false) as LiveTarget;

    expect(target.scale).toEqual([1, 1.08, 1]);
    expect(target.opacity).toEqual([0.7, 0.25, 0.7]);
    expect(target.transition.duration).toBeGreaterThanOrEqual(2.5);
    expect(target.transition.duration).toBeLessThanOrEqual(3);
    expect(target.transition.ease).toBe("easeInOut");
    expect(target.transition.repeat).toBe(Infinity);
    expect(target.transition.delay).toBe(2);
  });

  it("does not pulse under reduced motion", () => {
    expect(resolveLive(true)).toEqual({
      opacity: 0.7,
      scale: 1,
      transition: { duration: 0 },
    });
  });

  it("renders the ring visible at rest before any animation", () => {
    const { svg } = renderTrajectory();

    const pulse = svg.querySelector("[data-journey-pulse]");
    expect(pulse).toHaveStyle({ opacity: "0.7" });
    expect(pulse?.getAttribute("style") ?? "").not.toMatch(/scale/);
  });

  it("starts pulsing after the entrance arrives at the current stage", async () => {
    const { svg } = renderTrajectory();
    const pulse = svg.querySelector("[data-journey-pulse]");

    enterViewport();

    await waitFor(
      () => {
        expect(pulse?.getAttribute("style") ?? "").toMatch(/scale\(1\.0*[1-9]/);
      },
      { timeout: 5000 },
    );
  }, 8000);
});
