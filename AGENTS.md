<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project rules

This is a personal Backend Engineer portfolio. Read
`docs/architecture/overview.md` and `docs/architecture/project-structure.md`
before making changes.

## Content integrity

- Do not invent personal information, employers, dates, or roles.
- Do not invent project metrics, results, or numbers.
- Do not create fake testimonials, clients, projects, or articles.
- Do not expose confidential details of professional work.
- If real content is needed and not provided, ask for it.

## Architecture

- Follow the approved architecture and conventions in `docs/architecture/`.
- Do not change approved architecture or technology choices without explicit
  approval.
- Server Components by default; add `"use client"` only when genuinely required.
- Prefer simple solutions. No premature abstraction or placeholder files.
- Avoid unnecessary dependencies; justify any new one.
- Use the `@/*` import alias; no `../` climbing.

## Code quality

- TypeScript strictly: no `any`, `@ts-ignore`, `@ts-nocheck`, or broad
  `eslint-disable`.
- After meaningful changes run `npm run format:check`, `npm run lint`,
  `npm run typecheck`, `npm run test`, and `npm run build`.

## Scope

- Work only on the milestone or task requested. Do not start future milestones
  without instruction.
