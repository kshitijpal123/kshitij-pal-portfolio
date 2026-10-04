# Architecture Overview

Status: live at https://kshitijpal.in after production hardening
(Milestone 11), the AWS deployment (Milestone 9), SEO, accessibility, and
performance hardening (Milestone 8), the contact page and form delivery
(Milestone 7), and the evolved Experience journey (Milestone 6.5). This
document
describes the intended shape of the system and what exists today. It is
updated as parts are implemented.

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
for the problem being solved. The one server-side endpoint is the contact
form's Route Handler, `POST /api/contact`, which relays messages through
Resend (see "Contact form" below).

## Layers

| Layer         | Responsibility                                             | Status                         |
| ------------- | ---------------------------------------------------------- | ------------------------------ |
| App Router    | Routing, layouts, metadata. Server Components by default.  | All routes                     |
| Content       | Engineering writing, case studies, and About prose as MDX. | Projects, articles, About      |
| UI components | Reusable presentational components, grouped by domain.     | Primitives, global site shell  |
| Styling       | Tailwind CSS with design tokens in CSS custom properties.  | Design tokens defined          |
| Motion        | Motion tokens, CSS micro-interactions, Motion for React.   | Motion language and primitives |
| Deployment    | CloudFront, Lambda (Next.js standalone), S3; see below.    | Live at `kshitijpal.in`        |

Contact form delivery (Resend) is implemented. Planned integrations, not
implemented yet: error monitoring (Sentry) and analytics (Google Analytics).
Metadata, canonical URLs, the sitemap, robots, structured data, and the
accessibility and performance conventions are described in
[`seo-accessibility-performance.md`](seo-accessibility-performance.md).
Environment variables are introduced only when a feature requires them: the
three contact form settings and `SITE_URL`, the canonical origin, all in
`.env.example`.

Production runs on AWS at `https://kshitijpal.in`: CloudFront in front of
the Next.js standalone server on Lambda (through the AWS Lambda Web Adapter)
and an S3 bucket for `/_next/static`, defined in CloudFormation under
`infra/` and deployed by GitHub Actions on every push to `main`.
Architecture, setup, caching, the custom domain,
secrets, and operations: [`deployment.md`](deployment.md); the choice is
recorded in [ADR 0002](../adr/0002-aws-lambda-cloudfront-hosting.md).

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
                     experience/page.tsx, about/page.tsx, contact/page.tsx,
                     not-found.tsx, sitemap.ts, robots.ts,
                     api/contact/route.ts (contact form endpoint)
components/ui/       Core UI primitives (Button, Link, Container, ...)
components/hero/     HomeHero, TechnicalHeroVisual
components/experience/  ExperienceSection (Home journey), JourneyTrajectory,
                     JourneyMilestone, JourneyMarker, ExperienceRole,
                     ExperiencePeriod, ExperienceNav
components/about/    AboutHeader, AboutSection, AboutNav
components/work/     CurrentWorkSection, Work index and case-study components,
                     diagram components
components/engineering/  ArticleList, ArticleEntry, ArticleHeader, ArticleNav
components/contact/  ConnectSection, ContactForm, ContactField, ContactDetails,
                     ContactLinks
components/seo/      JsonLd (structured-data script)
content/projects/    <slug>/project.ts (metadata) and index.mdx (case study)
content/engineering/ <slug>/article.ts (metadata) and index.mdx (article body)
content/about/       index.mdx (About page body)
lib/content/         projects.ts, engineering.ts (types and registries)
lib/contact/         validation.ts (shared), email.ts, rateLimit.ts,
                     sendContactEmail.ts (server only)
lib/seo/             siteUrl.ts, metadata.ts, structuredData.ts, sitemap.ts,
                     robots.ts
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
infra/               portfolio.yaml, bootstrap.yaml (CloudFormation),
                     package-server.mts, lambda/run.sh
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
`/experience`, `/about`, and `/contact` exist; `/work/billsync` is the first
case study. `/api/contact` is the only Route Handler; `/sitemap.xml` and
`/robots.txt` are prerendered metadata routes. Routes are
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
Identity, navigation items, social links, direct contact (email and phone),
the résumé path, and the portrait live in `lib/site/config.ts`; components
never hard-code them. The footer and the Contact page both render
`siteConfig.contact` as `mailto:` and `tel:` links. A social link,
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
Experience page has no content file of its own: `lib/site/experience.ts` is
the single source of experience data, rendered oldest first as the Home
"Engineering Journey" and newest first as the `/experience` record. Details:
"Content" in [`project-structure.md`](project-structure.md).

