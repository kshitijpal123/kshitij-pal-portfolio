# Architecture Overview

Status: foundation complete (Milestone 1). This document describes
the intended shape of the system and what exists today. It is updated as parts
are implemented.

## System shape

```
Next.js
  → App Router
    → Local MDX content
      → Reusable UI components
        → AWS production deployment
```

The portfolio is a single Next.js application. There is no separate backend,
API server, database, CMS, or authentication layer; none of these are required
for the problem being solved.

## Layers

| Layer         | Responsibility                                             | Status                         |
| ------------- | ---------------------------------------------------------- | ------------------------------ |
| App Router    | Routing, layouts, metadata. Server Components by default.  | Root layout and route in place |
| Content       | Engineering writing and project case studies as local MDX. | MDX compilation configured     |
| UI components | Reusable presentational components, grouped by domain.     | Primitives, global site shell  |
| Styling       | Tailwind CSS with design tokens in CSS custom properties.  | Design tokens defined          |
| Deployment    | Production hosting on AWS.                                 | Not started                    |

Planned integrations, none implemented yet: error monitoring (Sentry),
analytics (Google Analytics), and contact form delivery (Resend). Full SEO,
accessibility, and performance work are later milestones. Environment
variables are introduced only when a feature requires them; none exist today.

## Principles

- **Server Components by default.** Client Components are introduced only where
  browser-side interactivity requires them.
- **Content is code.** Content is version-controlled alongside the application
  and reviewed through the same workflow.
- **No speculative infrastructure.** Components, content loaders, and
  integrations are added when a feature needs them, not in advance.

## Application structure

What exists today:

```
app/                 layout.tsx (global shell), page.tsx (placeholder), globals.css
components/ui/       Core UI primitives (Button, Link, Container, ...)
components/layout/   SiteHeader, SiteFooter
components/navigation/  Navigation, mobile menu, theme switcher, skip link
lib/site/            config.ts (identity, nav, links), isActivePath.ts
lib/theme/           preference.ts (theme storage and init script)
lib/utils/           cx.ts (class-name joining)
mdx-components.tsx   Global MDX component mapping
tests/               setup.ts, app/, components/, lib/
docs/                architecture/, adr/
```

Everything else (other `components/` and `lib/` directories, `content/`,
`public/`) is defined by convention and created when it first holds a real
file. Project code lives outside `app/`; `app/` contains routing files
only.

| Path                 | Purpose                                                         |
| -------------------- | --------------------------------------------------------------- |
| `app/`               | Routes, layouts, global styles                                  |
| `components/`        | React components, grouped by domain (`ui`, `layout`, `work`, …) |
| `content/`           | MDX sources (`engineering/`, `projects/`)                       |
| `lib/`               | Non-UI modules (`content`, `seo`, `analytics`, `utils`)         |
| `public/`            | Static assets (`images`, `resume`, `icons`)                     |
| `tests/`             | Vitest + React Testing Library tests, mirroring the source tree |
| `docs/architecture/` | Architecture documentation                                      |
| `docs/adr/`          | Architecture decision records                                   |

Full conventions: [`project-structure.md`](project-structure.md).

## Route philosophy

Only `/` exists. The intended routes are `/`, `/work`, `/work/[slug]`,
`/engineering`, `/engineering/[slug]`, `/experience`, `/about`, and
`/contact`; the first case study will be `/work/billsync`. Routes are created
together with the content or feature they serve, never as placeholders.
Content routes are expected to be statically generated, with the `[slug]`
matching the content directory name.

## Component organization

Components are grouped by responsibility: `ui/` for low-level primitives,
`layout/` for shared layout, `navigation/` for the header, and one directory
per page domain (`hero/`, `experience/`, `work/`, `engineering/`,
`contact/`). One focused component per file. A component starts in the
domain that needs it and is promoted to `ui/` only when a second domain needs
it.

## Global shell

`app/layout.tsx` renders every page as
`SkipLink → SiteHeader → <main id="main-content"> → SiteFooter`. `<body>` is a
flex column with `min-h-dvh` and `<main>` grows, so the footer sits at the
bottom of short pages. The shell adds no width or vertical spacing to
`<main>`: each page chooses its own `Container` size and `Section` rhythm.
The header is in normal document flow (not sticky).

Everything is a Server Component except three small Client Components in
`components/navigation/`: `NavLink` (reads the pathname for the active item),
`MobileNav` (menu open state), and `ThemeSwitcher` (theme preference).
Identity, navigation items, social links, and the résumé path live in
`lib/site/config.ts`; components never hard-code them. A social link or the
résumé link renders only when its URL is set.

### Theme

The preference (`light`, `dark`, or unset for system) is stored in
`localStorage` under `theme`. An inline script in `<head>`
(`themeInitScript` in `lib/theme/preference.ts`) sets `data-theme` on `<html>`
before first paint, so a stored preference never flashes the wrong theme;
with no preference, the CSS follows the OS through `color-scheme` and no
script work is needed. `<html>` has `suppressHydrationWarning` because the
script changes its attributes before hydration. Reading a cookie on the
server was rejected because it would make every page dynamic. The switcher
subscribes to the same store with `useSyncExternalStore`, which keeps its
instances and other tabs in sync.

## Content organization

Each article or case study is a kebab-case directory under
`content/engineering/` or `content/projects/` containing `index.mdx` and any
assets it uses. The directory name is the slug. Metadata (title, description,
date, and later tags, reading time, SEO fields) is expected to be exported from
the MDX file itself; the exact shape and the content types are defined when
the first content type is implemented. No content exists yet.

## Server-first approach

Server Components are the default. `"use client"` is added only for browser
APIs, interactive state, event handlers, client-side animation, theme
interaction, or other genuinely client-only needs, and the client boundary is
kept as small as possible.

## Import conventions

Cross-directory imports use the `@/*` alias (project root), for example
`import { ProjectCard } from "@/components/work/ProjectCard"`. Relative
imports are limited to same-directory siblings. No other aliases.

## Naming conventions

Lowercase route directories, kebab-case content directories and slugs,
PascalCase component files, camelCase utility files, and lowercase
configuration files where the tool expects it.

## Styling

Tailwind CSS v4 with semantic design tokens in `app/globals.css`, supporting
light and dark themes. See [`design-tokens.md`](design-tokens.md).

## Decisions

Significant decisions are recorded as ADRs in [`docs/adr/`](../adr/).
