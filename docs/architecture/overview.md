# Architecture Overview

Status: foundation (Milestone 1.1). This document describes the intended shape
of the system and what exists today. It is updated as parts are implemented.

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
| UI components | Reusable presentational components, grouped by domain.     | Not started                    |
| Styling       | Tailwind CSS with design tokens in CSS custom properties.  | Neutral token foundation only  |
| Deployment    | Production hosting on AWS.                                 | Not started                    |

## Principles

- **Server Components by default.** Client Components are introduced only where
  browser-side interactivity requires them.
- **Content is code.** Content is version-controlled alongside the application
  and reviewed through the same workflow.
- **No speculative infrastructure.** Components, content loaders, and
  integrations are added when a feature needs them, not in advance.

## Directory responsibilities

| Path                 | Purpose                                                          |
| -------------------- | ---------------------------------------------------------------- |
| `app/`               | Routes, layouts, global styles                                   |
| `components/`        | Reusable UI, grouped by domain (`ui`, `layout`, `navigation`, …) |
| `content/`           | MDX sources (`engineering/`, `projects/`)                        |
| `lib/`               | Non-UI modules (`content`, `seo`, `analytics`, `utils`)          |
| `public/`            | Static assets (`images`, `resume`, `icons`)                      |
| `tests/`             | Vitest + React Testing Library tests                             |
| `docs/architecture/` | Architecture documentation                                       |
| `docs/adr/`          | Architecture decision records                                    |

Directories are created when they first hold real files.

## Decisions

Significant decisions are recorded as ADRs in [`docs/adr/`](../adr/).
