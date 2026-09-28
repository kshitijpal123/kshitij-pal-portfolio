"use client";

import * as m from "motion/react-m";
import type { ReactNode } from "react";
import { MotionScope } from "@/components/motion/MotionScope";
import { revealVariants, revealViewport } from "@/lib/motion/variants";

type RevealProps = {
  className?: string;
  children: ReactNode;
};

/**
 * Fades its children in with a short rise the first time any part of it
 * enters the viewport. Children can be Server Components. Do not wrap content
 * that is visible on first paint: it stays transparent until hydration.
 */
export function Reveal({ className, children }: RevealProps) {
  return (
    <MotionScope>
      <m.div
        data-motion-reveal=""
        className={className}
        variants={revealVariants}
        initial="hidden"
        whileInView="visible"
        viewport={revealViewport}
      >
        {children}
      </m.div>
    </MotionScope>
  );
}
