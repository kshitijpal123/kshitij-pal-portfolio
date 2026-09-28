# Portfolio

Source for my personal Backend Engineer portfolio.

> **Status: under development.** Only the application foundation exists
> (tooling, configuration, and architecture docs). No portfolio pages or
> content have been built yet.

## Purpose

A professional portfolio presenting backend engineering work — Node.js,
TypeScript, and backend architecture — through concrete evidence: project case
studies and engineering writing.

## Stack

| Concern    | Choice                                  |
| ---------- | --------------------------------------- |
| Framework  | Next.js 16 (App Router), React 19       |
| Language   | TypeScript (strict mode)                |
| Styling    | Tailwind CSS v4                         |
| Content    | Local MDX via `@next/mdx`               |
| Testing    | Vitest, React Testing Library, jsdom    |
| Quality    | ESLint (`eslint-config-next`), Prettier |
| CI         | GitHub Actions                          |
| Deployment | AWS (planned)                           |

There is no database, CMS, authentication, or separate backend service. The
contact form posts to a Next.js Route Handler that sends email through
Resend. Monitoring (Sentry) and analytics (Google Analytics) are planned and
not yet implemented.

## Architecture

```
Next.js → App Router → Local MDX content → Reusable UI components → AWS deployment
```

Pages are Server Components by default; Client Components are used only where
browser interactivity requires them. See
[`docs/architecture/overview.md`](docs/architecture/overview.md) and the
decision records in [`docs/adr/`](docs/adr/).

## Development

Requires Node.js 20.9 or newer (`.nvmrc` pins the version used in CI).

```bash
npm install
npm run dev          # start the dev server at http://localhost:3000
```

| Command                | Description                                 |
| ---------------------- | ------------------------------------------- |
| `npm run dev`          | Start the development server                |
| `npm run build`        | Create a production build                   |
| `npm run start`        | Serve the production build                  |
| `npm run lint`         | Run ESLint                                  |
| `npm run typecheck`    | Generate route types and run `tsc --noEmit` |
| `npm run test`         | Run the test suite once                     |
| `npm run test:watch`   | Run tests in watch mode                     |
| `npm run format`       | Format files with Prettier                  |
| `npm run format:check` | Verify formatting (used in CI)              |

The site builds and runs with no environment variables. Only contact form
delivery needs them: copy `.env.example` to `.env.local` (git-ignored) and set
`RESEND_API_KEY`, `CONTACT_TO_EMAIL`, and `CONTACT_FROM_EMAIL`. Without them
the form responds with a generic error and sends nothing. Details: "Contact
form" in [`docs/architecture/overview.md`](docs/architecture/overview.md).

`SITE_URL`, the canonical origin (for example `https://domain.tld`), is read
at build time. While it is unset, canonical URLs, sitemap entries, and other
absolute URLs are omitted. Set it in the production build once the domain
exists; see
[`docs/architecture/seo-accessibility-performance.md`](docs/architecture/seo-accessibility-performance.md).

## Project structure

```
app/                 Routes, layouts, global styles
components/          Reusable UI, grouped by domain            (planned)
content/             MDX sources: engineering/, projects/       (planned)
lib/                 Non-UI modules: content, seo, analytics    (planned)
public/              Static assets: images, resume, icons       (planned)
tests/               Vitest + React Testing Library tests
docs/architecture/   Architecture documentation
docs/adr/            Architecture decision records
.github/workflows/   CI pipeline
mdx-components.tsx   Global MDX component mapping (required by @next/mdx)
```

Directories marked _planned_ are created when they first hold real files.
Structure, naming, and import conventions are documented in
[`docs/architecture/project-structure.md`](docs/architecture/project-structure.md).

## Engineering principles

- **Show the engineering, don't advertise it.** Claims are backed by code,
  write-ups, and verifiable detail.
- **Server-first rendering.** Ship minimal client-side JavaScript.
- **Content is code.** Content is version-controlled and reviewed like code.
- **No speculative infrastructure.** Add abstractions when a feature needs them.
- **Strict by default.** Strict TypeScript, linting, formatting, and tests run
  in CI on every change.

## License

[MIT](LICENSE)
