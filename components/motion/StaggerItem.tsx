"use client";

import * as m from "motion/react-m";
import type { ReactNode } from "react";
import { revealVariants } from "@/lib/motion/variants";

const elements = { div: m.div, li: m.li };

type StaggerItemProps = {
  as?: keyof typeof elements;
  className?: string;
  children: ReactNode;
};

/** One entry of a `Stagger` group. It takes its timing from the group. */
export function StaggerItem({
  as = "div",
  className,
  children,
}: StaggerItemProps) {
  const Element = elements[as];

  return (
    <Element
      data-motion-reveal=""
      className={className}
      variants={revealVariants}
    >
      {children}
    </Element>
  );
}
