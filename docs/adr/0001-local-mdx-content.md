# ADR 0001: Local MDX content instead of a CMS or database

- Status: Accepted
- Date: 2026-09-28

## Context

The portfolio publishes a small, slowly changing set of content: engineering
writing and project case studies. The content is authored by a single person
and benefits from code review, version history, and the ability to embed React
components.

## Decision

Store content as MDX files in the repository under `content/`, compiled by
`@next/mdx`. Do not introduce a database, headless CMS, or content API.

## Consequences

- Content changes go through the same Git workflow and CI checks as code.
- No runtime data store to operate, secure, or pay for.
- Publishing requires a commit and deployment; there is no in-browser editor.
- Content metadata (for listings and SEO) must be handled in code. The exact
  mechanism is deferred until the first content type is implemented.