## Contact form

```
ContactForm (client) → POST /api/contact (Route Handler, Node.js)
  → JSON parse → honeypot → validation → rate limit → config check
    → Resend → CONTACT_TO_EMAIL inbox
```

`/contact` is prerendered; only `ContactForm` is a Client Component. It
validates with the same `validateContact` (`lib/contact/validation.ts`) that
the route runs, so messages match, but the route is authoritative. The
validator trims values, collapses line breaks in name, email, and subject,
drops unknown keys, and enforces: name 1–100, email valid and ≤ 254, subject
1–200, message 10–5,000 characters.

**Route responses** are always JSON `{ success, error?, fieldErrors? }`:

| Status | When                                                                       |
| ------ | -------------------------------------------------------------------------- |
| 200    | Sent, or the honeypot was filled (nothing is sent)                         |
| 400    | Malformed JSON or invalid fields (`fieldErrors` per field)                 |
| 405    | GET, PUT, PATCH, DELETE (`Allow: POST`)                                    |
| 413    | Body over 20,000 characters                                                |
| 415    | Content-Type is not `application/json`                                     |
| 429    | Rate limit exceeded (`Retry-After: 900`)                                   |
| 500    | Missing configuration, a Resend error, or an unexpected exception; generic |

Error bodies never contain provider messages, stack traces, or secrets. Logs
record only a fixed message and, for Resend failures, the error code; never
submitted content, email addresses, or IPs.

**Resend.** `lib/contact/sendContactEmail.ts` is the only module that imports
the `resend` SDK, and only the route imports it. Environment variables
(server only, no `NEXT_PUBLIC_` prefix, documented in `.env.example`):

| Variable             | Purpose                                               |
| -------------------- | ----------------------------------------------------- |
| `RESEND_API_KEY`     | Resend API key with sending access                    |
| `CONTACT_TO_EMAIL`   | Recipient inbox; never taken from the request         |
| `CONTACT_FROM_EMAIL` | Sender on a Resend-verified domain, e.g. `Name <a@b>` |

The visitor's address is never the sender: `from` is `CONTACT_FROM_EMAIL`,
`to` is `CONTACT_TO_EMAIL`, and `replyTo` is the visitor, so replying in the
inbox answers them. The subject is `[Portfolio Contact] {subject}`; the email
has a plain-text part and an HTML part in which every value is escaped. No
headers, recipients, or templates come from the client. If any variable is
missing, the route returns 500 and sends nothing.

**Abuse protection** is deliberately light:

- A visually hidden `website` field (`aria-hidden`, `tabindex=-1`). If it has
  a value, the route answers 200 as if sent, before validation, so a bot
  learns nothing.
- `createRateLimiter` (`lib/contact/rateLimit.ts`): 3 valid submissions per
  15 minutes per client IP, sliding window. The IP is the first
  `x-forwarded-for` address (else `x-real-ip`), used only as a limiter key.
  This is a **process-local baseline**: state is per instance, lost on
  restart, and not shared across instances or serverless invocations, and the
  header can be spoofed unless the hosting proxy overwrites it. It is not a
  distributed production control; replace it with a shared store or an edge
  rule (for example AWS WAF rate-based rules) if abuse becomes real.

**Local testing.** Unit tests mock the `resend` module; no test makes a
network call. To try real delivery, copy `.env.example` to `.env.local`
(git-ignored), set a real key, a verified sender, and your own inbox, then run
`npm run dev`. Without these, submissions return the generic error.

**Production.** The three variables come from the GitHub `production`
environment (the key as a secret) and reach the Lambda function's
environment through the deploy job; they are never in the repository. The
sender's domain must be verified in Resend. See "Secrets and environment
variables" in [`deployment.md`](deployment.md).

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
