# Private Mail Console

Status: Milestone 1 of the console (foundation): authentication, users,
roles, invitations, the five-user limit, the OWNER bootstrap, and sender
identity approval. Nothing sends email yet.

Approved sender identity does not mean Gmail authorization.

Gmail OAuth + Gmail API are implemented in M2, not M1.

## Purpose

`/admin` is a private, invitation-only console inside the portfolio
application. It will let a small group (at most five people) send email
from addresses the OWNER has approved. Milestone 1 builds who may sign in,
who may do what, and which addresses each person may later send as.

It is not public:

- No link to it exists in the header, footer, navigation, sitemap, or any
  public page; `tests/app/admin/discoverability.test.ts` fails if one appears.
- Every console page has `robots: noindex, nofollow`, and `next.config.ts`
  adds `X-Robots-Tag: noindex, nofollow` to every `/admin` response.
- There is no sign-up. Accounts come only from the bootstrap (the OWNER) or
  an OWNER's invitation (USERs).

The root layout still renders the site header and footer around the
console, so it looks like part of the site; this keeps the public shell
untouched.

## Roles

| Capability                                     | OWNER | USER |
| ---------------------------------------------- | ----- | ---- |
| Sign in, see own profile, sign out             | Yes   | Yes  |
| Request a sender identity, see own requests    | Yes   | Yes  |
| See all users, invitations, and seat usage     | Yes   | No   |
| Invite and revoke invitations                  | Yes   | No   |
| Disable and re-enable USERs                    | Yes   | No   |
| Approve, reject, and disable sender identities | Yes   | No   |
| See another user's private data                | No    | No   |

There is exactly one OWNER. Invitations always create a USER; no request
can choose a role, and no path promotes a USER. The OWNER cannot disable
itself, and USER-status changes never apply to the OWNER.

## Routes

| Route                   | Who                              | Purpose                                               |
| ----------------------- | -------------------------------- | ----------------------------------------------------- |
| `/admin`                | Signed in                        | Profile, sender identities, OWNER overview            |
| `/admin/login`          | Anyone                           | Sign in (redirects to `/admin` if signed in)          |
| `/admin/setup`          | Anyone, only while bootstrapping | Create the OWNER; 404 otherwise (signed in: `/admin`) |
| `/admin/invite/[token]` | Holder of an open invitation     | Choose a name and password                            |
| `/admin/users`          | OWNER                            | Seats, users, invitations, invite form                |
| `/admin/senders`        | Signed in                        | Request and track own sender identities               |
| `/admin/approvals`      | OWNER                            | Review sender identity requests                       |

A signed-out visitor to a protected page is redirected to `/admin/login`; a
USER on an OWNER page is redirected to `/admin`. Every page renders per
request (they read the session cookie), so none is prerendered or cached at
the edge.

## Code layout

```
app/admin/           Routing files only (layout sets noindex)
components/admin/    Console UI; the five forms are the only Client Components
lib/admin/
  model.ts           Types, limits, seat counting, public projections
  validation.ts      Form parsing and validation (server side)
  password.ts        Argon2id hashing and verification
  tokens.ts          Random tokens, SHA-256 hashing, constant-time compare
  store.ts           AdminStore interface: the persistence contract
  dynamoStore.ts     DynamoDB implementation (production)
  memoryStore.ts     In-process implementation (tests, local development)
  getAdminStore.ts   Chooses the store from the environment
  auth.ts            Login, sessions, throttling, OWNER bootstrap
  invitations.ts     Capacity, invite, revoke, accept
  users.ts           User administration
  senderIdentities.ts  Requests, reviews, and the isApprovedSender guard
  session.ts         Cookies and requireUser / requireOwner (request scope)
  actions.ts         Server Actions: thin wrappers over the modules above
```

The domain modules take the store, the actor, the input, and the time as
arguments, so tests run them directly against the memory store. Server
Actions only parse the form, resolve the actor from the session, call one
domain function, and translate the result into a message or redirect.

## Authorization

- The actor is always the user resolved from the session cookie on the
  server. No action accepts a user ID, role, or owner flag from the client.
- Every page calls `requireUser()` or `requireOwner()`, and every Server
  Action checks again; hiding a button is never the control.
- The session is re-read on every request, so disabling a user or changing
  data takes effect on their next request.
- **User isolation.** A USER can read only their own profile and sender
  identities. Listing users, invitations, or other people's identities is
  OWNER-only in the domain modules (they return `null` or `forbidden` for
  anyone else), not only in the pages. Future mail data must keep this
  invariant: every query is scoped to the actor unless the actor is the
  OWNER and the operation is administrative.

