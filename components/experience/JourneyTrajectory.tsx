"use client";

import {
  animate,
  useInView,
  useMotionValue,
  useReducedMotionConfig,
  type MotionValue,
  type Transition,
  type Variants,
} from "motion/react";
import * as m from "motion/react-m";
import { useEffect, useId, useRef, type RefObject } from "react";
import { MotionScope } from "@/components/motion/MotionScope";
import { duration, ease, technical } from "@/lib/motion/tokens";
import { revealViewport } from "@/lib/motion/variants";

/*
 * Geometry in viewBox units. The SVG scales uniformly with its width, so the
 * stage x positions (0, 300, 600, 900 of 1200) stay on the left edge of the
 * four equal columns rendered beneath it.
 */
const width = 1200;
const height = 200;
const stageX = [0, 300, 600] as const;
const markerX = 900;
const currentX = stageX[stageX.length - 1];

/** The trajectory is a gently accelerating ascent, y = f(x). */
function trajectoryY(x: number) {
  return 172 - 0.06 * x - 0.00007 * x * x;
}

function slope(x: number) {
  return -0.06 - 0.00014 * x;
}

/** A parabola between two x positions is exactly one quadratic Bézier. */
function segment(fromX: number, toX: number) {
  const controlX = (fromX + toX) / 2;
  const controlY = trajectoryY(fromX) + (slope(fromX) * (toX - fromX)) / 2;
  return `M${fromX} ${trajectoryY(fromX)}Q${controlX} ${controlY} ${toX} ${trajectoryY(toX)}`;
}

const pastPath = segment(stageX[0], currentX);
const continuationPath = segment(currentX, width);

/*
 * The indicator rests on the current stage and is offset back to the first
 * one while hidden, so without transforms (no script, reduced motion) it sits
 * at its final position. Keyframes are evenly spaced in x, matching the
 * linear sweep of the progress clip.
 */
const indicatorSamples = Array.from({ length: 13 }, (_, index) => {
  const x = stageX[0] + ((currentX - stageX[0]) * index) / 12;
  return { x: x - currentX, y: trajectoryY(x) - trajectoryY(currentX) };
});

/** Seconds on the entrance timeline. */
const drawDuration = duration.slow;
const progressStart = drawDuration;
const progressDuration = (stageX.length - 1) * technical.hop;
const arrival = progressStart + progressDuration;

type Timing = {
  delay: number;
  duration: number;
  /** Reduced motion: every part lands in its final state at once. */
  reduce: boolean;
  /** Clip sweeps start this far left. */
  from?: number;
};

const instant = { duration: 0 };

const fadeVariants: Variants = {
  hidden: { opacity: 0 },
  visible: ({ delay, duration, reduce }: Timing) => ({
    opacity: 1,
    transition: reduce ? instant : { delay, duration, ease: ease.standard },
  }),
};

const nodeVariants: Variants = {
  hidden: { opacity: 0, y: technical.offsetY },
  visible: ({ delay, duration, reduce }: Timing) => ({
    opacity: 1,
    y: 0,
    transition: reduce ? instant : { delay, duration, ease: ease.emphasized },
  }),
};

const emphasisVariants: Variants = {
  hidden: { opacity: 0, scale: 0.85 },
  visible: ({ delay, duration, reduce }: Timing) => ({
    opacity: 1,
    scale: 1,
    transition: reduce ? instant : { delay, duration, ease: ease.emphasized },
  }),
};

/** A clip rectangle that slides right, revealing what it clips left to right. */
const sweepVariants: Variants = {
  hidden: ({ from = 0 }: Timing) => ({ x: -from }),
  visible: ({ delay, duration, reduce }: Timing) => ({
    x: 0,
    transition: reduce ? instant : { delay, duration, ease: "linear" },
  }),
};

const indicatorVariants: Variants = {
  hidden: {
    opacity: 0,
    x: indicatorSamples[0].x,
    y: indicatorSamples[0].y,
  },
  visible: ({ delay, duration: travel, reduce }: Timing) => ({
    opacity: 1,
    x: indicatorSamples.map((sample) => sample.x),
    y: indicatorSamples.map((sample) => sample.y),
    transition: reduce
      ? instant
      : {
          delay,
          duration: travel,
          ease: "linear",
          opacity: { delay, duration: duration.fast },
        },
  }),
};

