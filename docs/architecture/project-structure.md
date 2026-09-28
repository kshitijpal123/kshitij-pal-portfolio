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

Exists:

- `/` (`app/page.tsx`), the Home page. It renders the hero, the Experience
  section, the Currently Working On section, and the Let's Connect call to
  action, in that order.
- `/work` (`app/work/page.tsx`), the project index. It lists every project in
  `lib/content/projects.ts` and has no per-project code.
- `/work/[slug]` (`app/work/[slug]/page.tsx`), a project case study. It is
  statically generated for each registered project (`generateStaticParams`)
  with `dynamicParams = false`, so unknown slugs return 404. The first and
  currently only case study is `/work/billsync`.
- `/engineering` (`app/engineering/page.tsx`), the Engineering index. It
  lists the published articles in `lib/content/engineering.ts`, newest first,
  or an empty state when there are none. It has no per-article code.
- `/engineering/[slug]` (`app/engineering/[slug]/page.tsx`), an article.
  Only published articles are prerendered (`generateStaticParams`), and
  `dynamicParams = false` makes every other slug, drafts included, return 404. The page also calls `notFound()` when the registry has no published
  article for the slug.

Intended route map (routes not listed above are added when their content
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
the project reads as current work rather than a feature block. Its link to
`/work/billsync` opens the BillSync case study.

`components/work/` also holds the Work index and case-study components. All
are Server Components; the only client code is the motion primitives they
wrap.

| Component             | Role                                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------- |
| `ProjectEntry`        | One Work index entry: type, title, tagline, status, summary, technical areas, links       |
| `ProjectHeader`       | Case-study hero from project metadata: eyebrow, h1, lede, status, focus, problem/solution |
| `ProjectSection`      | One case-study section on the Home three-column grid; h2 in the first column              |
| `CaseStudyNav`        | Closing navigation shared by every case study (Back to Work, Let's connect)               |
| `FlowDiagram`         | A captioned `<ol>` drawn as a vertical rail; steps take a description and a detail        |
| `FlowComparison`      | Flows side by side from `md`, each with a note                                            |
| `StageComparison`     | Stages separated by "≠", side by side from `md`                                           |
| `ArchitectureDiagram` | An `<ol>` of layers; parallel nodes form a labelled group, side by side from `sm`         |
| `DataModelOverview`   | Tables grouped by responsibility; each group is an h3 over a term list                    |
| `TenancyDiagram`      | A platform containing tenants and their roles, as nested boxes over nested lists          |
| `DecisionList`        | Numbered decisions, each an h3 with its rationale                                         |
| `StatusSummary`       | Project state in groups, such as established, current direction, planned next             |

The diagram components take their content as props, so a case study supplies
its own steps, nodes, and tables from MDX. Every diagram is HTML lists with
text; drawn parts (arrows, rails, step numbers, "≠") are `aria-hidden`, so
the diagrams read the same to assistive technology and without CSS. On narrow
screens they become vertical flows rather than shrinking.

`components/engineering/` holds the Engineering components. All are Server
Components; the only client code is the `Reveal` in `ArticleNav`.

| Component       | Role                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------- |
| `ArticleList`   | The index list (`<ol>`, newest first), or the empty state when nothing is published      |
| `ArticleEntry`  | One index entry: date column, then h2 title, description, reading time, "Read article"   |
| `ArticleHeader` | Article header: eyebrow (and series, if set), h1, description, dates, reading time       |
| `ArticleNav`    | Closing `nav` "Articles": previous (older) and next (newer) article, Back to Engineering |

Dates render as `<time dateTime="YYYY-MM-DD">` with text from
`formatArticleDate` ("September 28, 2026"), which is built by hand rather than
with `Intl`, so output never depends on locale or time zone.

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

Content is local MDX, compiled by `@next/mdx` at build time (see
[ADR 0001](../adr/0001-local-mdx-content.md)). No Markdown parser ships to
the browser.

### Projects

Each project is a directory under `content/projects/` holding two files:

```
content/projects/<slug>/
  project.ts   Typed metadata (ProjectDefinition); imports ./index.mdx
  index.mdx    The case-study body
```

**Metadata and content are split on purpose.** `project.ts` is TypeScript, so
`tsc` checks every field against `ProjectDefinition` in
`lib/content/projects.ts`; exports from an MDX file are not type-checked.
Metadata is what other pages need without rendering the case study: the Work
index entry, the case-study header, and the route's title and description.
`index.mdx` holds only the long-form body: `ProjectSection` blocks of prose
and diagrams, with the diagram data written inline as props. No field is
declared in both places.

`ProjectDefinition` fields: `slug` (kebab-case, equal to the directory
name), `title`, `tagline`, `summary`, `lede`, `status`, `type`,
`technologies` (Work index), `focus` (case-study header), `problem`,
`solution`, `metaTitle`, `featured`, optional `links` (real public
destinations only), and `CaseStudy` (the MDX component). `href` is derived as
`/work/<slug>` by the registry.

`lib/content/projects.ts` is the registry: it lists the definitions, derives
`href`, orders featured projects first (registry order otherwise), and
exposes `projects` and `getProject(slug)`. The Work index, the case-study
route, `generateStaticParams`, and the metadata all read from it.

To add a project:

1. Create `content/projects/<slug>/index.mdx` with the case study.
2. Create `content/projects/<slug>/project.ts` exporting a
   `ProjectDefinition` that imports `./index.mdx`.
3. Add it to `definitions` in `lib/content/projects.ts`.

The Work index, the route, static generation, and metadata pick it up with
no other change. Only real projects are added; there are no placeholders.

The Home page "Currently Working On" item (`lib/site/currentWork.ts`) is a
separate editorial list and still states BillSync's status and description
itself; keep it in step when those change.

### Engineering articles

The Engineering section is a general technical publication: anything
technical worth writing down, not tied to one technology. It has no tags,
categories, or search; articles are ordered by date only.

```
content/engineering/<slug>/
  article.ts   Typed metadata (ArticleDefinition); imports ./index.mdx
  index.mdx    The article body
```

As with projects, metadata is TypeScript so `tsc` checks it, and the MDX
holds only the body. The title, description, and dates are never repeated
in the MDX.

`ArticleDefinition` fields (`lib/content/engineering.ts`):

| Field         | Notes                                                                        |
| ------------- | ---------------------------------------------------------------------------- |
| `slug`        | Kebab-case, equal to the directory name                                      |
| `title`       | The h1 and the start of the document title (`<title> · Kshitij Pal`)         |
| `description` | One or two sentences: index entry, header, and page description              |
| `publishedAt` | `YYYY-MM-DD`, set by hand; filesystem dates are never used                   |
| `updatedAt`   | Optional `YYYY-MM-DD`, only for a meaningful revision; not before publishing |
| `readingTime` | Whole minutes, estimated once from the word count (about 200 words a minute) |
| `status`      | `"published"` or `"draft"`                                                   |
| `series`      | Optional series name, shown in the header eyebrow                            |
| `Content`     | The MDX component                                                            |

`href` is derived as `/engineering/<slug>` by the registry.

**Status.** Only `published` articles appear anywhere. A `draft` can be
committed and registered: it is validated like any article, but the
registry drops it before anything reads the list, so it is not on the
index, not prerendered, not found by `getArticle`, and its URL returns 404.
Nothing public shows the word "draft".

**Registry.** `createArticleRegistry(definitions)` validates every
definition and throws, failing the build and tests, on a duplicate or
non-kebab-case slug, an empty title or description, an invalid date, an
`updatedAt` before `publishedAt`, or a reading time that is not a positive
whole number. It returns:

- `articles`: published articles, newest first (same-day articles by slug).
- `getArticle(slug)`: a published article or `undefined`.
- `getAdjacentArticles(slug)`: `previous` (the next older) and `next` (the
  next newer) published article, each only when it exists.

The module applies it to its `definitions` list and exports the result. The
index, the article route, `generateStaticParams`, and metadata all read from
it; tests build their own registries from fixtures.

To add an article:

1. Create `content/engineering/<slug>/`.
2. Add `article.ts` exporting an `ArticleDefinition` that imports
   `./index.mdx`. Start with `status: "draft"` if it is not ready.
3. Write `index.mdx`, starting at `##` headings (the page owns the h1).
4. Add it to `definitions` in `lib/content/engineering.ts`.
5. Run `npm run format:check`, `npm run lint`, `npm run typecheck`,
   `npm run test`, and `npm run build`.
6. Commit. Set `status: "published"` in a commit when it should go live.
7. Deploy.

Only genuine writing is added; no placeholder articles. When an article
describes a project, it states what is implemented, what is designed, and
what is planned separately, and makes no claim the project's own case study
does not support.

### MDX conventions

`mdx-components.tsx` styles Markdown elements for all MDX; it adds no outer
margins, and the rendering layout spaces blocks (`space-y-6` in articles and
case-study sections).

| Markdown    | Rendering                                                                                                                                                      |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `##`, `###` | h2 (serif) and h3, with extra space above; `#` is not used in content                                                                                          |
| Paragraphs  | `body-lg`, capped at `max-w-measure` (about 65–70 characters)                                                                                                  |
| Lists       | Disc and decimal lists at the same measure                                                                                                                     |
| Links       | The `Link` primitive (`inline` variant)                                                                                                                        |
| `> quote`   | A left rule in `border-strong`, muted text                                                                                                                     |
| Inline code | Mono on a `muted` chip                                                                                                                                         |
| Fenced code | `pre` on `surface-muted` with a border, scrolls horizontally inside itself, focusable (`tabIndex={0}`) so keyboard users can scroll it; no syntax highlighting |

Articles render in a `max-w-narrow` column, so code blocks may be wider than
paragraphs. Markdown tables are not supported: `@next/mdx` compiles
CommonMark without the GFM plugin, and no article needs one yet. Adding
`remark-gfm` is the path if one does. Custom MDX components are added only
when an article needs them; case-study layout components are imported inside
each MDX file.

Vitest compiles MDX with `@mdx-js/mdx` through a small plugin in
`vitest.config.mts`, using the same `mdx-components.tsx`, so tests render
real article and case-study content.

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

| Directory           | Tests for                   | Status                          |
| ------------------- | --------------------------- | ------------------------------- |
| `tests/app/`        | Routes in `app/`            | Exists (`/`, Work, Engineering) |
| `tests/components/` | Components in `components/` | Exists                          |
| `tests/lib/`        | Modules in `lib/`           | Exists                          |
| `tests/helpers/`    | Test-only utilities         | Exists                          |

Test directories mirror the source tree: a test for
`components/work/ProjectCard.tsx` lives at
`tests/components/work/ProjectCard.test.tsx`. Test files use the
`*.test.ts` / `*.test.tsx` suffix. Shared setup lives in `tests/setup.ts`.
`tests/helpers/` holds stand-ins for browser APIs that jsdom lacks, such as
`intersectionObserver.ts`, and test fixtures such as `articles.ts`, imported
by the tests that need them. `tests/mdx-components.test.tsx` covers the root
`mdx-components.tsx`.

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
