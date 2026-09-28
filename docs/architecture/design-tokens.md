# Design Tokens

Status: Milestone 2.1. Tokens are defined in `app/globals.css`; no components
consume them yet. Nothing here is a component or page design.

## Principle

"Show the engineering, don't advertise it." The visual system is editorial,
flat, and calm: restrained color, clear hierarchy, subtle borders instead of
floating cards. It supports the content rather than competing with it.

## Where tokens live

All tokens are in `app/globals.css`, in three layers:

1. **Runtime theme tokens** on `:root` (`--background`, `--accent`, …). These
   are the only values that change between light and dark.
2. **`@theme inline`** maps runtime tokens to Tailwind utilities
   (`bg-surface`, `text-muted-foreground`, `border-border-strong`).
3. **`@theme`** holds static scales: fonts, type, spacing, widths, radius.

Tailwind's default color, font-size, radius, and shadow scales are cleared,
so only approved tokens generate utilities. Arbitrary values (`bg-[#…]`) are
not used.

## Color

Semantic roles, never raw hues:

| Token               | Role                                                   |
| ------------------- | ------------------------------------------------------ |
| `background`        | Page background                                        |
| `foreground`        | Primary text                                           |
| `muted-foreground`  | Secondary text and metadata                            |
| `surface`           | Container/card background                              |
| `surface-muted`     | Subtle section background                              |
| `muted`             | Small muted fills (inline code, tags, hover rows)      |
| `border`            | Default dividers and container borders                 |
| `border-strong`     | Boundaries that must be perceivable (e.g. form inputs) |
| `accent`            | Links and primary actions (deep blue)                  |
| `accent-hover`      | Hover/active state of `accent`                         |
| `accent-foreground` | Text on an `accent` background                         |
| `ring`              | Focus indicator                                        |

Contrast targets used when choosing values: text and accent at least 4.5:1
on every background and surface; `border-strong` and `ring` at least 3:1.
`border` is decorative. Meaning is never conveyed by color alone. This is a
design constraint, not a compliance claim; accessibility is validated in a
later milestone.

## Theme

Each color is declared once with `light-dark()`, so `color-scheme` is the
single switch:

- Default: `color-scheme: light dark` follows the system preference.
- Forced: `data-theme="light"` or `data-theme="dark"` on `<html>` sets
  `color-scheme` and every token follows.

A future theme switcher only needs to set that attribute. The `dark:` variant
is redefined to match the same rules, but theme differences belong in tokens;
components should not need `dark:`.

## Typography

Three families, by role (system stacks; no web fonts loaded yet):

- **Sans** (`font-sans`): default for UI and body text.
- **Serif** (`font-serif`): editorial emphasis, used sparingly for selected
  large headings.
- **Mono** (`font-mono`): technical identity: metadata, labels, code,
  engineering terms. Never the site-wide face.

Type scale (`text-*`): `display`, `h1`, `h2`, `h3` scale fluidly between
mobile and desktop with `clamp()`; `body-lg`, `body`, `body-sm`, `caption`,
and `meta` are fixed. Each size carries its own line height and tracking.
`meta` is intended for mono labels.

## Spacing, radius, shadow

- **Spacing**: Tailwind's 0.25rem numeric scale for fine layout, plus a few
  semantic steps: `inline`, `component`, `card`, `gutter` (page horizontal
  padding), `section`, `editorial`. The larger steps are fluid.
- **Radius**: `control` (6px), `container` (8px), `surface` (12px, only
  when justified). No pill shapes by default.
- **Shadow**: `shadow-subtle` and `shadow-elevated` only, plus
  `shadow-none`. Borders separate content first; shadows are the exception.

## Layout and responsive

- Widths: `max-w-narrow` (40rem, reading), `max-w-content` (72rem),
  `max-w-wide` (84rem, diagrams and case studies), padded with `px-gutter`.
- Breakpoints are Tailwind's defaults, mobile-first: base is mobile, `md`
  tablet, `lg` desktop, `xl` large desktop. No custom breakpoints.