## Passwords

- Argon2id through `@node-rs/argon2` (prebuilt native binaries, no build
  step), with memory 19 MiB, 2 iterations, parallelism 1, the OWASP
  minimum recommendation. The parameters are stored in each hash, so they
  can be raised later without invalidating existing passwords.
- 12–128 characters, confirmed on entry. No composition rules.
- Plaintext passwords exist only while a request is handled. They are never
  stored, logged, returned to the browser, or echoed back into a form after
  an error. Password hashes never leave the server: pages receive a
  `PublicUser` projection without them.

## Sessions

- A session is an opaque random 32-byte token (base64url) in the
  `admin_session` cookie. Only its SHA-256 hash is stored, so a copy of the
  table cannot be replayed as a cookie.
- Cookie: `HttpOnly`, `Secure` in production, `SameSite=Lax`,
  `Path=/admin`, expiring with the session.
- Lifetime: 7 days, absolute (not extended by activity). Expired sessions
  are rejected on read and removed by the table's TTL.
- Signing out deletes the stored session and clears the cookie.
- Disabling a user records `sessionsValidAfter`; any session created before
  it is refused, so re-enabling an account never revives old sessions.
- Server Actions are protected against cross-site requests by Next.js's
  Origin check plus `SameSite=Lax`. Behind CloudFront the origin request
  carries the function URL as `Host`, so `next.config.ts` adds the
  `SITE_URL` host to `experimental.serverActions.allowedOrigins`.

## Login and throttling

- Wrong password, unknown email, and disabled account all give the same
  "Invalid email or password." after the same hashing work (an unknown
  email is verified against a dummy hash), so responses do not reveal which
  accounts exist.
- Five failed attempts per email within 15 minutes block further attempts
  for that email until the window passes. Counts are stored in the table, so
  they hold across Lambda instances. A successful login clears them.

## Datastore

One DynamoDB table, `<stack>-admin` (on-demand, point-in-time recovery,
deletion protection, retained if the stack is deleted). Single-table
layout, keyed by `pk` and `sk`:

| `pk`           | `sk`       | Item                                        |
| -------------- | ---------- | ------------------------------------------- |
| `USER`         | user ID    | User (including the password hash)          |
| `USER_EMAIL`   | email      | Unique-email lock                           |
| `META`         | `OWNER`    | The single-OWNER lock                       |
| `META`         | `SEATS`    | Version counter for the five-seat limit     |
| `INVITATION`   | ID         | Invitation (token hash only)                |
| `SESSION`      | token hash | Session; `expiresAtEpoch` TTL               |
| `ATTEMPT`      | key        | Failed-attempt window; `expiresAtEpoch` TTL |
| `SENDER`       | ID         | Sender identity                             |
| `SENDER_EMAIL` | email      | One active claimant per sender address      |

Each collection is one partition, which is ample for five users and keeps
listing a `Query` (no `Scan`). Reads that decide authorization are strongly
consistent. Uniqueness (one OWNER, one account per email, one active
claimant per sender address) is enforced with conditional writes and
transactions, not by reading first. Emails are trimmed and lowercased
everywhere. The decision is recorded in
[ADR 0003](../adr/0003-mail-console-dynamodb-sessions.md).

Without `ADMIN_TABLE_NAME`, local development and tests use an in-memory
store that implements the same contract (data is lost on restart, and the
server logs a warning). In production a missing table name fails closed:
the console errors instead of falling back to memory.

## OWNER bootstrap

The OWNER is created once, through `/admin/setup`, which exists only while
**both** are true:

1. `ADMIN_BOOTSTRAP_TOKEN` is set to at least 32 characters, and
2. no OWNER exists.

Otherwise the route returns 404. The form asks for the token, a name, an
email, and a password. The token is compared in constant time; five wrong
tokens within 15 minutes lock the form for the rest of the window. Creating
the OWNER writes the `META/OWNER` lock conditionally, so two simultaneous
setups cannot both succeed. Nothing in the code or templates holds a
credential.

Procedure (production):

1. Generate a token locally, for example
   `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`.
2. Add it as the GitHub `production` environment secret
   `ADMIN_BOOTSTRAP_TOKEN` and deploy. The deploy passes it to the Lambda
   environment through a `NoEcho` parameter.
3. Open `https://kshitijpal.in/admin/setup`, enter the token and the OWNER's
   name, email, and password. You are signed in as the OWNER.
4. Delete the GitHub secret and deploy again, so the token no longer exists
   anywhere. `/admin/setup` already returns 404 once the OWNER exists; this
   removes the dormant credential as well.

