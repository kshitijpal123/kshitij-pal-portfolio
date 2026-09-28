# Motion

Status: Milestone 2.5 (motion language), extended in Milestone 6.5 (Home
engineering journey). This document defines how things move and the
primitives that implement it.

## Principle

"Show the engineering, don't advertise it." Motion supports the content and
never competes with it. It is restrained, precise, and short. It acknowledges
an interaction, eases content into view, or explains how a system behaves.
It is never decoration: no parallax, particles, animated gradients,
scroll-jacking, cinematic page transitions, bounce, or elastic springs.

Only interactive elements and meaningful state changes move. Static content
(badges, dividers, body text) does not animate.

## Hierarchy

| Level               | Used for                                                                    | Duration            | Movement                                      |
| ------------------- | --------------------------------------------------------------------------- | ------------------- | --------------------------------------------- |
| 1. Micro            | Buttons, links, navigation, controls, theme switcher, interactive surfaces  | 100–150 ms          | Color and opacity; at most 1–2px transform    |
| 2. Content reveal   | Sections, headings, cards, lists, project and article entries               | 300–450 ms          | Opacity 0 → 1 and an 8px rise                 |
| 3. Technical motion | Request flows, queues, database nodes, processing and architecture diagrams | 300–450 ms per step | Movement that represents real system behavior |

Level 1 is CSS transitions: no JavaScript. Levels 2 and 3 use Motion for
React through the primitives below.

## Tokens

Defined in `app/globals.css` and mirrored for Motion for React in
`lib/motion/tokens.ts` (seconds and cubic-bezier points).
`tests/lib/motion/tokens.test.ts` fails if the two drift apart.

| Token                | Value  | Use                                           |
| -------------------- | ------ | --------------------------------------------- |
| `--duration-instant` | 100 ms | Press feedback, very small state flips        |
| `--duration-fast`    | 150 ms | Default for every CSS transition (Level 1)    |
| `--duration-normal`  | 300 ms | Small content changes, technical motion steps |
| `--duration-slow`    | 450 ms | Content reveals (Level 2)                     |

| Token             | Curve                           | Use                                                            |
| ----------------- | ------------------------------- | -------------------------------------------------------------- |
| `ease-standard`   | `cubic-bezier(0.2, 0, 0, 1)`    | State changes: hover, focus, active, toggles. Default for CSS. |
| `ease-emphasized` | `cubic-bezier(0.16, 1, 0.3, 1)` | Entrances: fast start, long calm settle. Used by reveals.      |

Tailwind's default easings are cleared, so `ease-standard` and
`ease-emphasized` are the only `ease-*` utilities. `--default-transition-duration`
and `--default-transition-timing-function` point at `fast` and `standard`,
so any `transition-*` utility is on-token without a `duration-*` class.
Tailwind has no duration namespace; to deviate, reference the token:
`duration-(--duration-normal)`. Do not use numeric `duration-*` classes.

Springs are not the default. Use one only for a direct-manipulation
interaction where it is genuinely better, with no visible overshoot.

## Primitives

`components/motion/` holds three Client Components. Their children can be
Server Components, so a page stays server-rendered; only the thin wrapper
hydrates. They are imported where used; nothing is added to the root layout,
and pages that use none of them load no Motion code.

| Component     | Purpose                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------- |
| `Reveal`      | Wraps one block (a section body, a card) and reveals it once when it enters the viewport |
| `Stagger`     | A group (`div`, `ul`, or `ol`) that reveals its `StaggerItem` children in sequence       |
| `StaggerItem` | One entry in a `Stagger` (`div` or `li`); takes its timing from the group                |

```tsx
<Reveal>
  <SectionContent />
</Reveal>

<Stagger as="ul" className="grid gap-4">
  {projects.map((project) => (
    <StaggerItem key={project.slug} as="li">
      <ProjectCard project={project} />
    </StaggerItem>
  ))}
</Stagger>
```

Both accept `className` for layout. `Reveal` renders a `div`; use `Stagger`
for lists so `ul > li` semantics stay valid.

