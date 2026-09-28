# Motion

Status: Milestone 2.5 (motion language). This document defines how things
move and the primitives that implement it. The Home page Experience section
is the first to use them: a `Reveal` for its heading and a `Stagger` over its
entries. Responsibility bullets are not staggered individually.

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

Conventions for the diagrams built in later milestones (the Home page
technical visual is the first). Nothing here is implemented yet.

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

## Performance

- Animate `transform` and `opacity` only. Never layout properties, and
  never `box-shadow` or `filter`.
- Motion code loads only on pages that render a primitive, and only the
  `domAnimation` feature set.
- Viewport-triggered, once. Nothing animates while off screen, and no
  continuous animation exists today.
- Transforms do not affect layout, so reveals cause no layout shift.
