# Portfolio

Source for my personal Backend Engineer portfolio.

> **Status:** live at [kshitijpal.in](https://kshitijpal.in), deployed to AWS
> by GitHub Actions on every push to `main`. See
> [`docs/architecture/deployment.md`](docs/architecture/deployment.md).

## Purpose

A professional portfolio presenting backend engineering work — Node.js,
TypeScript, and backend architecture — through concrete evidence: project case
studies and engineering writing.

## Stack

| Concern    | Choice                                       |
| ---------- | -------------------------------------------- |
| Framework  | Next.js 16 (App Router), React 19            |
| Language   | TypeScript (strict mode)                     |
| Styling    | Tailwind CSS v4                              |
| Content    | Local MDX via `@next/mdx`                    |
| Testing    | Vitest, React Testing Library, jsdom         |
| Quality    | ESLint (`eslint-config-next`), Prettier      |
| CI         | GitHub Actions                               |
| Deployment | AWS: CloudFront, Lambda, S3 (CloudFormation) |

There is no database, CMS, authentication, or separate backend service. The
contact form posts to a Next.js Route Handler that sends email through
Resend. Monitoring (Sentry) and analytics (Google Analytics) are planned and
not yet implemented.

## Architecture

```
Next.js → App Router → Local MDX content → Reusable UI components → AWS deployment
```

Pages are Server Components by default; Client Components are used only where
browser interactivity requires them: the contact form, navigation state
(active link, mobile menu, theme switcher), and the scroll-reveal motion
primitives. Every page is prerendered at build time; `POST /api/contact` is
the only request-time code. See
[`docs/architecture/overview.md`](docs/architecture/overview.md) and the
decision records in [`docs/adr/`](docs/adr/).

```
Browser → CloudFront ─┬─ /_next/static/*  → S3 (private, immutable assets)
                      └─ everything else  → Lambda function URL
                                             → Next.js standalone server
```

## Content

Content lives in the repository and is reviewed like code
([ADR 0001](docs/adr/0001-local-mdx-content.md)):

- **Case studies:** `content/projects/<slug>/` — typed metadata in
  `project.ts`, the body in `index.mdx`. BillSync is the only project.
- **Articles:** `content/engineering/<slug>/` — the same split, plus a
  `published`/`draft` status. Drafts are never listed, routed, prerendered,
  or added to the sitemap.
- **Experience:** `lib/site/experience.ts` is the single source, rendered
  oldest first on Home and newest first on `/experience`.
- **Identity and links:** name, navigation, contact details, social links,
  and the optional résumé and portrait live in `lib/site/config.ts`;
  components never hard-code them.

Metadata is in TypeScript rather than MDX exports so the compiler checks it.

## Accessibility, performance, and SEO

- One h1 per page, labelled landmarks, a skip link, `aria-current` on the
  active route, and a mobile menu that closes on Escape and returns focus.
- Motion never carries content; reduced motion removes movement.
- Self-hosted fonts through `next/font`; only the body face is preloaded.
- Canonical URLs, the sitemap, and robots come from `SITE_URL` at build time;
  JSON-LD states only facts the site itself shows.

Details: [`docs/architecture/seo-accessibility-performance.md`](docs/architecture/seo-accessibility-performance.md).

## Testing

Vitest with React Testing Library and jsdom, mirroring the source tree under
`tests/`. Tests render the real MDX content, check routing and metadata for
every route, pin the list of Client Components, validate the contact route
(with Resend mocked; no test makes a network call), and check the security
headers against their CloudFront copy. CI runs formatting, lint, typecheck,
tests, and a production build on every push and pull request.

## Trade-offs and known gaps

- **Lambda behind CloudFront instead of a container or Amplify:** no
  always-on compute, at the cost of cold starts on uncached requests. The
  reasoning is in [ADR 0002](docs/adr/0002-aws-lambda-cloudfront-hosting.md).
- **Contact rate limiting is per Lambda instance**, a light baseline rather
  than a distributed control.
- **No Content Security Policy yet:** the inline theme script and JSON-LD
  would need hashes or nonces.
- **No favicon, Open Graph image, résumé, or portrait yet.** None is
  referenced until a real asset exists; browsers' automatic `/favicon.ico`
  request returns 404 until then.

## Development

Requires Node.js 20.9 or newer (`.nvmrc` pins the version used in CI).

```bash
npm install
npm run dev          # start the dev server at http://localhost:3000
```

| Command                | Description                                           |
| ---------------------- | ----------------------------------------------------- |
| `npm run dev`          | Start the development server                          |
| `npm run build`        | Create a production build                             |
| `npm run start`        | Serve the production build (warns: standalone output) |
| `npm run lint`         | Run ESLint                                            |
| `npm run typecheck`    | Generate route types and run `tsc --noEmit`           |
| `npm run test`         | Run the test suite once                               |
| `npm run test:watch`   | Run tests in watch mode                               |
| `npm run format`       | Format files with Prettier                            |
| `npm run format:check` | Verify formatting (used in CI)                        |

The site builds and runs with no environment variables. Only contact form
delivery needs them: copy `.env.example` to `.env.local` (git-ignored) and set
`RESEND_API_KEY`, `CONTACT_TO_EMAIL`, and `CONTACT_FROM_EMAIL`. Without them
the form responds with a generic error and sends nothing. Details: "Contact
form" in [`docs/architecture/overview.md`](docs/architecture/overview.md).

`SITE_URL`, the canonical origin, is read at build time. Leave it unset
locally: canonical URLs, sitemap entries, and other absolute URLs are then
omitted. Production builds set it to `https://kshitijpal.in` from the GitHub
`production` environment; see
[`docs/architecture/seo-accessibility-performance.md`](docs/architecture/seo-accessibility-performance.md).

## Production deployment

Every push to `main` that passes CI is deployed to AWS by the `deploy` job in
`.github/workflows/ci.yml`: CloudFront in front of the Next.js standalone
server on Lambda, with `/_next/static` in S3, all defined in CloudFormation
under `infra/`. GitHub authenticates to AWS through OIDC; no access keys are
stored. Setup, environment variables, caching, résumé updates, custom
domain, rollback, and troubleshooting:
[`docs/architecture/deployment.md`](docs/architecture/deployment.md).

## Project structure

```
app/                 Routes, layouts, global styles
components/          Reusable UI, grouped by domain
content/             MDX sources: engineering/, projects/, about/
lib/                 Non-UI modules: content, contact, seo, site, theme, motion
public/              Static assets: images, resume, icons       (planned)
tests/               Vitest + React Testing Library tests
docs/architecture/   Architecture documentation
docs/adr/            Architecture decision records
infra/               AWS CloudFormation templates and Lambda packaging
.github/workflows/   CI and production deployment
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
