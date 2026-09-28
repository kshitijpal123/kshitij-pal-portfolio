import { render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { JourneyTrajectory } from "@/components/experience/JourneyTrajectory";
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
