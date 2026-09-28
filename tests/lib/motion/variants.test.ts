import { describe, expect, it } from "vitest";
import { reveal, stagger } from "@/lib/motion/tokens";
import {
  revealVariants,
  revealViewport,
  staggerVariants,
} from "@/lib/motion/variants";

describe("revealVariants", () => {
  it("moves only a few pixels and ends at rest, fully opaque", () => {
    expect(revealVariants.hidden).toEqual({ opacity: 0, y: reveal.offsetY });
    expect(reveal.offsetY).toBeLessThanOrEqual(12);
    expect(revealVariants.visible).toMatchObject({ opacity: 1, y: 0 });
  });
});

describe("staggerVariants", () => {
  const visible = staggerVariants.visible;
  const delayChildren =
    typeof visible === "object" &&
    typeof visible.transition?.delayChildren === "function"
      ? visible.transition.delayChildren
      : undefined;

  it("delays each child by the stagger interval", () => {
    expect(delayChildren?.(0, 10)).toBe(0);
    expect(delayChildren?.(3, 10)).toBeCloseTo(3 * stagger.interval);
  });

  it("caps the delay so long lists settle quickly", () => {
    const cap = stagger.maxSteps * stagger.interval;

    expect(delayChildren?.(stagger.maxSteps, 50)).toBeCloseTo(cap);
    expect(delayChildren?.(49, 50)).toBeCloseTo(cap);
    expect(cap).toBeLessThanOrEqual(0.5);
  });

  it("keeps the interval within 30–70ms", () => {
    expect(stagger.interval).toBeGreaterThanOrEqual(0.03);
    expect(stagger.interval).toBeLessThanOrEqual(0.07);
  });
});

describe("revealViewport", () => {
  it("reveals once, as soon as any part is visible", () => {
    expect(revealViewport).toEqual({ once: true, amount: "some" });
  });
});
