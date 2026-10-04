# SEO, Accessibility, and Performance

Status: Milestone 8. Search engines should understand the site because its
content and structure are good, not because pages carry extra copy. Nothing
here adds visible content; every value comes from `siteConfig` or typed
content.

## Canonical site URL

`lib/seo/siteUrl.ts` exports `siteUrl`, the single source for absolute URLs.
It is read from the `SITE_URL` environment variable **at build time** (pages,
the sitemap, and robots are prerendered, so the value is baked into the
build).

- Unset (local development and tests): canonical URLs, `og:url`,
  `metadataBase`, sitemap entries, the robots `Sitemap:` line, and
  structured-data URLs are all omitted. Nothing falls back to `localhost` or
  a placeholder domain.
- Set: it must be a bare origin such as `https://domain.tld` (no path, query,
  or hash). A malformed value throws and fails the build.

In production it is `https://kshitijpal.in`, the `SITE_URL` variable of the
GitHub `production` environment; the deploy job refuses to build without a
bare `https://` value (see [`deployment.md`](deployment.md)). The domain is
never written in code. The temporary `*.cloudfront.net` hostname is not
canonical: it serves the same build, so its pages declare `kshitijpal.in`.
Tests pin `SITE_URL` to empty (`vitest.config.mts`) and stub it where they
need a URL, using the reserved `portfolio.test` domain.

Next.js writes the Home canonical and `og:url` as the bare origin
(`https://kshitijpal.in`) and every other URL without a trailing slash
(`trailingSlash` is off); the sitemap and JSON-LD write Home as
`https://kshitijpal.in/`. Both spellings are the same URL: an empty path
is `/`.

## Metadata

`lib/seo/metadata.ts` builds every route's metadata with the Metadata API;
routes never assemble social tags themselves.

| Helper            | Used by                                                |
| ----------------- | ------------------------------------------------------ |
| `rootMetadata`    | `app/layout.tsx`: title default and template, author   |
| `pageMetadata`    | Static routes: title, description, canonical, OG, card |
| `projectMetadata` | `/work/[slug]`: `metaTitle`, summary plus status       |
| `articleMetadata` | `/engineering/[slug]`: article OG type and dates       |

- **Titles.** The root template is `%s · Kshitij Pal`; a route sets only its
  own part (`"Work"`). Home uses the absolute title
  `Kshitij Pal · Backend Engineer`.
- **Descriptions** are unique per route and describe that page. Articles use
  their `description`; case studies use `summary` followed by `status`, so a
  project in progress says so.
- **Open Graph and Twitter.** Next.js replaces `openGraph` and `twitter` per
  route instead of merging them, so `pageMetadata` always returns the full
  set: title, description, URL (when known), site name, `en_US` locale, and
  type (`website`, or `article` with `publishedTime`, `modifiedTime` only
  when `updatedAt` is set, and the author). The card is `summary`; there is
  no `twitter:site` or `twitter:creator` because no handle is configured.
- **Images.** No OG image, favicon, or icon exists, so none is referenced.
  When real assets exist, add `app/opengraph-image.(png|jpg)` (or a
  per-route one) and `app/icon.(png|svg)`/`app/favicon.ico`; Next.js emits the
  tags from those file conventions, and the card can become
  `summary_large_image`. Until then browsers' automatic `/favicon.ico`
  request returns 404, which Lighthouse reports as a console error.
- **Robots meta.** Indexable pages carry no robots tag (indexing is the
  default). Next.js adds `noindex` to every 404 response.

## Sitemap and robots

`app/sitemap.ts` and `app/robots.ts` are thin wrappers over
`buildSitemap` (`lib/seo/sitemap.ts`) and `buildRobots` (`lib/seo/robots.ts`).
Both are prerendered.

- The sitemap lists the navigation pages, each case study, and each
  published article, as absolute URLs. It is empty while `SITE_URL` is unset,
  because a sitemap cannot contain relative URLs.
- `lastModified` is set only from real content dates: an article's
  `updatedAt` or `publishedAt`, and the newest of those for `/engineering`.
  No `changeFrequency` or `priority`.
