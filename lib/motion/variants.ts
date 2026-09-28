import type { Transition, Variants, ViewportOptions } from "motion/react";
import { reveal, stagger } from "@/lib/motion/tokens";

const revealTransition: Transition = {
  duration: reveal.duration,
  ease: reveal.ease,
};

/** Hidden and visible states shared by `Reveal` and `StaggerItem`. */
export const revealVariants: Variants = {
  hidden: { opacity: 0, y: reveal.offsetY },
  visible: { opacity: 1, y: 0, transition: revealTransition },
};

/** Orchestrates `StaggerItem` children; the container itself does not move. */
export const staggerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      delayChildren: (index: number) =>
        Math.min(index, stagger.maxSteps) * stagger.interval,
    },
  },
};

/**
 * Starts as soon as any part is on screen, then stays revealed. A margin that
 * shrinks the viewport is avoided: content at the very end of a page might
 * never cross it and would stay hidden.
 */
export const revealViewport: ViewportOptions = {
  once: true,
  amount: "some",
};
