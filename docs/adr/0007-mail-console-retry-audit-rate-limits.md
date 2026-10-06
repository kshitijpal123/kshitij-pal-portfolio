# ADR 0007: Manual retry, audit trail, and rate limits in the console table

- Status: Accepted
- Date: 2026-10-06

## Context

Milestone 5 completes the private mail console (see
`docs/architecture/mail-console.md`). It needs a way to retry failed sends,
an audit trail of security-relevant actions, and application rate limits,
within the architecture fixed by ADRs 0002–0006: Lambda behind CloudFront,
one DynamoDB table, EventBridge Scheduler for scheduled sends, KMS for
Gmail refresh tokens, and no always-running process, queue, cache, or
broker. Constraints:

- Retry must not create duplicate successful sends, must never resend an
  uncertain send, and must not loop.
- The audit trail must never hold passwords, OAuth tokens or codes, the
  client secret, message bodies, or unnecessary personal data.
- Rate limits must hold across Lambda instances, key on the authenticated
  user, fail safely, and must not apply to scheduled execution.

Options considered:

- **Retry as a separate send path** (its own reservation and Gmail call).
  Rejected: it would duplicate M3's checks, quota reservation, and
  idempotency, and could drift from them.
- **Automatic retries** (a scheduled retry of transient failures).
  Rejected: it needs a scheduler entry or a loop per failure, and a
  "transient" failure can hide an uncertain one.
- **Rate limiting in Redis or an API gateway.** Rejected: Redis is excluded,
  and a gateway in front of the function URL would change the hosting
  architecture for a five-person console.
- **Audit in CloudWatch Logs only.** Rejected: users could not see their
  own trail, and log lines are harder to authorize per user.

## Decision

- **Retry calls M3's `sendEmail` again with the operation's original ID.**
  The operation's records decide who is sent: `SENT`, `UNCERTAIN`, and
  `RESERVED` recipients are skipped; `FAILED` ones are reserved again only
  if still `FAILED`. Recipients Gmail rejected are excluded. All checks run
  again for the signed-in user. Retry is a manual, rate-limited request;
  nothing retries automatically. Immediate sends need the message entered
  again (bodies are never stored); scheduled occurrences use the schedule's
  stored message while it is `ACTIVE`.
- **Audit events are items in the console table** (`AUDIT#<userId>` or
  `AUDIT#system`, keyed by time), written best effort after the action,
  sanitized on every write (primitive values under allowlisted keys, no
  secret- or content-like keys, email-like values redacted), and expiring
  after one year. A USER reads only their own trail; the OWNER reads any.
- **Rate limits are fixed-window counters in the console table** (`RATE`
  items, `action:userId#windowStart`), consumed with one conditional `ADD`
  and expiring by TTL. A store error fails the action closed. Only Server
  Actions consume them; the scheduler function does not.
- No new infrastructure, IAM permission, index, or environment variable.

## Consequences

- Retry inherits M3's guarantees and limits, including "no exactly-once
  delivery"; a retried uncertain send is impossible by construction.
- A retry of an ended schedule's occurrence is impossible because its body
  has been cleared; this is accepted for privacy.
- Audit writes add one `PutItem` per action; a failed write leaves a gap
  noted only by a fixed log line.
- Rate-limit checks add one `UpdateItem` per mutating action. Fixed windows
  allow up to twice a limit around a boundary, which is acceptable at these
  limits.
- History search filters while reading a bounded number of records per
  request, instead of adding a GSI; enough for five users and 90-day
  retention.