`MotionScope` is the internal wrapper that every primitive renders inside.
It holds the shared policy: reduced motion (below), the default transition,
and `LazyMotion` with the `domAnimation` feature set in `strict` mode, so only
the lightweight `m.*` components can be used. Future motion components (Level
3 diagrams) render inside a `MotionScope` too rather than configuring Motion
themselves. The shared variants and viewport options live in
`lib/motion/variants.ts`.

### Reveal behavior

- Starts at opacity 0 and 8px lower, ends at rest, over `slow` with
  `ease-emphasized`.
- Triggers once, as soon as any part of the element is on screen. The
  viewport is not shrunk with a negative margin: content at the very end of a
  short page could then never cross the line and would stay hidden.
- No scroll-linked motion; scrolling is never intercepted.

### Stagger behavior

- Items start 50 ms apart. Only the first eight are delayed, so a long list
  settles within about 0.85 s (0.4 s of delay plus one reveal) instead of
  cascading.
- The group element itself never moves or fades.
- Prefer one `Stagger` per group over a `Reveal` per item, so a page does not
  start dozens of independent animations.

### Where not to use them

Do not wrap content that is visible on first paint (the page heading, the
hero, anything that may be the Largest Contentful Paint). The primitives
server-render their starting state, so that content would stay transparent
until JavaScript hydrates. Page content appears immediately; reveals are for
content further down.

### Work pages

The Work index uses no motion: its entries are visible on first paint. In a
case study, the header is static, each `ProjectSection` heading is a
`Reveal`, and each diagram or grouped list (flow steps, architecture layers,
data-model groups, decisions, status groups) is one `Stagger`. Paragraphs are
not animated. The tenancy diagram is static.

### Engineering pages

The Engineering index uses no motion, for the same reason as the Work index:
its entries are on screen at first paint. An article's header and body are
static; paragraphs, headings, and code blocks never animate. The closing
`ArticleNav` is one `Reveal`, since it always sits below the fold.

### Experience and About pages

The Experience page header, role column, summary, progression, and
sections are static: the first role is on screen at first paint. Each role's
technology list is one `Reveal`, and the closing `ExperienceNav` is one
`Reveal`. The page does not reuse the Home trajectory or its motion.

The About header, including the portrait when set, is static because it is
above the fold. Each `AboutSection` heading is a `Reveal`, like a case-study
section; its paragraphs and lists are not animated. The closing `AboutNav`
is one `Reveal`.

### Contact page

The Contact page uses no motion. On desktop the introduction, form, and links
are all on screen at first paint, so a reveal would only delay them; on
mobile, only the links sit below the fold, and one isolated reveal is not
worth loading Motion. Validation messages, the sending state, and the result
messages appear instantly.

## Micro-interactions

Implemented in the existing primitives with CSS only:

| Element                       | Motion                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `Button`                      | Color, background, and border transition; a 1px press (`translate`) that eases |
| `Link`                        | Color and underline-color transition                                           |
| `NavLink`                     | Inherits `Link`; the active border color transitions in the mobile menu        |
| `ThemeSwitcher`               | The selected segment's background, border, and text color transition           |
| `Badge`, `Divider`, `Surface` | None                                                                           |

Rules for future interactive elements:

- Transition color, background, border, and opacity. Transforms stay at
  1–2px; no hover scaling.
- Do not animate `box-shadow`, filters, or layout properties (width,
  height, top, margin). A shadow may change instantly.
- An interactive `Surface` (a whole-card link) may lift by 1–2px with
  `translate` when one exists; no such variant is added until a page needs it.
- The mobile menu opens instantly. Navigation stays predictable and does
  not wait on an animation.

## Page transitions

None. Route changes render immediately with no enter or exit animation and
no `AnimatePresence` around routes. The App Router stays simple, focus and
scroll restoration behave as the browser expects, and a portfolio does not
need cinematic transitions. If a page wants a gentle entrance for content
below its heading, it uses `Reveal`; there is no global page wrapper.

