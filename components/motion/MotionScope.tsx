"use client";

import { domAnimation, LazyMotion, MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { duration, ease } from "@/lib/motion/tokens";

/**
 * The shared policy for every Motion for React animation. Each motion
 * primitive renders inside one, so there is no app-wide provider and pages
 * without motion load no Motion code.
 *
 * - `reducedMotion="user"`: with `prefers-reduced-motion: reduce`, transform
 *   and layout animations are skipped (values jump to their end state) while
 *   opacity still fades.
 * - `LazyMotion` with `domAnimation` loads only animation, variant, gesture,
 *   and in-view features; `strict` rejects the full `motion.*` components so
 *   they cannot pull the larger bundle back in. Use `m.*` inside.
 */
export function MotionScope({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig
        reducedMotion="user"
        transition={{ duration: duration.normal, ease: ease.standard }}
      >
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
