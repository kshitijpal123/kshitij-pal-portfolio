"use client";

import { useInView, useReducedMotionConfig } from "motion/react";
import * as m from "motion/react-m";
import { useRef, useState, type ReactNode } from "react";
import { MotionScope } from "@/components/motion/MotionScope";
import { technical } from "@/lib/motion/tokens";
import {
  diagramEdgeVariants,
  diagramNodeVariants,
  revealViewport,
} from "@/lib/motion/variants";

type Point = readonly [x: number, y: number];

/*
 * Flows run along orthogonal paths through node centers. The token is painted
 * beneath the nodes, so it is only visible on the connections between them
 * and rests hidden inside a node between cycles.
 */
const requestFlow: readonly Point[] = [
  [49, 28],
  [231, 28],
  [231, 122],
  [49, 122],
  [49, 221],
];
const asyncFlow: readonly Point[] = [
  [49, 137],
  [140, 137],
  [140, 222],
  [231, 222],
];

function pathLength(points: readonly Point[]) {
  return points
    .slice(1)
    .reduce(
      (total, [x, y], index) =>
        total + Math.abs(x - points[index][0]) + Math.abs(y - points[index][1]),
      0,
    );
}

const speed =
  pathLength(requestFlow) / ((requestFlow.length - 1) * technical.hop);
const asyncStart = pathLength(requestFlow.slice(0, 4)) / speed;
const cycle = Math.max(
  pathLength(requestFlow) / speed,
  asyncStart + pathLength(asyncFlow) / speed,
);

/** Keyframes for one token over a shared cycle, starting at `start` seconds. */
function flowKeyframes(points: readonly Point[], start: number) {
  const x = [points[0][0]];
  const y = [points[0][1]];
  const times = [0];
  let elapsed = start;

  if (start > 0) {
    x.push(points[0][0]);
    y.push(points[0][1]);
    times.push(start / cycle);
  }
  points.slice(1).forEach((point, index) => {
    elapsed += pathLength([points[index], point]) / speed;
    x.push(point[0]);
    y.push(point[1]);
    times.push(Math.min(elapsed / cycle, 1));
  });
  if (elapsed < cycle) {
    x.push(x[x.length - 1]);
    y.push(y[y.length - 1]);
    times.push(1);
  }
  return { x, y, times };
}

const flows = [
  flowKeyframes(requestFlow, 0),
  flowKeyframes(asyncFlow, asyncStart),
];

type Direction = "right" | "down" | "left";

function arrowhead([x, y]: Point, direction: Direction) {
  switch (direction) {
    case "right":
      return `M${x - 5} ${y - 3.5}L${x} ${y}L${x - 5} ${y + 3.5}Z`;
    case "left":
      return `M${x + 5} ${y - 3.5}L${x} ${y}L${x + 5} ${y + 3.5}Z`;
    case "down":
      return `M${x - 3.5} ${y - 5}L${x} ${y}L${x + 3.5} ${y - 5}Z`;
  }
}

type EdgeProps = {
  step: number;
  d: string;
  tip: Point;
  direction: Direction;
  children?: ReactNode;
};

function Edge({ step, d, tip, direction, children }: EdgeProps) {
  return (
    <m.g data-motion-reveal="" custom={step} variants={diagramEdgeVariants}>
      <path d={d} fill="none" className="stroke-border-strong" />
      <path d={arrowhead(tip, direction)} className="fill-border-strong" />
      {children}
    </m.g>
  );
}

function Metadata({
  x,
  y,
  anchor = "middle",
  children,
}: {
  x: number;
  y: number;
  anchor?: "middle" | "start";
  children: string;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      fontSize={9.5}
      letterSpacing="0.08em"
      className="fill-muted-foreground"
    >
      {children}
    </text>
  );
}

function Label({ x, y, children }: { x: number; y: number; children: string }) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={11}
      letterSpacing="0.08em"
      className="fill-foreground stroke-none font-medium"
    >
      {children}
    </text>
  );
}

function Node({ step, children }: { step: number; children: ReactNode }) {
  return (
    <m.g data-motion-reveal="" custom={step} variants={diagramNodeVariants}>
      {children}
    </m.g>
  );
}

