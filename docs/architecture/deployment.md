# Production Deployment (AWS)

Status: Milestone 11. The site is live at **https://kshitijpal.in**, the
canonical origin, served by the stacks in `infra/` and deployed by GitHub
Actions on every push to `main`. The distribution's default
`*.cloudfront.net` hostname still serves the same site; it is not canonical
(see "Custom domain").

Why this architecture: [ADR 0002](../adr/0002-aws-lambda-cloudfront-hosting.md).

## Architecture

```
                 Browser → https://kshitijpal.in
                               │  Route 53: alias A record
                               ▼
              ┌──────────────────────────────────┐
              │ Amazon CloudFront                │  ACM certificate (us-east-1)
              │  /_next/static/*  → S3 (cached)   │  HTTP → HTTPS redirect, HTTP/2 and 3
              │  everything else  → Lambda        │  caches by origin Cache-Control
              └───────┬──────────────────┬───────┘
     origin access    │                  │  HTTPS, Host rewritten
     control (SigV4)  ▼                  ▼
        ┌──────────────────┐   ┌──────────────────────────────────────┐
        │ S3 assets bucket │   │ Lambda function URL (AuthType NONE)   │
        │ private, hashed  │   │  Lambda nodejs24.x, x86_64, 1024 MB   │
        │ JS/CSS/fonts     │   │  Lambda Web Adapter layer → run.sh    │
        └──────────────────┘   │  → node server.js (Next.js standalone)│
                               │  pages, sitemap, robots, public/,     │
                               │  POST /api/contact → Resend           │
                               └──────────────────────────────────────┘
```

| Service         | Resource                                      | Purpose                                                       |
| --------------- | --------------------------------------------- | ------------------------------------------------------------- |
| CloudFront      | Distribution, cache and header policies       | Public HTTPS endpoint, edge cache, routing by path            |
| Lambda          | `portfolio-production-server`, function URL   | Runs the Next.js standalone server                            |
| S3              | `portfolio-production-assets-<acct>-<rgn>`    | `/_next/static/*` (hashed, immutable)                         |
| S3              | `portfolio-production-artifacts-<acct>-…`     | Lambda code packages uploaded by `aws cloudformation package` |
| CloudWatch Logs | `/aws/lambda/portfolio-production-server`     | Server logs, 30-day retention                                 |
| DynamoDB        | `portfolio-production-admin`                  | Private mail console data (see `mail-console.md`)             |
| IAM             | Roles and a permissions boundary              | OIDC deploy role, CloudFormation role, Lambda role            |
| CloudFormation  | `portfolio-bootstrap`, `portfolio-production` | Everything above, as code                                     |

Outside the templates, managed by hand: the Route 53 hosted zone for
`kshitijpal.in`, the ACM certificate, and the distribution's alias (see
"Custom domain"). Nothing else: no API Gateway, load balancer, container,
relational database, queue, or WAF.

The console table (`AdminTable`) is on-demand, with point-in-time recovery
and deletion protection, and `DeletionPolicy: Retain`, so neither a stack
deletion nor a replacement removes its data. Sessions and login-attempt
items expire through its `expiresAtEpoch` TTL. Production runs in `ap-south-1` (Mumbai), chosen
with the `AWS_REGION` variable. CloudFront is global and uses
`PriceClass_200`, which includes edge locations in India.

### Runtime

- **Lambda `nodejs24.x`**, the same major version as `.nvmrc` and CI. AWS
  lists its deprecation as April 30, 2028; move to the next LTS runtime
  before then.
- **x86_64**, matching the GitHub-hosted runner that builds the package, so
  native optional dependencies traced into the build (for example `sharp`)
  are the right binaries.