Locally: set `ADMIN_BOOTSTRAP_TOKEN` in the shell (or a git-ignored
`.env.local`), run `npm run dev`, and open `/admin/setup`. With the memory
store, every restart starts empty.

Recovering a lost OWNER password is not built. It means editing the table
by hand (see "Known limitations").

## Invitations

```
OWNER invites email → capacity check → PENDING invitation (token hash only)
  → OWNER copies the link (shown once) → invitee opens /admin/invite/<token>
  → sets name and password → USER created, invitation ACCEPTED, signed in
```

- The token is 32 random bytes; only its SHA-256 hash is stored. The link is
  shown to the OWNER once, right after creating it, and cannot be retrieved
  later; a lost link is revoked and re-issued.
- Invitations expire after 72 hours. `EXPIRED` is derived from `expiresAt`
  when read, so no job is needed.
- Statuses: `PENDING`, `ACCEPTED`, `REVOKED`, `EXPIRED`. Only a pending,
  unexpired invitation can be accepted, and acceptance is a single
  conditional transaction, so a link works exactly once.
- The account's email is the invited address; the invitee cannot change
  it. An email that already has an account or a pending invitation cannot
  be invited again.
- The OWNER can revoke a pending invitation, which frees its seat at once.
- The invitation page sets the `no-referrer` referrer policy (a
  `<meta name="referrer">` tag), so the token in its URL is never sent to
  another site.

**Delivery is manual in M1.** The console does not email invitations; the
OWNER sends the link through a channel of their choice. The existing Resend
integration belongs to the public contact form and is not reused.

## Five-user limit

Seats in use = every user account (OWNER included; disabled accounts keep
their seat because they can be re-enabled) + every pending, unexpired
invitation. The maximum is 5 (`maxUsers` in `lib/admin/model.ts`).

The check runs on the server inside the write: creating an invitation is a
transaction that also bumps a version on `META/SEATS`, conditional on the
version read alongside the count. If anything changed the seats in the
meantime, the transaction fails and is retried (up to three times) with a
fresh count, so concurrent invitations can never exceed the limit. Accepting
an invitation converts its seat into a user, so it cannot exceed the limit
either.

`/admin/users` shows "Current users: X / 5" and the pending count; at the
limit, it explains that a pending invitation must be revoked before
inviting again and hides the form.

## Sender identities

A sender identity is a request by a user to send as an address. In M1 every
identity has provider `GMAIL`.

| Decision | From        | To                                                 |
| -------- | ----------- | -------------------------------------------------- |
| Request  | (none)      | `REQUESTED`                                        |
| Approve  | `REQUESTED` | `APPROVED`                                         |
| Reject   | `REQUESTED` | `REJECTED` (optional reason, up to 500 characters) |
| Disable  | `APPROVED`  | `DISABLED`                                         |

- Any signed-in user may request one for any address; it always belongs to
  the requester. Only the OWNER reviews, from `/admin/approvals`, which
  shows the requester for each.
- An address can be `REQUESTED` or `APPROVED` for only one identity at a
  time. Rejecting or disabling releases it, so it can be requested again.
- Transitions are conditional writes on the current status, so two OWNER
  tabs cannot apply conflicting decisions.
- `isApprovedSender(store, userId, email)` is the check future sending must
  pass.

Approved sender identity does not mean Gmail authorization. Approval is the
OWNER's internal permission only. M2 must additionally obtain Google OAuth
consent for the same Google account before anything is sent, and must
refuse to send unless both hold.

## M2 boundary

Gmail OAuth + Gmail API are implemented in M2, not M1. Not built, and not
stubbed: Google OAuth, Gmail tokens or their storage, sending, contacts,
templates, compose, scheduling, provider credentials, and public sign-up.

## Logging

Server Actions log only `[admin] <operation> failed (<error name>).` on an
unexpected error. Passwords, password hashes, session tokens, invitation
tokens, the bootstrap token, and email addresses are never logged.

## Known limitations

- **No account deletion.** A disabled USER keeps their seat. Freeing it
  needs the item removed from the table by hand.
- **No password reset or change**, including for the OWNER. Recovery is a
  manual table edit by someone with AWS access.
- **No invitation email.** Links are delivered by the OWNER.
- **No multi-factor authentication.**
- **Throttling is per email**, not per IP: an attacker can lock an account's
  sign-in for 15 minutes, but cannot guess faster than five passwords per
  window.
- **Direct function URL access.** The Lambda function URL also serves
  `/admin` (see ADR 0002). Session cookies are scoped to `kshitijpal.in`, so
  they are never sent there, and the same authentication applies.
- **Local data is ephemeral** with the memory store.
