import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { duration, ease } from "@/lib/motion/tokens";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

function cssToken(name: string) {
  const match = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`--${name} is not defined in globals.css`);
  return match[1].trim();
}

describe("motion tokens", () => {
  it.each(Object.entries(duration))(
    "keeps duration %s in sync with globals.css",
    (name, seconds) => {
      expect(cssToken(`duration-${name}`)).toBe(`${seconds * 1000}ms`);
    },
  );

  it.each(Object.entries(ease))(
    "keeps ease %s in sync with globals.css",
    (name, points) => {
      expect(cssToken(`ease-${name}`)).toBe(
        `cubic-bezier(${points.join(", ")})`,
      );
    },
  );

  it("keeps durations within the documented motion levels", () => {
    expect(duration.fast).toBeGreaterThanOrEqual(0.12);
    expect(duration.fast).toBeLessThanOrEqual(0.18);
    expect(duration.normal).toBeGreaterThanOrEqual(0.3);
    expect(duration.slow).toBeLessThanOrEqual(0.5);
  });
});
