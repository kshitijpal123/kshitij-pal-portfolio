# Design Tokens

Status: Milestone 2.3 (core UI primitives). Tokens are defined in
`app/globals.css` and consumed by the primitives in `components/ui/`. Nothing
here is a component or page design.

## Principle

"Show the engineering, don't advertise it." The visual system is editorial,
flat, and calm: restrained color, clear hierarchy, subtle borders instead of
floating cards. It supports the content rather than competing with it.

## Where tokens live

All tokens are in `app/globals.css`, in three layers:

1. **Runtime theme tokens** on `:root` (`--background`, `--accent`, …). These
   are the only values that change between light and dark.
2. **`@theme inline`** maps runtime tokens to Tailwind utilities
   (`bg-surface`, `text-muted-foreground`, `border-border-strong`), including
   the font families, which reference variables set by `next/font`.
3. **`@theme`** holds static scales: font weights, type, spacing, widths,
   radius.

Tailwind's default color, font-size, font-weight, radius, and shadow scales
are cleared, so only approved tokens generate utilities. Arbitrary values (`bg-[#…]`) are
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

Three families, by role. Hierarchy comes from size, weight, line height, and
contrast first; the family changes only when the role changes.

| Utility      | Font           | Role                                                                                                       | Weights                  |
| ------------ | -------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------ |
| `font-sans`  | IBM Plex Sans  | Default: body, UI, and most headings                                                                       | 400–700 (variable)       |
| `font-serif` | Source Serif 4 | Editorial emphasis, used sparingly for selected large headings or a short phrase. Never the dominant face. | 400, 600 used (variable) |
| `font-mono`  | IBM Plex Mono  | Technical signature: metadata, labels, code, engineering terms, status indicators. Never for paragraphs.   | 400, 500 (static)        |

Weight utilities are limited to `font-normal` (400), `font-medium` (500),
`font-semibold` (600), and `font-bold` (700), so light weights cannot be used.
Mono has no 600/700 face; avoid heavier weights on mono text. No italic
styles are loaded; `em` falls back to a synthesized oblique.

### Loading

Fonts load through `next/font/google` in `app/layout.tsx`, which downloads
them at build time and self-hosts them. There are no runtime requests to
Google and no font JavaScript. Each font exposes a CSS variable on `<html>`
(`--font-plex-sans`, `--font-source-serif`, `--font-plex-mono`), which the
`font-*` tokens reference.

- Latin subset only. Other subsets are emitted but download only if the
  page uses those characters (`unicode-range`).
- `display: swap`. Only the sans face is preloaded (one ~40 KB file); serif
  and mono download on first use, so pages that don't use them don't pay for
  them.
- Sans and serif are variable fonts: one file serves every weight. The serif
  loads without its optical-size axis (51 KB instead of 122 KB for Latin).
- Fallback: `next/font` generates a metric-adjusted local fallback (Arial,
  or Times New Roman for the serif) to limit layout shift on swap, followed by
  the system stacks. If a web font fails, text stays readable in a system
  face; mono then falls back to adjusted Arial, which is not monospaced.
- `next build` needs network access to Google Fonts. Once built, the site
  has no dependency on Google.

### Scale and elements

Type scale (`text-*`): `display`, `h1`, `h2`, `h3` scale fluidly between
mobile and desktop with `clamp()`; `body-lg`, `body`, `body-sm`, `caption`,
and `meta` are fixed. Each size carries its own line height and tracking:
large headings are tight (1.1–1.25) with slight negative tracking, and body
text is generous (1.55–1.65). `meta` is for mono labels; uppercase is
applied per use, not by default.

Element defaults in the base layer: `h1`–`h3` use their matching size,
`h4`–`h6` stay at body size, and all headings are semibold and
balance-wrapped. Paragraphs use `text-wrap: pretty`. Long words wrap instead
of overflowing. Margins stay zero; spacing between blocks is owned by layouts.
`display` and serif usage are opted into per component.

### Reading width

`max-w-measure` (30em) caps running text at about 65–70 characters, measured
with IBM Plex Sans (and about 64 with Source Serif 4). It is in `em`, so it
stays in that range for `body`, `body-lg`, or `body-sm` text. `max-w-narrow`
holds about 90 characters of body text, so it is a layout column, not a
prose width.

## Spacing, radius, shadow

- **Spacing**: Tailwind's 0.25rem numeric scale for fine layout, plus a few
  semantic steps: `inline`, `component`, `card`, `gutter` (page horizontal
  padding), `section`, `editorial`. The larger steps are fluid.
- **Radius**: `control` (6px), `container` (8px), `surface` (12px, only
  when justified). No pill shapes by default.
- **Shadow**: `shadow-subtle` and `shadow-elevated` only, plus
  `shadow-none`. Borders separate content first; shadows are the exception.

## Layout and responsive

- Widths: `max-w-measure` (30em, running text), `max-w-narrow` (40rem,
  focused column), `max-w-content` (72rem),
  `max-w-wide` (84rem, diagrams and case studies), padded with `px-gutter`.
- Breakpoints are Tailwind's defaults, mobile-first: base is mobile, `md`
  tablet, `lg` desktop, `xl` large desktop. No custom breakpoints.