/**
 * The current stage's outer ring breathes once the indicator has arrived, to
 * show the trajectory is still active. It loops only while on screen and
 * rests at `rest` under reduced motion or without script.
 */
export const livePulse = {
  duration: 2.8,
  scale: [1, 1.08, 1],
  opacity: [0.7, 0.25, 0.7],
} as const;

export const livePulseVariants: Variants = {
  rest: { opacity: livePulse.opacity[0], scale: 1 },
  live: ({ delay, reduce }: Timing) =>
    reduce
      ? { opacity: livePulse.opacity[0], scale: 1, transition: instant }
      : {
          opacity: [...livePulse.opacity],
          scale: [...livePulse.scale],
          transition: {
            delay,
            duration: livePulse.duration,
            ease: "easeInOut",
            repeat: Infinity,
          },
        },
};

const livePulseViewport = { once: false, amount: "some" } as const;

/**
 * The current stage's marker (inner ring, accent ring, and dot) breathes
 * about its center, a little slower than the outer ring so the two drift in
 * and out of phase.
 */
export const beacon = {
  duration: 3,
  scale: [1, 1.1, 1],
  /** Seconds after first entering the viewport: once the rings settle. */
  delay: arrival + duration.normal,
} as const;

export function beaconTransition(delay: number): Transition {
  return {
    delay,
    duration: beacon.duration,
    ease: "easeInOut",
    repeat: Infinity,
  };
}

/**
 * Loops the beacon scale only while the trajectory is on screen and motion is
 * allowed. The motion value is not a variant, so the marker's parts keep
 * following the entrance variants of the svg.
 */
function useBeaconScale(
  ref: RefObject<SVGSVGElement | null>,
  reduce: boolean,
): MotionValue<number> {
  const scale = useMotionValue(1);
  const inView = useInView(ref, { amount: "some" });
  const firstSeen = useRef<number | null>(null);

  useEffect(() => {
    if (!inView || reduce) return;
    firstSeen.current ??= performance.now();
    const elapsed = (performance.now() - firstSeen.current) / 1000;
    const controls = animate(
      scale,
      [...beacon.scale],
      beaconTransition(Math.max(0, beacon.delay - elapsed)),
    );
    return () => {
      controls.stop();
      scale.set(1);
    };
  }, [inView, reduce, scale]);

  return scale;
}

function Stage({ x, timing }: { x: number; timing: Timing }) {
  const y = trajectoryY(x);

  return (
    <>
      <m.path
        data-motion-reveal=""
        custom={timing}
        variants={fadeVariants}
        d={`M${x} ${y + 10}V${height}`}
        strokeDasharray="2 4"
        className="stroke-border-strong"
      />
      <m.g data-motion-reveal="" custom={timing} variants={nodeVariants}>
        <circle
          cx={x}
          cy={y}
          r={7}
          strokeWidth={1.5}
          className="fill-background stroke-border-strong"
        />
        <circle cx={x} cy={y} r={2} className="fill-foreground" />
      </m.g>
    </>
  );
}

