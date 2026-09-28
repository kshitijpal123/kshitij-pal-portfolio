# Project Structure and Conventions

Status: Milestone 1. This document defines where code and content live and
how files are named. Directories listed here are created when they first hold
a real file; an empty directory is not tracked by Git and is not a problem.

Sections distinguish between what **exists** and what is **intended**. Nothing
described as intended has been implemented.

## Top-level layout

```
app/                 Routes, layouts, global styles (App Router)
components/          React components, grouped by responsibility
content/             Local MDX sources
lib/                 Non-UI modules
public/              Static assets served from the site root
tests/               Vitest + React Testing Library tests
docs/architecture/   Architecture documentation
docs/adr/            Architecture decision records
mdx-components.tsx   Global MDX component mapping (required by @next/mdx)
```

Project code lives outside `app/`. `app/` contains only routing files
(`layout.tsx`, `page.tsx`, and other Next.js file conventions) plus
`globals.css`.

## Routes

Exists: `/` (`app/page.tsx`), the Home page. It currently renders the hero,
the Experience section, the Currently Working On section, and the Let's
Connect call to action, in that order.

Intended route map (not implemented; routes are added when their content
exists):

| Route                 | Purpose                                      |
| --------------------- | -------------------------------------------- |
| `/`                   | Home                                         |
| `/work`               | Project index                                |
| `/work/[slug]`        | Project case study (first: `/work/billsync`) |
| `/engineering`        | Engineering writing index                    |
| `/engineering/[slug]` | Engineering article                          |
| `/experience`         | Professional experience                      |
| `/about`              | About                                        |
| `/contact`            | Contact                                      |

Route philosophy:

- Route directories are lowercase; dynamic segments use `[slug]`.
- A route's `[slug]` matches its content directory name, so
  `/work/billsync` is backed by `content/projects/billsync/index.mdx`.
- Content routes are statically generated from the files in `content/`.
  Unknown slugs return 404 rather than rendering on demand.
- No placeholder routes. A route is created together with the content or
  feature it serves.

## Server-first rendering

**Server Components are the default.** A file gets `"use client"` only when it
genuinely needs something that cannot run on the server:

- browser APIs (`window`, `localStorage`, `IntersectionObserver`, …)
- interactive state (`useState`, `useReducer`) or effects
- event handlers (`onClick`, `onChange`, …)
- animation that requires client-side behavior
- theme interaction
- other genuinely client-only requirements

When interactivity is needed, keep the client boundary as small as possible:
extract the interactive part into its own Client Component and keep the
surrounding page or section as a Server Component. Content loading, metadata,
and SEO helpers always run on the server.

## Components

Components are grouped by responsibility. Directories are created when their
first component is written.

| Directory                 | Responsibility                   |
| ------------------------- | -------------------------------- |
| `components/ui/`          | Reusable low-level UI primitives |
| `components/layout/`      | Shared layout structures         |
| `components/navigation/`  | Header and navigation components |
| `components/motion/`      | Motion primitives                |
| `components/hero/`        | Hero-specific components         |
| `components/experience/`  | Experience-specific components   |
| `components/work/`        | Project / case-study components  |
| `components/engineering/` | Engineering article components   |
| `components/contact/`     | Contact-specific components      |

`components/ui/` exists and holds the core primitives: `Button`, `Link`,
`Container`, `Section`, `Surface`, `Badge`, and `Divider`. They style
standard HTML elements with the tokens from
[`design-tokens.md`](design-tokens.md), accept the element's normal props plus
a few named variants, and append a `className` for layout additions (it does
not override their styles). They carry no content. `buttonClassName()` gives
a link button styling without making it a button. Class names are joined with
`cx()` from `lib/utils/cx.ts`.

`components/layout/` holds `SiteHeader` and `SiteFooter`, and
`components/navigation/` holds `DesktopNav`, `MobileNav`, `NavLink`,
`ThemeSwitcher`, `ResumeLink`, and `SkipLink`. They are composed once in
`app/layout.tsx`; see "Global shell" in [`overview.md`](overview.md).

`components/hero/` holds `HomeHero`, the Home page hero, and
`TechnicalHeroVisual`, the abstract system diagram in its right column.
`HomeHero` stays a Server Component and uses no motion primitives: it is
above the fold and its copy must render fully without JavaScript. Only
`TechnicalHeroVisual` is a Client Component; it is decorative and animates
itself (see "Home hero visual" in [`motion.md`](motion.md)).

`components/experience/` holds `ExperienceSection`, the Home page
professional timeline. It renders the typed entries in `lib/site/experience.ts`
(most recent first) and reveals them with the motion primitives, since it sits
below the fold. Entries are structured data, not MDX. A role's `period` is set
only from verified dates and is not rendered while unset.

`components/work/` holds `CurrentWorkSection`, the Home page "Currently
Working On" section. It renders the typed items in `lib/site/currentWork.ts`;
an item links to its case study only when `href` is set. From `lg` it shares
the Experience section's three-column grid (heading in the first column,
content in the other two), so both sections align on one editorial axis and
the project reads as current work rather than a feature block. Its first link,
`/work/billsync`, points at the intended case-study route and returns 404
until that route exists, like the other intended routes already linked from
the site.