## Reduced motion

`prefers-reduced-motion: reduce` is handled centrally in two places, so no
component writes its own media query:

- **CSS** (`app/globals.css`): all CSS transitions and animations become
  effectively instant, loops run once, and smooth scrolling is disabled.
  Interaction feedback still happens; it just does not animate.
- **Motion for React** (`MotionScope`): `reducedMotion="user"` skips every
  transform and layout animation, so values jump to their end state. Opacity
  still fades, so revealed content arrives gently without moving.

Future technical motion must additionally stop continuous or looping
animation under reduced motion (check `useReducedMotion()` inside a
`MotionScope`) and show a static, equally informative state. There is no
parallax to disable.

In development, Motion logs a one-time console warning when the device has
reduced motion enabled. It is informational and removed from production
builds.

## Accessibility

- Content exists without animation. The primitives never add `aria-hidden`,
  `hidden`, `inert`, or `tabindex`; content is in the accessibility tree and
  keyboard order from the first render, even before it is revealed.
- Focus never waits on animation. Focusing an unrevealed link scrolls it into
  view, which reveals it.
- If scripting is disabled, `@media (scripting: none)` in `globals.css`
  forces every `[data-motion-reveal]` element visible and at rest.
- No flashing, no rapid repetition, nothing moves more than a few pixels.
- Reduced-motion users receive the same content and the same states.

## Technical motion (Level 3)

Conventions for technical diagrams. The Home hero visual (below) is the
first implementation.

- **Semantic state drives the animation.** Model the system (`idle`,
  `receiving`, `processing`, `persisted`, `failed`) and animate between
  those states with variants; do not hand-animate coordinates.
- **Motion represents real behavior.** A request moves along the path it
  actually takes through nodes; a queue shows messages entering, waiting,
  and being consumed in order; a database node changes state when a write
  lands; a worker shows a deterministic pulse per job.
- **Deterministic and compact.** The same input always produces the same
  sequence. No random particles, no ambient drift. Paths are short and
  steps use `normal` or `slow`.
- **Loops only for ongoing processes.** An infinite animation must stand for
  something continuous (a consumer polling a queue). It pauses when off
  screen (`useInView`) and does not run under reduced motion.
- **Cheap to render.** SVG with a small number of animated elements,
  animating `transform` and `opacity` (or `pathLength`) only. No filters or
  blur, no animated shadows, no per-frame layout reads.
- **The diagram is readable when static.** Labels and structure carry the
  meaning; motion only adds the sense of flow. The reduced-motion state is a
  complete, labelled diagram.

Shared pieces: `technical` in `lib/motion/tokens.ts` (4px node offset, 80 ms
between flow steps, one `slow` step per hop, 5 s rest between flows) and
`diagramNodeVariants` / `diagramEdgeVariants` in `lib/motion/variants.ts`,
which take the part's flow step as `custom`.

### Home hero visual

`components/hero/TechnicalHeroVisual.tsx` is a small SVG diagram in the
hero's right column: REQUEST → API → PROCESS → QUEUE, with the queue feeding
a DATABASE and a secondary SERVICE (connection labels HTTP, ASYNC, DATA). It
supports the heading by showing how the engineer thinks about systems.

- **Abstract on purpose.** It is a generic request/queue/storage flow, not
  the architecture of any real employer, client, or project, so it carries no
  product names, infrastructure, technology logos, addresses, or metrics.
- **Rendering.** Inline SVG with a `viewBox`, colored only with semantic
  token utilities (`stroke-border-strong`, `stroke-accent`, `fill-background`,
  `fill-foreground`, `fill-muted-foreground`), so it follows Light, Dark, and
  System with no overrides. It is capped at `max-w-88` and keeps its aspect
  ratio, so its size is fixed before any animation starts.
- **Entrance.** Inside a `MotionScope`, parts appear once in flow order when
  the diagram enters the viewport: nodes fade and rise 4px, connections only
  fade. Every animated part carries `data-motion-reveal` for the no-script
  fallback. The hero itself is not wrapped in `Reveal`; only the visual
  animates.