function Trajectory() {
  const reduce = useReducedMotionConfig() ?? false;
  const clipId = useId().replace(/[^\w-]/g, "");
  const at = (delay: number, length: number, from?: number): Timing => ({
    delay,
    duration: length,
    reduce,
    from,
  });
  const currentY = trajectoryY(currentX);
  const markerY = trajectoryY(markerX);
  const svgRef = useRef<SVGSVGElement>(null);
  const beaconScale = useBeaconScale(svgRef, reduce);

  return (
    <m.svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      focusable="false"
      className="block h-auto w-full overflow-visible"
      fill="none"
      initial="hidden"
      whileInView="visible"
      viewport={revealViewport}
    >
      <defs>
        <clipPath id={`${clipId}-past`}>
          <m.rect
            data-motion-reveal=""
            custom={at(0, drawDuration, currentX + 20)}
            variants={sweepVariants}
            x={-20}
            y={-40}
            width={currentX + 40}
            height={height + 80}
          />
        </clipPath>
        <clipPath id={`${clipId}-progress`}>
          <m.rect
            data-motion-reveal=""
            custom={at(progressStart, progressDuration, currentX)}
            variants={sweepVariants}
            x={-20}
            y={-40}
            width={currentX + 20}
            height={height + 80}
          />
        </clipPath>
        <clipPath id={`${clipId}-next`}>
          <m.rect
            data-motion-reveal=""
            custom={at(arrival, drawDuration, width - currentX + 20)}
            variants={sweepVariants}
            x={currentX}
            y={-40}
            width={width - currentX + 20}
            height={height + 80}
          />
        </clipPath>
      </defs>

      <m.g
        data-motion-reveal=""
        custom={at(0, duration.normal)}
        variants={fadeVariants}
        className="stroke-border"
      >
        <path d={`M0 ${height}H${width}`} />
        {[...stageX, markerX].map((x) => (
          <path
            key={x}
            d={`M${x} ${height - 5}V${height}`}
            className="stroke-border-strong"
          />
        ))}
      </m.g>

      <path
        d={pastPath}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        clipPath={`url(#${clipId}-past)`}
        className="stroke-border-strong"
      />
      <path
        d={pastPath}
        strokeWidth={2}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        clipPath={`url(#${clipId}-progress)`}
        className="stroke-accent"
      />
      <path
        d={continuationPath}
        strokeWidth={1.5}
        strokeDasharray="4 6"
        vectorEffect="non-scaling-stroke"
        clipPath={`url(#${clipId}-next)`}
        className="stroke-border-strong"
      />

      {stageX.slice(0, -1).map((x) => (
        <Stage
          key={x}
          x={x}
          timing={at((x / currentX) * drawDuration, duration.normal)}
        />
      ))}

      <m.path
        data-motion-reveal=""
        custom={at(drawDuration, duration.normal)}
        variants={fadeVariants}
        d={`M${currentX} ${currentY + 10}V${height}`}
        strokeDasharray="2 4"
        className="stroke-border-strong"
      />
      <m.g
        data-motion-reveal=""
        custom={at(arrival, duration.normal)}
        variants={emphasisVariants}
      >
        <m.circle
          data-journey-pulse=""
          custom={at(arrival + duration.normal, livePulse.duration)}
          variants={livePulseVariants}
          initial="rest"
          whileInView="live"
          viewport={livePulseViewport}
          cx={currentX}
          cy={currentY}
          r={28}
          strokeDasharray="2 4"
          className="stroke-border-strong"
        />
      </m.g>
      <m.g data-journey-beacon="" style={{ scale: beaconScale }}>
        <m.circle
          data-motion-reveal=""
          custom={at(arrival, duration.normal)}
          variants={emphasisVariants}
          cx={currentX}
          cy={currentY}
          r={17}
          className="stroke-border-strong"
        />
        <m.circle
          data-motion-reveal=""
          custom={at(drawDuration, duration.normal)}
          variants={nodeVariants}
          cx={currentX}
          cy={currentY}
          r={8}
          strokeWidth={1.5}
          className="fill-background stroke-accent"
        />
        <m.circle
          data-motion-reveal=""
          custom={at(progressStart, progressDuration)}
          variants={indicatorVariants}
          cx={currentX}
          cy={currentY}
          r={4}
          className="fill-accent"
        />
      </m.g>

      <m.g
        data-motion-reveal=""
        custom={at(arrival + drawDuration / 2, duration.normal)}
        variants={fadeVariants}
      >
        <path
          d={`M${markerX} ${markerY + 8}V${height}`}
          strokeDasharray="2 4"
          className="stroke-border"
        />
        <circle
          cx={markerX}
          cy={markerY}
          r={6}
          strokeDasharray="2 2"
          className="fill-background stroke-border-strong"
        />
      </m.g>
    </m.svg>
  );
}

/**
 * The Home journey's desktop trajectory: an ascending line through each
 * stage, with the current stage ringed and a dashed continuation into the
 * current trajectory. On entering the viewport, once, the line draws, the
 * stages appear in order, an indicator travels to the current stage, and the
 * continuation extends. Decorative: the milestone list beneath carries the
 * same information, so it is hidden from assistive technology.
 */
export function JourneyTrajectory({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={className}>
      <MotionScope>
        <Trajectory />
      </MotionScope>
    </div>
  );
}