- robots.txt allows everything except `/api/`, and lists the sitemap once
  `SITE_URL` is set.

## Drafts and 404s

A draft article is dropped by the registry before anything reads it, so it
is not prerendered (`dynamicParams = false` returns 404), has no metadata,
and never reaches the sitemap or structured data. Unknown project and
article slugs return 404 the same way. `app/not-found.tsx` gives 404s a
descriptive title ("Page not found · Kshitij Pal"), one h1, and a link home;
it has no canonical, social metadata, or structured data.

## Structured data

`lib/seo/structuredData.ts` builds schema.org JSON-LD and
`components/seo/JsonLd.tsx` renders it as a native
`<script type="application/ld+json">` in the page (the pattern the Next.js
JSON-LD guide recommends).

| Page     | Schema                                                                                               |
| -------- | ---------------------------------------------------------------------------------------------------- |
| Home     | `Person` (name, job title, `sameAs` from `siteConfig.social`), plus `WebSite` once `SITE_URL` is set |
| Articles | `Article` (headline, description, `datePublished`, `dateModified` when revised, author, URL)         |

Only facts the site states are included: no employer, organization, image,
rating, or review. `serializeJsonLd` escapes `<`, `>`, `&`, U+2028, and
U+2029, so no content can close the script element. Structured data is
built from repository content only; contact form input never reaches it.

## Accessibility conventions

- Every page has exactly one h1 and headings descend without skipping.
  MDX content starts at `##`.
- Landmarks: skip link → `header` → `main#main-content` → `footer`. Each
  `nav` has a label (Primary, Footer, Profiles, Articles, Case study, …).
- The active navigation item has `aria-current="page"`, or `"true"` for a
  parent of the current route.
- The mobile menu is a disclosure button (`aria-expanded`, `aria-controls`);
  Escape closes it and returns focus to the button. It does not trap focus.
- The theme switcher is a native radio group in a `fieldset` with a legend,
  so the checked state (including System) is exposed without ARIA.
- Form fields have labels, `required`, the right input type, `autocomplete`
  where a standard token exists, and errors linked with
  `aria-describedby`/`aria-invalid`. Sending status is announced through
  `role="status"` and `role="alert"` regions.
- Decorative drawings (hero visual, journey trajectory, diagram arrows) are
  `aria-hidden`; the same information is in text next to them.
- Dates use `<time dateTime>`. Code blocks are focusable so they can be
  scrolled by keyboard.
- Motion: see [`motion.md`](motion.md). Content never depends on animation,
  reduced motion removes movement and loops, and no-script shows the final
  state.

## Performance principles

- Every page is prerendered at build time; only `POST /api/contact` runs on
  request. Pages use no request-time APIs.
- Server Components by default. The only Client Components are the contact
  form, the navigation state (`NavLink`, `MobileNav`, `ThemeSwitcher`), and
  the motion primitives and animated visuals. `tests/app/rendering.test.ts`
  fails if this list grows or a route becomes a Client Component.
- Motion for React loads through `LazyMotion` with `domAnimation` and only on
  pages that animate; animations use transforms and opacity only.
- Fonts come from `next/font` (self-hosted, `font-display: swap`, metric
  fallbacks). Sans and serif are variable fonts with one Latin subset each;
  mono loads only the two weights used. Only the body face is preloaded: it
  is the face of each page's largest text element.
- No images ship today. A future portrait uses `next/image` with intrinsic
  dimensions (see "Portrait" in [`project-structure.md`](project-structure.md)).
- `next.config.ts` sets `Strict-Transport-Security`,
  `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy`, and
  removes `X-Powered-By`. A Content Security Policy remains deferred: the
  inline theme script and JSON-LD would need hashes or nonces (reasons in
  "Security headers" in [`deployment.md`](deployment.md)). These headers
  apply when Next.js serves the site;
  in production CloudFront passes them through and repeats them for the
  static assets it serves from S3 (see "Security headers" in
  [`deployment.md`](deployment.md)).