- **AWS Lambda Web Adapter** (`LambdaAdapterLayerX86`, version 30, from
  AWS's account `753240598075`). `AWS_LAMBDA_EXEC_WRAPPER=/opt/bootstrap`
  makes the adapter run `run.sh` (`infra/lambda/run.sh`), which starts
  `node server.js` on port 8000. The adapter turns each function URL event
  into an HTTP request to that server. Responses are buffered.

### Next.js build

`next.config.ts` sets `output: "standalone"`. `next build` then writes
`.next/standalone`: `server.js` and only the traced `node_modules`, about
19 MB in total. `node infra/package-server.mts` copies it into
`.aws-build/server`, adds `public/` and `run.sh`, and removes any `.env*`
file Next.js copied in. `.next/static` is not packaged; it goes to S3.

Locally, `npm run start` still serves the build but warns that standalone
output expects `node .next/standalone/server.js`. For a production-identical
local run:

```bash
npm run build && node infra/package-server.mts
cd .aws-build/server && PORT=8000 node server.js
```

`/_next/static` then returns 404, because in production S3 serves it. Copy
`.next/static` to `.aws-build/server/.next/static` for a full local preview.

## Caching

| Path                          | Served by | Origin `Cache-Control`                | CloudFront behavior                         |
| ----------------------------- | --------- | ------------------------------------- | ------------------------------------------- |
| `/_next/static/*`             | S3        | `public, max-age=31536000, immutable` | Cached for a year; names are content hashed |
| Prerendered pages             | Lambda    | `s-maxage=31536000`                   | Cached at the edge until the next deploy    |
| `/sitemap.xml`, `/robots.txt` | Lambda    | Same as prerendered pages             | Cached until the next deploy                |
| `public/` files, the résumé   | Lambda    | `public, max-age=0` with an `ETag`    | Not cached; browsers revalidate             |
| `/api/contact`, 404s          | Lambda    | none, or `private, no-store`          | Never cached                                |
| `/admin/*` (dynamic)          | Lambda    | `private, no-cache, no-store`         | Never cached; cookies reach the origin      |

- The server cache policy keys on every query string (`_rsc`) and the
  `rsc`, `next-router-prefetch`, `next-router-state-tree`,
  `next-router-segment-prefetch`, and `next-url` headers, so an HTML response
  and an RSC payload for the same path never share an entry (see the
  Next.js "CDN Caching" guide). No cookies are in the key.
- Browsers never cache pages (`s-maxage` applies only to shared caches), so
  visitors see a new deploy as soon as CloudFront does.
- Every deploy ends with a CloudFront invalidation of `/*`, and the workflow
  waits for it to complete. The first 1,000 invalidation paths each month are
  free, and `/*` counts as one path.
- The résumé is never cached at the edge, so a replaced PDF is live as soon
  as the deploy finishes. Nothing about the old file lingers.
- Static assets are uploaded without `--delete`: pages still held in a
  cache can keep loading the hashed files they reference. The bucket grows by
  a few hundred kilobytes per release. It has no lifecycle rule, because
  `aws s3 sync` leaves unchanged files with their original dates, so an
  age-based expiry would delete current assets.

## Security headers

`next.config.ts` sets `Strict-Transport-Security: max-age=31536000`,
`X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, and
`Permissions-Policy: camera=(), microphone=(), geolocation=()`, and
disables `X-Powered-By`. Those reach every response from Lambda.
`/_next/static/*` comes from S3, so the `StaticAssetsHeadersPolicy`
response headers policy in `infra/portfolio.yaml` adds the same four
headers there. Keep the two lists in step; `tests/next.config.test.ts`
fails if they drift.

HSTS has no `includeSubDomains` or `preload`: both would commit hostnames
this site does not serve, and preload is hard to undo. CloudFront also
redirects every HTTP request to HTTPS (301).

Deferred, deliberately: a **Content Security Policy**. The inline theme
script (`themeInitScript`) and the JSON-LD scripts need hashes or nonces.
A nonce makes every page dynamic, which removes edge caching of prerendered
pages, and hashes would need a build step that rewrites the policy whenever
the theme script or any structured data changes. A policy without them
would need `'unsafe-inline'` for scripts, which adds little. The site loads
no third-party script, frame, or font (fonts are self-hosted through
`next/font`), so the practical exposure a CSP would reduce is small today.
Revisit it when analytics or monitoring adds third-party scripts.

## Secrets and environment variables

| Name                                                                         | Kind                | Where it lives                                      | Used by                                |
| ---------------------------------------------------------------------------- | ------------------- | --------------------------------------------------- | -------------------------------------- |
| `SITE_URL`                                                                   | Build-time, public  | GitHub environment variable                         | `next build` (canonical URLs, sitemap) |
| `RESEND_API_KEY`                                                             | Runtime, **secret** | GitHub environment secret                           | Lambda environment → `/api/contact`    |
| `CONTACT_TO_EMAIL`                                                           | Runtime             | GitHub environment variable                         | Lambda environment → `/api/contact`    |
| `CONTACT_FROM_EMAIL`                                                         | Runtime             | GitHub environment variable                         | Lambda environment → `/api/contact`    |
| `ADMIN_BOOTSTRAP_TOKEN`                                                      | Runtime, **secret** | GitHub environment secret, only while bootstrapping | Lambda environment → `/admin/setup`    |
| `ADMIN_TABLE_NAME`                                                           | Runtime             | Set by the template                                 | Lambda environment → `/admin`          |
| `AWS_REGION`                                                                 | Deployment          | GitHub environment variable                         | Workflow                               |
| `AWS_DEPLOY_ROLE_ARN`, `AWS_CLOUDFORMATION_ROLE_ARN`, `AWS_ARTIFACTS_BUCKET` | Deployment          | GitHub environment variables                        | Workflow                               |

- There are no AWS access keys anywhere. The deploy job exchanges its GitHub
  OIDC token for a one-hour session on `github-deploy-portfolio-production`.
  The role trusts only
  `repo:<owner>@<owner-id>/<repo>@<repo-id>:environment:production`, GitHub's
  immutable subject format, so a recreated or recycled repository name
  cannot assume it.
- `RESEND_API_KEY` travels from the GitHub secret, through a
  `NoEcho` CloudFormation parameter, into the Lambda environment. There
  Lambda encrypts it at rest. GitHub masks it in logs, and CloudFormation
  never displays it. Anyone with `lambda:GetFunctionConfiguration` on the
  function can read it, so keep console access to the account limited.
- `ADMIN_BOOTSTRAP_TOKEN` takes the same `NoEcho` path. It exists only to
  create the console's OWNER: add it, deploy, create the OWNER, then delete
  the secret and deploy again (an unset secret deploys as an empty value,
  which turns bootstrap off). See "OWNER bootstrap" in
  [`mail-console.md`](mail-console.md).
- None of these values are `NEXT_PUBLIC_`, so none reach the browser.
- Nothing secret is in the repository, `.env.example`, the templates, or
  this document. `.env*` files are git-ignored and stripped from the Lambda
  package.

## IAM (least privilege)

- **Lambda execution role.** It may write to its own log group and perform
  `GetItem`, `PutItem`, `UpdateItem`, `DeleteItem`, and `Query` on the
  console table only (no `Scan`, batch, or table-level actions). A
  permissions boundary (`portfolio-production-lambda-boundary`, created by the
  bootstrap stack) caps it at that, whatever the application template
  requests.
- **CloudFormation execution role** (`cfn-exec-portfolio-production`). It
  manages only the application stack's resources: functions, roles, and log
  groups named `portfolio-production-*`, tables named
  `portfolio-production-*` (create, update, delete, TTL, backups, tags), and
  the assets bucket. It can create
  roles only with the boundary attached, and pass them only to Lambda.
  CloudFront policy actions use `*` where CloudFront has no resource-level
  permissions.
- **GitHub deploy role** (`github-deploy-portfolio-production`). It may
  create and execute change sets on the `portfolio-production` stack, pass
  the CloudFormation role, upload to the two buckets (with no delete), and
  invalidate the distribution. It cannot create IAM resources itself.

## One-time setup

Production has been set up this way. The steps are kept for rebuilding it,
for example in a new account. They need someone with administrator access
to the AWS account and admin access to the GitHub repository, and the AWS
CLI v2.

1. **The repository is on GitHub.** The trust policy names it by owner and
   repository, with their numeric IDs.

2. **Create the bootstrap stack.** It holds the OIDC provider (skip creating
   one with `ExistingOidcProviderArn=<arn>` if the account already has one
   for `token.actions.githubusercontent.com`), the two roles, the
   permissions boundary, and the artifacts bucket. The numeric IDs come from
   the subject prefix GitHub reports for the repository
   (`repo:<owner>@<owner-id>/<repo>@<repo-id>`):

   ```bash
   gh api repos/<owner>/<repo>/actions/oidc/customization/sub \
     --jq .sub_claim_prefix

   aws cloudformation deploy \
     --region ap-south-1 \
     --stack-name portfolio-bootstrap \
     --template-file infra/bootstrap.yaml \
     --capabilities CAPABILITY_NAMED_IAM \
     --parameter-overrides GitHubOwner=<owner> GitHubOwnerId=<owner-id> \
       GitHubRepository=<repo> GitHubRepositoryId=<repo-id>

   aws cloudformation describe-stacks --region ap-south-1 \
     --stack-name portfolio-bootstrap --query "Stacks[0].Outputs"
   ```

3. **Create the GitHub `production` environment** (Settings → Environments)
   and limit its deployment branches to `main`. Add:

   | Variable                      | Value                                    |
   | ----------------------------- | ---------------------------------------- |
   | `AWS_REGION`                  | `ap-south-1`                             |
   | `AWS_DEPLOY_ROLE_ARN`         | Bootstrap output `DeployRoleArn`         |
   | `AWS_CLOUDFORMATION_ROLE_ARN` | Bootstrap output `CloudFormationRoleArn` |
   | `AWS_ARTIFACTS_BUCKET`        | Bootstrap output `ArtifactsBucketName`   |
   | `CONTACT_TO_EMAIL`            | The inbox that receives messages         |
   | `CONTACT_FROM_EMAIL`          | A sender on a Resend-verified domain     |
   | `SITE_URL`                    | `https://kshitijpal.in`                  |

   and the secret `RESEND_API_KEY`. The same can be done with `gh variable
set <name> --env production` and `gh secret set RESEND_API_KEY --env
production`. The deploy job fails before building if `SITE_URL` is unset
   or is not a bare `https://` origin.

4. **First deployment.** Push to `main`. The deploy job creates the
   `portfolio-production` stack, which takes a few minutes because of the
   CloudFront distribution. It then uploads assets and invalidates. The
   smoke test runs against `SITE_URL`, so on a brand-new stack it fails until
   the custom domain points at the new distribution (step 5); the stack
   itself is complete by then.

5. **Attach the custom domain** as described in "Custom domain", then
   re-run the workflow.

## GitHub Actions

`.github/workflows/ci.yml` has two jobs:

1. **`verify`** runs on every push and pull request: `format:check`, `lint`,
   `typecheck`, `test`, and `build`.
2. **`deploy`** runs only for pushes to `main`, after `verify` succeeds, in
   the `production` environment. Its steps:

```
check variables → npm ci → next build (SITE_URL) → assemble Lambda package
  → assume role (OIDC) → sync /_next/static to S3 (if the stack exists)
  → cloudformation package → cloudformation deploy (CloudFormation role)
  → sync /_next/static → invalidate /* and wait → smoke test
```

Any failing step fails the workflow, so a broken build never deploys. If
CloudFormation fails, it rolls the stack back to the last good state. The
smoke test runs against `SITE_URL`, the public origin: `/`,
`/work/billsync`, `/robots.txt`, and `/sitemap.xml` (expecting 200),
`GET /api/contact` (405), and an unknown path (404). It also checks that
robots.txt lists `$SITE_URL/sitemap.xml`, which proves the build baked in
the right origin, and that the distribution's default hostname still
answers 200. Deployments never run concurrently, and a newer push to `main`
does not cancel one in progress.

The same steps can run by hand from a machine with credentials for the
deploy role. The workflow file is the reference.

## Routine operations

### Deploying a change

Merge or push to `main`. Nothing else is needed.

### Updating the résumé

The résumé lives at `public/resume/Kshitij-Pal-Resume.pdf` and is served at
`/resume/Kshitij-Pal-Resume.pdf`. The filename is fixed, so links never
change and there are no versioned names.

- **First time.** Add the PDF, set
  `resumeHref: "/resume/Kshitij-Pal-Resume.pdf"` in `lib/site/config.ts`,
  and update the "has no résumé configured" assertion in
  `tests/components/navigation/ResumeLink.test.tsx`. Until then, every
  résumé link stays hidden. See "Résumé" in
  [`project-structure.md`](project-structure.md).
- **Every later update.** Replace the PDF with the same name, then
  commit and push. GitHub Actions deploys it to AWS, and the new file is
  live when the job finishes, because the résumé is never cached at the edge.

Keep the PDF under about 4 MB. A buffered Lambda response is limited to
6 MB, and binary bodies are base64 encoded on the way through.

### Changing `SITE_URL`

Update the `SITE_URL` environment variable, then re-run the latest workflow
or push. It is read only at build time, and a malformed value fails the
build rather than publishing wrong URLs.

### First deploy of the mail console

The console added a DynamoDB table and new permissions in both templates.
**Update the bootstrap stack before pushing the application change**:
without it, the CloudFormation role cannot create the table (the deploy
fails and rolls back), and the permissions boundary would deny the
function's table access. With administrator credentials:

```bash
aws cloudformation deploy \
  --region ap-south-1 \
  --stack-name portfolio-bootstrap \
  --template-file infra/bootstrap.yaml \
  --capabilities CAPABILITY_NAMED_IAM
```

(Existing parameter values are kept.) Then push, and follow "OWNER
bootstrap" in [`mail-console.md`](mail-console.md) to create the OWNER. The
`Distribution` resource is unchanged, so the custom domain is unaffected.

### Rotating the Resend key

Update the `RESEND_API_KEY` secret, then re-run the latest workflow. The
deploy step passes the new value to the Lambda configuration.

## Custom domain

`https://kshitijpal.in` is the canonical origin. Its state:

| Part             | State                                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| DNS              | Route 53 hosted zone; the apex is an alias to the distribution                                       |
| Certificate      | ACM (Amazon-issued), covering `kshitijpal.in` and `*.kshitijpal.in`; CloudFront requires `us-east-1` |
| Distribution     | `kshitijpal.in` is an alternate domain name of the `portfolio-production` distribution               |
| HTTP             | `http://kshitijpal.in` redirects to `https://kshitijpal.in/` (301)                                   |
| `www`            | Not configured: `www.kshitijpal.in` has no DNS record                                                |
| Default hostname | `https://<id>.cloudfront.net` serves the same pages; their canonical URLs point to `kshitijpal.in`   |
| Application      | Only `SITE_URL=https://kshitijpal.in`; no code names the domain                                      |

**The alias and certificate are not in `infra/portfolio.yaml`.** They were
attached to the distribution outside CloudFormation. Deploys that leave the
`Distribution` resource unchanged keep them (CloudFormation only updates
resources whose template changed), but any change to that resource makes
CloudFormation send the template's distribution config, which has no alias
and the default certificate, and the custom domain stops working. Before
changing the distribution, bring the domain into the template:

1. Add `AcmCertificateArn` and `DomainName` parameters to
   `infra/portfolio.yaml`, and on the distribution set
   `Aliases: [!Ref DomainName]` and a `ViewerCertificate` with
   `AcmCertificateArn`, `SslSupportMethod: sni-only`, and the
   `MinimumProtocolVersion` the distribution uses today.
2. Allow `acm:DescribeCertificate` and `acm:ListCertificates` on the
   CloudFormation execution role in `infra/bootstrap.yaml`, and update the
   bootstrap stack. CloudFront checks the certificate with the caller's
   permissions.
3. Pass the two values from new `production` environment variables in the
   deploy job's `cloudformation deploy` step.
4. Compare the console's alternate domain names and certificate with the
   template values before pushing, so the first update changes nothing.

The default `*.cloudfront.net` hostname is not redirected. Its pages
declare `kshitijpal.in` as canonical, so search engines consolidate on the
custom domain; a redirect would need a CloudFront Function and is not worth
it while nothing links to that hostname. To serve `www`, add it as an
alternate domain name (the certificate already covers it) with a Route 53
alias, and redirect it to the apex rather than serving duplicate pages.

## Rollback

- **Failed deployment.** CloudFormation rolls back automatically, and the
  workflow fails before invalidating.
- **Bad release that deployed.** `git revert` the commit and push. For
  speed, re-run the deploy job of the last good workflow run instead: a
  re-run checks out that run's commit and deploys it again.
- **Failed first creation.** A stack that fails its first create ends in
  `ROLLBACK_COMPLETE` and must be deleted before a retry:
  `aws cloudformation delete-stack --stack-name portfolio-production`.

Lambda versions and aliases are not used. The Git history, rebuilt through
the same pipeline, is the release record.

## Troubleshooting

| Symptom                                                   | Likely cause and fix                                                                                                                |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| "Variable … is not set on the production environment"     | Step 3 of the setup is incomplete                                                                                                   |
| `Not authorized to perform sts:AssumeRoleWithWebIdentity` | The owner, repository, IDs, or environment name differ from the bootstrap parameters; update the bootstrap stack                    |
| CloudFormation `AccessDenied` for some action             | The CloudFormation role lacks it. Add the narrowest action to `infra/bootstrap.yaml` and redeploy the bootstrap stack               |
| CloudFront 502 or 503                                     | The server did not start. Read `/aws/lambda/portfolio-production-server` (a missing exec bit on `run.sh` or a crash in `server.js`) |
| `{"Message":"Forbidden"}` from the function URL           | A function URL permission is missing; both `lambda:InvokeFunctionUrl` and `lambda:InvokeFunction` are required                      |
| Contact form shows the generic error                      | The log says `[contact] Email delivery is not configured.` (variables unset) or gives a Resend error code (key or sender domain)    |
| Old content after a deploy                                | Check that the invalidation step ran; `aws cloudfront create-invalidation --paths "/*"` fixes it by hand                            |
| JS or CSS 403 from `/_next/static`                        | The asset was not uploaded (403 rather than 404 because CloudFront cannot list the bucket). Re-run the workflow                     |

## Cost (high level)

Everything is pay-per-use: no always-on compute, load balancer, or NAT.
CloudFront and Lambda both have monthly always-free allowances, and a
personal portfolio's traffic normally stays within them. Most requests are
answered from the CloudFront cache without invoking Lambda. What remains is
small S3 storage (static assets and 30 days of packages), CloudWatch Logs
ingestion with 30-day retention, and invalidations, which are within the
free allowance at one per deploy. The console table is on-demand with no
provisioned capacity, so at five users its requests, storage, and
point-in-time recovery are negligible. Check current AWS pricing for figures.
A budget alarm is worth adding in the AWS Billing console. It is not in
the templates.

## Limitations

- **Direct function URL access.** The function URL is public
  (`AuthType: NONE`; see ADR 0002) and serves the same site without
  CloudFront caching. Canonical URLs point to `kshitijpal.in`. Restricting it
  would need CloudFront to send a secret origin header and the application
  to check it in `proxy.ts`, which is not worth the extra code today.
- **Rate limiting** stays the per-instance baseline described in
  `overview.md`. Concurrent Lambda instances do not share counts.
  CloudFront appends the viewer address to `X-Forwarded-For`, but the first
  entry, which the limiter reads, can still be supplied by the client. A
  CloudFront or WAF rate rule is the upgrade path if abuse appears.
- **Cold starts.** The first uncached request on a new Lambda instance waits
  for Node.js and the Next.js server to start.
- **Image optimization** is unused today. When the portrait is added, verify
  that `next/image` works on Lambda before relying on it: its cache
  directory is read-only there. `images.unoptimized` with a correctly sized
  image is the fallback.
- **No streaming.** Responses are buffered. No page streams today.
- **Deleting the stack** requires emptying the assets bucket first.
