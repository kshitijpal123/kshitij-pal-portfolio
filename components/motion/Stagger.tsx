"use client";

import * as m from "motion/react-m";
import type { ReactNode } from "react";
import { MotionScope } from "@/components/motion/MotionScope";
import { revealViewport, staggerVariants } from "@/lib/motion/variants";

const elements = { div: m.div, ul: m.ul, ol: m.ol };

type StaggerProps = {
  /** Use `ul` or `ol` with `StaggerItem as="li"` to keep list semantics. */
  as?: keyof typeof elements;
  className?: string;
  children: ReactNode;
};

/**
 * Reveals its `StaggerItem` children one after another, about 50ms apart,
 * when the group first enters the viewport. The group itself does not move.
 */
export function Stagger({ as = "div", className, children }: StaggerProps) {
  const Element = elements[as];

  return (
    <MotionScope>
      <Element
        className={className}
        variants={staggerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={revealViewport}
      >
        {children}
      </Element>
    </MotionScope>
  );
}
