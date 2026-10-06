# ADR 0005: Synchronous Gmail sending with reserved quotas and idempotent send records

- Status: Accepted
- Date: 2026-10-06

## Context

Milestone 3 of the private mail console (see
`docs/architecture/mail-console.md`) sends email from users' connected Gmail
accounts, individually and to small lists. The OWNER sets per-user limits:
emails per UTC day, bulk recipients per UTC day, and recipients per bulk
send. These limits must hold under concurrent requests (two tabs, a double
click, a retried request), and a repeated submission must not send the same
message to the same person twice.

Constraints from earlier decisions: the application runs on Lambda behind
CloudFront with a 15-second timeout and no background workers (ADR 0002);
the console's data lives in one DynamoDB table (ADR 0003); Gmail access
goes through the M2 OAuth connection, whose access tokens are never stored
(ADR 0004). Gmail's `users.messages.send` has no idempotency key, and a
timed-out request may or may not have been accepted.

Options considered:

- **Check the counters, then send, then increment.** Simple, but two
  concurrent requests can both pass the check and exceed the limit.
- **Increment after Gmail accepts.** Never over-counts, but the limit is
  only enforced after the fact; concurrent requests still overshoot.
- **Queue sends for a worker** (SQS, Step Functions, EventBridge). Would
  allow larger lists and retries, but adds infrastructure, a second place
  where send state lives, and asynchronous behaviour the milestone
  excludes.
- **Reserve, then send, then finalize, in DynamoDB.** One conditional
  transaction reserves every recipient's quota and creates their send
  records before Gmail is called; each record is finalized afterwards.

## Decision

Send synchronously within the Server Action request, and reserve before
sending:

- **Reservation.** A single `TransactWriteItems` adds the number of
  recipients to the user's counter item for the UTC day
  (`QUOTA#<userId>` / `YYYY-MM-DD`), conditional on the counter staying
  within the limits (`total <= limit - n`), and puts one `RESERVED` send
  record per recipient. If any condition fails, nothing is written and the
  whole send is refused; lists are never truncated.
- **Finalization.** A Gmail acceptance marks the record `SENT`. A definite
  refusal marks it `FAILED` and decrements the counter in the same
  transaction, so the quota is released. A timeout, network error, or 5xx
  marks it `UNCERTAIN` and keeps the reservation: the message may have been
  sent.
- **Idempotency.** The server issues an operation ID per compose form. Each
  record's key is the operation ID plus a hash of the recipient. New records
  are written only if absent, retried records only while still `FAILED`.
  Repeating an operation therefore skips recipients already `SENT`,
  `RESERVED`, or `UNCERTAIN` and retries only `FAILED` ones; two concurrent
  submissions cannot both reserve a recipient.
- **Time budget.** At most 20 recipients per bulk send, 4 Gmail calls in
  flight, and recipients not started within 10 seconds are released as not
  attempted, so a request finishes within the Lambda timeout.

The existing IAM policy on the table (`GetItem`, `PutItem`, `UpdateItem`,
`DeleteItem`, `Query`) already covers these transactions; no permissions,
infrastructure, or dependencies were added.

## Consequences

- Daily limits cannot be exceeded by concurrency, and a refused send uses
  no quota.
- A duplicate submission never causes a second Gmail call for the same
  operation and recipient. This is not exactly-once delivery: `UNCERTAIN`
  sends are never retried automatically, and the user is told to check
  Gmail's Sent folder.
- A function that stops mid-send leaves records `RESERVED`; they stay
  counted for the day and are never resent. The design errs towards
  under-sending.
- Lists are limited to what one request can send (20 recipients). Larger
  campaigns, scheduling, and automatic retries would need asynchronous
  infrastructure and a new decision.
- Send records keep metadata (recipient, personalized subject, status) for
  90 days through the table's TTL; message bodies are never stored.
- These limits are the console's own. Google's Gmail sending limits apply
  separately and are reported as a rate-limit failure when Gmail enforces
  them.
