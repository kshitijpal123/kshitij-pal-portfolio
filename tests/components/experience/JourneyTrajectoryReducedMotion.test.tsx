import { render, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { JourneyTrajectory } from "@/components/experience/JourneyTrajectory";
import {
  enterViewport,
  installIntersectionObserver,
} from "@/tests/helpers/intersectionObserver";

// Motion reads the preference once per module graph, so it is set up front.
beforeAll(() => {
  installIntersectionObserver();
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(prefers-reduced-motion)",
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("JourneyTrajectory with prefers-reduced-motion", () => {
  it("shows the complete static trajectory at once, without movement", async () => {
    const { container } = render(<JourneyTrajectory />);
    const parts = container.querySelectorAll("[data-motion-reveal]");

    enterViewport();

    // Well inside the full entrance timeline (about 1.8s): nothing is delayed.
    await waitFor(
      () => {
        for (const part of parts) {
          expect(part).toHaveStyle({ opacity: "1" });
          expect(part.getAttribute("style") ?? "").not.toMatch(
            /translate[XY]?\(-?[1-9]|scale\(0/,
          );
        }
      },
      { timeout: 300 },
    );
  });

  it("keeps the current marker's rings static and visible", async () => {
    const { container } = render(<JourneyTrajectory />);
    const pulse = container.querySelector("[data-journey-pulse]");
    expect(pulse).not.toBeNull();

    enterViewport();

    // Past the point the pulse would begin (about 2.1s) with motion allowed.
    await new Promise((resolve) => setTimeout(resolve, 2600));
    expect(pulse).toHaveStyle({ opacity: "0.7" });
    expect(pulse?.getAttribute("style") ?? "").not.toMatch(/scale\((?!1\))/);
    expect(container.querySelector('circle[r="17"]')).toBeInTheDocument();
    const beacon = container.querySelector("[data-journey-beacon]");
    expect(beacon?.getAttribute("style") ?? "").not.toMatch(/scale\((?!1\))/);
    expect(beacon?.querySelector("circle.fill-accent")).toBeInTheDocument();
  }, 5000);
});