function Diagram() {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref);
  const reduceMotion = useReducedMotionConfig();
  const [entered, setEntered] = useState(false);
  const flowing = entered && inView && !reduceMotion;

  return (
    <m.svg
      ref={ref}
      viewBox="0 0 280 248"
      focusable="false"
      className="block h-auto w-full font-mono"
      initial="hidden"
      whileInView="visible"
      viewport={revealViewport}
      onAnimationComplete={(definition) => {
        if (definition === "visible") setEntered(true);
      }}
    >
      <Edge step={1} d="M97 28H183" tip={[183, 28]} direction="right">
        <Metadata x={140} y={21}>
          HTTP
        </Metadata>
      </Edge>
      <Edge step={3} d="M231 47V101" tip={[231, 101]} direction="down" />
      <Edge step={5} d="M183 122H97" tip={[97, 122]} direction="left">
        <Metadata x={140} y={115}>
          ASYNC
        </Metadata>
      </Edge>
      <Edge step={7} d="M49 147V197" tip={[49, 197]} direction="down">
        <Metadata x={56} y={175} anchor="start">
          DATA
        </Metadata>
      </Edge>
      <Edge
        step={7}
        d="M97 137H140V222H183"
        tip={[183, 222]}
        direction="right"
      />

      {flowing &&
        flows.map((flow, index) => (
          <m.circle
            key={index}
            r={3}
            className="fill-accent"
            initial={{ x: flow.x[0], y: flow.y[0] }}
            animate={{ x: flow.x, y: flow.y }}
            transition={{
              duration: cycle,
              times: flow.times,
              ease: "linear",
              repeat: Infinity,
              repeatDelay: technical.restBetweenFlows,
            }}
          />
        ))}

      <g strokeWidth={1.25} className="fill-background stroke-border-strong">
        <Node step={0}>
          <rect
            x={1}
            y={9}
            width={96}
            height={38}
            rx={19}
            strokeDasharray="3 3"
          />
          <Label x={49} y={28}>
            REQUEST
          </Label>
        </Node>

        <Node step={2}>
          <rect
            x={183}
            y={9}
            width={96}
            height={38}
            rx={6}
            strokeWidth={1.5}
            className="stroke-accent"
          />
          <circle
            cx={197}
            cy={28}
            r={2.5}
            className="fill-accent stroke-none"
          />
          <Label x={234} y={28}>
            API
          </Label>
        </Node>

        <Node step={4}>
          <rect x={183} y={101} width={96} height={42} rx={6} />
          <Label x={231} y={122}>
            PROCESS
          </Label>
        </Node>

        <Node step={6}>
          <rect x={1} y={97} width={96} height={50} rx={6} />
          <Label x={49} y={111}>
            QUEUE
          </Label>
          <g strokeWidth={1}>
            {[16, 34, 52, 70].map((x, index) => (
              <rect
                key={x}
                x={x}
                y={123}
                width={12}
                height={12}
                rx={2}
                className={index < 3 ? "fill-muted" : undefined}
              />
            ))}
          </g>
        </Node>

        <Node step={8}>
          <path d="M9 203V239A40 6 0 0 0 89 239V203" />
          <ellipse cx={49} cy={203} rx={40} ry={6} />
          <Label x={49} y={227}>
            DATABASE
          </Label>
        </Node>

        <Node step={8}>
          <rect
            x={183}
            y={203}
            width={96}
            height={38}
            rx={6}
            className="stroke-border"
          />
          <Label x={231} y={222}>
            SERVICE
          </Label>
        </Node>
      </g>
    </m.svg>
  );
}

/**
 * An abstract backend flow for the Home hero: a request passes through an API
 * and processing into a queue, which feeds a database and a second service.
 * It illustrates system thinking, not any real architecture. Decorative: the
 * hero copy carries the meaning, so it is hidden from assistive technology.
 */
export function TechnicalHeroVisual({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={className}>
      <MotionScope>
        <Diagram />
      </MotionScope>
    </div>
  );
}
