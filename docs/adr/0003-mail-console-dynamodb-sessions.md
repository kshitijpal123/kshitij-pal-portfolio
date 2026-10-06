# ADR 0003: DynamoDB and stored sessions for the private mail console

- Status: Accepted
- Date: 2026-10-06

## Context

The private mail console (`/admin`, see
`docs/architecture/mail-console.md`) needs persistent users, invitations,
sessions, login-attempt counts, and sender identities. The application runs
on Lambda behind CloudFront (ADR 0002): instances are short-lived and
concurrent, so nothing can live in process memory. The data is tiny (at most
five users) and must stay consistent under concurrent requests: one OWNER,
unique emails, single-use invitations, and a hard five-seat limit.

Options considered:

- **Amazon RDS or Aurora Serverless.** Relational and transactional, but a
  VPC, connection management from Lambda, and a standing cost (or cold
  resumes) for a handful of rows.
- **Signed, stateless session cookies (JWT).** No session store, but
  sessions cannot be revoked before they expire, so disabling a user or
  signing out would not take effect immediately, and a signing secret has to
  be managed and rotated.
- **A hosted auth provider (Cognito, Auth0, Clerk).** Removes password
  handling, but adds an external dependency and hosted UI or SDKs for five
  invited users, and still leaves roles, invitations, and the seat limit to
  build.
- **DynamoDB, one on-demand table, with opaque sessions stored in it.**
  Serverless and pay-per-request like the rest of the stack, reachable from
  Lambda without a VPC, with conditional writes and transactions for the
  invariants, and TTL for expiring sessions.

## Decision

Use one DynamoDB table (`<stack>-admin`, on-demand, point-in-time recovery,
deletion protection, retained on stack deletion) defined in
`infra/portfolio.yaml`, with a single-table layout. Enforce invariants with
conditional writes and transactions: lock items for the OWNER and unique
emails, and an optimistic version on a seats item for the five-seat limit.

Sessions are opaque random tokens in an HttpOnly cookie; only their SHA-256
hash is stored, with a TTL. Passwords are hashed with Argon2id
(`@node-rs/argon2`). The Lambda role may perform only `GetItem`, `PutItem`,
`UpdateItem`, `DeleteItem`, and `Query` on that table, and the permissions
boundary allows nothing broader.

Persistence sits behind the `AdminStore` interface. An in-memory
implementation serves tests and local development; production fails closed
without a table.

## Consequences

- No new standing cost: an idle table costs only its (negligible) storage
  and backups.
- Sessions and accounts can be revoked immediately; every request reads the
  session and user (two strongly consistent reads).
- Two new dependencies: the AWS SDK v3 DynamoDB clients, and
  `@node-rs/argon2`, a native module with prebuilt binaries for the Lambda
  platform, which Next.js already treats as a server external package.
- The bootstrap stack must be updated before the next application deploy:
  the CloudFormation role needs table permissions, and the Lambda
  permissions boundary must allow the item actions.
- Listing uses one partition per collection, which suits five users but is
  not a design for large data; mail data in later milestones gets its own
  keys scoped by user.
