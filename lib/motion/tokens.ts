/**
 * Motion tokens for Motion for React, in seconds and cubic-bezier points.
 * They mirror `--duration-*` and `--ease-*` in app/globals.css; see
 * docs/architecture/motion.md.
 */
export const duration = {
  instant: 0.1,
  fast: 0.15,
  normal: 0.3,
  slow: 0.45,
} as const;

export const ease = {
  standard: [0.2, 0, 0, 1],
  emphasized: [0.16, 1, 0.3, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>;

/** Level 2 content reveal: a short rise and fade, once. */
export const reveal = {
  offsetY: 8,
  duration: duration.slow,
  ease: ease.emphasized,
} as const;

/**
 * Delay between staggered children. Only the first `maxSteps` children are
 * delayed, so a long list never takes longer than about 0.4s to settle.
 */
export const stagger = {
  interval: 0.05,
  maxSteps: 8,
} as const;
