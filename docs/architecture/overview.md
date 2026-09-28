# Architecture Overview

Status: Experience, About, and résumé integration complete (Milestone 6). This document describes
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
| App Router    | Routing, layouts, metadata. Server Components by default.  | All routes except `/contact`   |
| Content       | Engineering writing, case studies, and About prose as MDX. | Projects, articles, About      |
| UI components | Reusable presentational components, grouped by domain.     | Primitives, global site shell  |
| Styling       | Tailwind CSS with design tokens in CSS custom properties.  | Design tokens defined          |
| Motion        | Motion tokens, CSS micro-interactions, Motion for React.   | Motion language and primitives |
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
app/                 layout.tsx (global shell), page.tsx (Home), globals.css,
                     work/page.tsx (Work index), work/[slug]/page.tsx (case study),
                     engineering/page.tsx (index), engineering/[slug]/page.tsx (article),
                     experience/page.tsx, about/page.tsx
components/ui/       Core UI primitives (Button, Link, Container, ...)
components/hero/     HomeHero, TechnicalHeroVisual
components/experience/  ExperienceSection, ExperienceRole, ExperienceNav
components/about/    AboutHeader, AboutSection, AboutNav
components/work/     CurrentWorkSection, Work index and case-study components,
                     diagram components
components/engineering/  ArticleList, ArticleEntry, ArticleHeader, ArticleNav
components/contact/  ConnectSection
content/projects/    <slug>/project.ts (metadata) and index.mdx (case study)
content/engineering/ <slug>/article.ts (metadata) and index.mdx (article body)
content/about/       index.mdx (About page body)
lib/content/         projects.ts, engineering.ts (types and registries)
components/layout/   SiteHeader, SiteFooter
components/navigation/  Navigation, mobile menu, theme switcher, skip link
components/motion/   Reveal, Stagger, StaggerItem, MotionScope
lib/site/            config.ts (identity, nav, links), experience.ts,
                     currentWork.ts, isActivePath.ts
lib/theme/           preference.ts (theme storage and init script)
lib/motion/          tokens.ts, variants.ts (Motion for React values)
lib/utils/           cx.ts (class-name joining)
mdx-components.tsx   Global MDX component mapping
tests/               setup.ts, helpers/, app/, components/, lib/
docs/                architecture/, adr/
```

Everything else (other `components/` and `lib/` directories, `public/`) is
defined by convention and created when it first holds a real file. Project code lives outside `app/`; `app/` contains routing files
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

`/`, `/work`, `/work/[slug]`, `/engineering`, `/engineering/[slug]`,
`/experience`, and `/about` exist; `/work/billsync` is the first case
study. The remaining intended route is `/contact`. Routes are
created together with the content or feature they serve, never as
placeholders. Content routes are statically generated, with the `[slug]`
matching the content directory name; unknown slugs return 404.

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

Everything in the shell is a Server Component except three small Client
Components in `components/navigation/`: `NavLink` (reads the pathname for the
active item), `MobileNav` (menu open state), and `ThemeSwitcher` (theme
preference).
Identity, navigation items, social links, the résumé path, and the portrait
live in `lib/site/config.ts`; components never hard-code them. A social link,
the résumé links, or the portrait (Home hero and About) renders only when it
is set. No résumé PDF exists yet, so `resumeHref` is `null` and no résumé
link is rendered anywhere; see "Static assets" in
[`project-structure.md`](project-structure.md).

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
`content/engineering/` or `content/projects/`; the directory name is the slug.
A project directory holds `project.ts`, its typed metadata, and `index.mdx`,
its case-study body. Metadata lives in TypeScript rather than as an MDX export
so the compiler checks it; `lib/content/projects.ts` registers the projects
and every Work page reads from it. Adding a project needs no change to the
Work pages. Engineering articles follow the same split (`article.ts` beside
`index.mdx`, registered in `lib/content/engineering.ts`), plus a
`published`/`draft` status: drafts are validated but never listed, routed,
or prerendered. The About page body is a single MDX file,
`content/about/index.mdx`; it has no metadata module or registry. The
Experience page has no content file of its own: it renders the same
`lib/site/experience.ts` entries as the Home page. Details: "Content" in
[`project-structure.md`](project-structure.md).

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

## Motion

Motion for React (`motion`) is the only animation library. Micro-interactions
are CSS transitions on the existing primitives. Scroll reveals use the Client
Components in `components/motion/`, which wrap Server Component children and
are imported only by pages that use them; there is no app-wide motion
provider and no page transitions. Reduced motion is handled centrally in
`globals.css` and in `MotionScope`. See [`motion.md`](motion.md).

## Decisions

Significant decisions are recorded as ADRs in [`docs/adr/`](../adr/).