`components/contact/` holds `ConnectSection`, the Home page call to action
that points to `/contact`. It is not the Contact page. Its LinkedIn link
comes from `siteConfig.social` and renders only while that URL is set.

Both sections sit below the fold and reveal with the motion primitives.

`components/motion/` holds `Reveal`, `Stagger`, `StaggerItem`, and the
internal `MotionScope`. They are thin Client Components that accept Server
Component children; see [`motion.md`](motion.md).

Rules:

- One focused component per file. No catch-all component files.
- Beyond the core primitives, a component starts in the domain directory that
  uses it. It moves to `ui/` only once a second, unrelated domain needs it.
- Do not create components, props, or variants before a page needs them.
- No barrel (`index.ts`) re-export files; import components from their file.

## Library modules

`lib/` holds non-UI code. Directories are created when their first module is
written.

| Directory        | Responsibility                                                    |
| ---------------- | ----------------------------------------------------------------- |
| `lib/content/`   | MDX/content loading and content utilities                         |
| `lib/seo/`       | SEO metadata and structured-data helpers                          |
| `lib/analytics/` | Analytics integration helpers                                     |
| `lib/site/`      | Site configuration and structured data (experience, current work) |
| `lib/theme/`     | Theme preference storage and initialization                       |
| `lib/motion/`    | Motion tokens and shared Motion for React variants                |
| `lib/utils/`     | Small reusable utilities that don't belong elsewhere              |

`lib/utils/` is a last resort. Code that belongs to a domain (content, SEO,
analytics) lives in that domain's directory.

## Content

Content is local MDX, compiled by `@next/mdx` (see
[ADR 0001](../adr/0001-local-mdx-content.md)). No content exists yet.

Intended layout:

```
content/
  engineering/
    <article-slug>/
      index.mdx
      <optional assets>
  projects/
    <project-slug>/
      index.mdx
      <optional assets>
```

- Each piece of content is a kebab-case directory; the directory name is the
  slug.
- The entry file is always `index.mdx`. Assets used only by that piece sit
  beside it.
- Content must support, as requirements emerge: title, description, date,
  slug, tags, reading time, and SEO metadata. The slug comes from the
  directory name; the rest is expected to be declared in the MDX file.
- `@next/mdx` does not parse frontmatter by default. The expected approach is
  an `export const metadata = { … }` statement inside each MDX file, which
  requires no extra dependency. The exact metadata shape is decided when the
  first content type is implemented.
- Content types (for example `EngineeringArticle`, `ProjectCaseStudy`) will
  live in `lib/content/` next to the loader that uses them. They are not
  defined yet because no content requirements exist to define them against.

## Static assets

| Directory        | Purpose                  |
| ---------------- | ------------------------ |
| `public/images/` | Site-wide images         |
| `public/resume/` | Downloadable résumé      |
| `public/icons/`  | Favicons and icon assets |

Images that belong to a single article or case study live with that content
in `content/`, not in `public/`.

No résumé exists yet. To publish it, add the PDF to `public/resume/` and set
`resumeHref` in `lib/site/config.ts`; the header, mobile menu, and footer
links appear only once it is set.

No portrait exists yet. To show one in the Home hero, add the photo to
`public/images/` and set `portrait` (path, alt text, and intrinsic size) in
`lib/site/config.ts`.

## Tests

| Directory           | Tests for                   | Status             |
| ------------------- | --------------------------- | ------------------ |
| `tests/app/`        | Routes in `app/`            | Exists (root page) |
| `tests/components/` | Components in `components/` | Exists             |
| `tests/lib/`        | Modules in `lib/`           | Exists             |
| `tests/helpers/`    | Test-only utilities         | Exists             |

Test directories mirror the source tree: a test for
`components/work/ProjectCard.tsx` lives at
`tests/components/work/ProjectCard.test.tsx`. Test files use the
`*.test.ts` / `*.test.tsx` suffix. Shared setup lives in `tests/setup.ts`.
`tests/helpers/` holds stand-ins for browser APIs that jsdom lacks, such as
`intersectionObserver.ts`, imported by the tests that need them.

## Imports

- Use the `@/*` alias (mapped to the project root in `tsconfig.json`) for
  imports across directories:

  ```ts
  import { ProjectCard } from "@/components/work/ProjectCard";
  ```

- Relative imports are acceptable only for siblings in the same directory
  (`./Something`). Never climb directories with `../`.
- There is one alias. Do not add others.

## Naming

| Kind                   | Convention                     | Example                                 |
| ---------------------- | ------------------------------ | --------------------------------------- |
| Route directories      | lowercase                      | `app/engineering/[slug]/`               |
| Content directories    | kebab-case (the slug)          | `content/projects/billsync/`            |
| React component files  | PascalCase                     | `components/work/ProjectCard.tsx`       |
| Utility / module files | camelCase                      | `lib/content/loadArticle.ts`            |
| Test files             | source name + `.test`          | `tests/lib/content/loadArticle.test.ts` |
| Configuration files    | lowercase, as the tool expects | `next.config.ts`, `eslint.config.mjs`   |
| Next.js special files  | as required by Next.js         | `page.tsx`, `layout.tsx`                |