- **Flow.** After the entrance, one accent token follows the request path and
  a second follows the queue → service branch, one hop per `slow` step, then
  both rest for 5 s. Tokens are painted beneath the nodes, so they are only
  visible on connections and rest hidden inside a node. The loop renders only
  while the diagram is on screen (`useInView`).
- **Reduced motion.** `useReducedMotionConfig()` (the `MotionScope` policy)
  removes the flow tokens entirely; the central `reducedMotion="user"`
  already skips the 4px rise, so parts only fade in and the static diagram is
  complete.
- **Accessibility.** The wrapper is `aria-hidden="true"` and the SVG is
  `focusable="false"`: the hero heading and copy carry the meaning, and the
  visual adds no tab stops, roles, or interaction.
- If `siteConfig.portrait` is set, the portrait takes the right column
  instead of the visual.

### Home engineering journey

`ExperienceSection` reveals its heading with a `Reveal`, its milestones with
one `Stagger`, and the current trajectory with a `Reveal`, like any Home
section. From `lg`, `components/experience/JourneyTrajectory.tsx` adds the
Level 3 entrance: an ascending line through the stages, the current stage
ringed, and a dashed continuation into the current trajectory (see "Home
journey" in [`project-structure.md`](project-structure.md) for layout and
why it is abstract rather than literal space imagery).

- **Once, on entering the viewport.** No loop and no scroll-linked motion:
  1. The line to the current stage is revealed left to right (`slow`,
     linear), and the past stages rise 4px into place as it reaches them.
  2. An accent indicator travels from the first stage to the current one,
     one `hop` per stage, with an accent line drawn behind it.
  3. On arrival, the current stage's rings settle in (opacity and a 0.85 →
     1 scale), and the dashed continuation extends to the current
     trajectory marker.

  About 1.8 s in all. Text never waits: the milestone list reveals with the
  standard stagger, independently of the drawing.

- **Why viewport-triggered rather than scroll-driven.** Tying progress to
  scroll position would leave the line half drawn wherever the reader
  stops, and depend on how far the page can scroll; it would also be the
  first scroll-linked motion in a system that has none. Normal scrolling is
  never intercepted and nothing is sticky.
- **Rendering.** Inline SVG (`viewBox` 1200 × 200, scaled uniformly), token
  classes only (`stroke-border`, `stroke-border-strong`, `stroke-accent`,
  `fill-background`, `fill-foreground`, `fill-accent`). Line reveals are
  `clipPath` rectangles sliding by `transform`, not `pathLength`, so the
  animated values are transforms and opacity only. The indicator rests on
  the current stage and is offset back while hidden; its keyframes are
  spaced evenly in x, matching the linear sweep of its line.
- **No script.** Every animated part carries `data-motion-reveal`, so the
  `scripting: none` rule shows the finished drawing: sweeps and the
  indicator sit at their final position when transforms are removed.
- **Reduced motion.** `useReducedMotionConfig()` makes every transition
  instant: no drawing, no moving indicator, no rise or scale. The complete,
  static trajectory appears as soon as it is on screen. The preference only
  changes transitions, never the first render, so server and client markup
  match.
- **Accessibility.** The wrapper is `aria-hidden="true"` and the SVG is
  `focusable="false"`, with no text: the milestone list states everything
  the drawing shows, including which role is current ("Present").

## Performance

- Animate `transform` and `opacity` only. Never layout properties, and
  never `box-shadow` or `filter`.
- Motion code loads only on pages that render a primitive, and only the
  `domAnimation` feature set.
- Viewport-triggered, once. Nothing animates while off screen. The journey
  trajectory runs once. The only continuous animation is the hero visual's
  flow: two SVG circles moving by
  `transform`, resting 5 s per cycle, stopped off screen and under reduced
  motion.
- Transforms do not affect layout, so reveals cause no layout shift.
