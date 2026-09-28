# ADR 0002: CloudFront and Lambda (Lambda Web Adapter) for AWS hosting

- Status: Accepted
- Date: 2026-09-28

## Context

AWS is the production platform. The application is Next.js 16.3.6 (App
Router): eleven prerendered routes, two `generateStaticParams` routes with
`dynamicParams = false`, and one request-time Route Handler,
`POST /api/contact`, which calls Resend. There is no ISR, no on-demand
revalidation, no `proxy.ts`, and no image optimization in use today. No custom
domain exists yet. CI runs on Node.js 24.

Options checked against current AWS documentation (September 2026):

- **AWS Amplify Hosting.** Its Next.js support page states SSR support "up
  through Next.js 15". Next.js 16 is not listed, and downgrading Next.js to
  fit the host was ruled out.
- **AWS App Runner.** Closed to new customers since April 30, 2026; AWS
  recommends ECS Express Mode instead.
- **Amazon ECS (Express Mode or Fargate behind a load balancer).** Works with
  any Next.js version, but runs a container and a load balancer all the time
  for a site that is almost entirely static. Too much standing infrastructure
  and cost for this site.
- **OpenNext.** A capable community adapter, but it provisions several
  functions, a queue, and a table for ISR and revalidation features this site
  does not use.
- **Lambda running the Next.js standalone server through the AWS Lambda Web
  Adapter, behind CloudFront.** Needs only the documented `output:
"standalone"` server, so any Next.js version that ships it is supported.
  Lambda has a supported `nodejs24.x` runtime (deprecation April 30, 2028).

## Decision

Serve the site from CloudFront with two origins:

- the Next.js standalone server on AWS Lambda (`nodejs24.x`, x86_64), started
  by the AWS Lambda Web Adapter layer and exposed through a Lambda function
  URL, for pages, metadata routes, public files, and `/api/contact`;
- a private S3 bucket (origin access control) for `/_next/static/*`.

Define everything in CloudFormation (`infra/`). GitHub Actions deploys
through an OIDC-assumed role, with a CloudFormation service role that has
least-privilege permissions.

## Consequences

- The application code is unchanged apart from `output: "standalone"`. Every
  Next.js feature the site uses works exactly as it does under `next start`.
- Costs track traffic: no always-on compute or load balancer. CloudFront
  caches prerendered pages and hashed assets; Lambda runs only on cache
  misses and for the contact form.
- The function URL uses `AuthType: NONE`, because CloudFront origin access
  control for Lambda requires signed POST bodies, which the browser form
  cannot send. The URL can be reached directly, bypassing CloudFront. It
  serves the same public content, and canonical URLs point to CloudFront.
- Cold starts add latency to the first uncached request on a new Lambda
  instance.
- The contact rate limiter remains per instance (see "Contact form" in
  `overview.md`).
- A custom domain later means adding an alias and an ACM certificate to the
  distribution, with no application change.
