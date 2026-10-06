# ADR 0006: Scheduled sends with EventBridge Scheduler and a short-lived function

- Status: Accepted
- Date: 2026-10-06

## Context

Milestone 4 of the private mail console (see
`docs/architecture/mail-console.md`) lets a user schedule a message for
later, once or on a repeating timetable (daily, weekly on chosen days, or
monthly on a day). M3 sends synchronously within a Server Action, with
per-user daily quotas reserved in DynamoDB and idempotent send records
(ADR 0005). The site runs on Lambda behind CloudFront and has no
always-running process (ADR 0002). Requirements for M4:

- No worker, cron process, polling loop, queue, broker, instance, or
  always-running service.
- Every scheduled send must pass the same checks as a send made now, at
  the time it is sent, and use the same quotas and idempotency.
- No public, unauthenticated way to trigger a send, and nothing in a
  trigger may decide who sends what to whom.
- A repeated or concurrent trigger must never send twice; an uncertain
  send must never be resent.
- Per-user limits on active and recurring schedules and on how far ahead
  a schedule may start, enforced under concurrency.

Options considered:

- **A polling reconciler** (an EventBridge rule every minute scanning for
  due schedules). Simple to reason about, but it is a polling loop: it
  runs whether or not anything is due, needs a table scan or index, and
  adds up to a minute of latency. Excluded.
- **SQS delay queues or Step Functions waits.** SQS delays are capped at
  15 minutes; Step Functions can wait for long periods but keeps a running
  execution per schedule and adds a second state store. Neither handles
  recurrence natively.
- **An EventBridge rule per schedule.** Rules are limited per account and
  support only UTC cron, so time zones and daylight saving would be ours
  to handle.
- **EventBridge Scheduler, one schedule per application schedule,**
  invoking a dedicated function. Scheduler supports one-time `at()` and
  cron expressions in an IANA time zone with defined daylight-saving
  behaviour, invokes targets through an IAM role, can delete one-time
  schedules after they run, and runs nothing between invocations.

## Decision

Use EventBridge Scheduler as the trigger only, and keep all state and all
decisions in the application:

- **Triggers.** The server creates one Scheduler schedule per application
  schedule in a dedicated group (`<stack>-mail`), named
  `mail-<schedule ID>` with the schedule ID as the idempotency token. Its
  payload is only `{scheduleId, scheduledTime}`. One-time triggers fire at
  the UTC instant; recurring triggers use a cron expression generated from
  the structured recurrence, in the schedule's IANA zone.
- **Execution.** A dedicated `<stack>-scheduler` function, with no
  function URL and no resource policy, is invoked only through
  `SchedulerInvokeRole`, which only `scheduler.amazonaws.com` may assume
  for this account and group. The function accepts exactly the two payload
  fields, loads the schedule, checks that the time is one of its
  occurrences and is due, claims the occurrence, and calls M3's
  `sendEmail` with the schedule's owner as the actor. All M3 gates, quotas,
  and send-record idempotency apply unchanged.
- **Idempotency.** An occurrence is claimed by one DynamoDB transaction:
  the run item (schedule ID plus the occurrence's local date and time) is
  created only if absent, together with a write conditional on the
  schedule being ACTIVE. The occurrence's M3 operation ID is derived
  deterministically from the schedule and occurrence. A repeat finds the
  claim and does nothing, whatever the earlier outcome.
- **Failures.** No automatic retry of a send. Infrastructure retries of
  the invocation (Scheduler: 2 within an hour; Lambda asynchronous: 1,
  events older than an hour dropped) are safe because of the claim. An
  invocation more than an hour late is recorded as missed.
- **Limits.** Per-user `active` and `recurring` counters in one item,
  incremented in the creation transaction under a "stay within the limit"
  condition and decremented in the transaction that ends a schedule.
- **Recurrence.** The next occurrence is computed from the recurrence in
  the schedule's zone, never "now plus an interval"; missed occurrences
  are not backfilled. Daylight saving follows Scheduler's rules (a
  nonexistent local time is skipped; a repeated one runs once).
- **Cancellation.** The stored status changes first (conditional on
  ACTIVE), then the trigger is deleted. The function deletes any trigger
  that fires for a schedule that is missing or no longer ACTIVE, so no
  trigger outlives its schedule. Schedules cannot be edited.

The function is bundled with `esbuild` (`infra/package-scheduler.mts`)
from the same TypeScript modules as the site, so it shares the M3 code
rather than duplicating it.

New dependencies: `@aws-sdk/client-scheduler` (runtime; the same SDK v3
family as the DynamoDB and KMS clients) to create and delete triggers,
and `esbuild` (development only) to bundle the function. No new runtime
service other than EventBridge Scheduler.

IAM is scoped to named resources: the server may create and delete
schedules in the group and pass only the invoke role, only to Scheduler;
the function may delete (not create) schedules in the group, use the
table without `DeleteItem`, and use the Gmail token key under its purpose
condition; the invoke role may invoke only the function. No `*` actions.
The permissions boundary and CloudFormation execution role are extended
accordingly, limited to the stack's own resources.

## Consequences

- Nothing runs, polls, or bills between occurrences; the trigger carries
  no user data, and the send is authorized again at send time.
- Duplicate or concurrent invocations never send twice; uncertain sends
  are never resent. As in M3, this is not exactly-once delivery.
- Message bodies of ACTIVE schedules are stored in the table until the
  schedule ends, then cleared.
- A schedule's state lives in DynamoDB and its trigger in Scheduler; they
  are kept consistent by ordering (state first) and by the function
  removing triggers that should not exist. Creating a trigger that fails
  marks the schedule FAILED and releases its slot.
- A scheduled send that fails waits for the next occurrence (recurring)
  or ends the schedule (one-time); there is no retry. Editing and pausing
  are not offered; cancel and recreate instead.
- Deploying requires updating the bootstrap stack first (boundary and
  CloudFormation role), as for earlier console milestones.
