# Private Mail Console

Status: Milestone 5 of the console, its final application milestone.
Milestone 1 (foundation) built
authentication, users, roles, invitations, the five-user limit, the OWNER
bootstrap, and sender identity approval. Milestone 2 added Gmail account
connection through Google OAuth (see "Gmail connection"). Milestone 3 added
contacts, templates, and explicit individual and bulk sending through the
connected Gmail accounts (see "Contacts and templates" and "Sending").
Milestone 4 adds one-time and recurring scheduled sends, triggered by
EventBridge Scheduler and sent through the same M3 sending path (see
"Scheduled sending"). Milestone 5 completes the console: a dashboard, a
settings page with scheduling switches, searchable sending history, manual
retry of failed sends through the M3 path, an audit log, per-user rate
limits, and a security and production-configuration review (see
"Milestone 5").

Approved sender identity does not mean Gmail authorization, and Gmail
authorization does not mean approval. Sending needs both.

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
| Connect, check, disconnect own Gmail accounts  | Yes   | Yes  |
| Manage own contacts and templates              | Yes   | Yes  |
| Send from own approved, connected addresses    | Yes   | Yes  |
| Schedule, view, and cancel own scheduled sends | Yes   | Yes  |
| Search own history, retry own failed sends     | Yes   | Yes  |
| See own settings and own audit trail           | Yes   | Yes  |
| See all users, invitations, and seat usage     | Yes   | No   |
| See every account's counters and audit trail   | Yes   | No   |
| Set each user's feature switches and limits    | Yes   | No   |
| Invite and revoke invitations                  | Yes   | No   |
| Disable and re-enable USERs                    | Yes   | No   |
| Approve, reject, and disable sender identities | Yes   | No   |
| See another user's private data                | No    | No   |

There is exactly one OWNER. Invitations always create a USER; no request
can choose a role, and no path promotes a USER. The OWNER cannot disable
itself, and USER-status changes never apply to the OWNER.

## Routes

| Route                   | Who                               | Purpose                                               |
| ----------------------- | --------------------------------- | ----------------------------------------------------- |
| `/admin`                | Signed in                         | Dashboard: usage, attention, Gmail, OWNER overview    |
| `/admin/login`          | Anyone                            | Sign in (redirects to `/admin` if signed in)          |
| `/admin/setup`          | Anyone, only while bootstrapping  | Create the OWNER; 404 otherwise (signed in: `/admin`) |
| `/admin/invite/[token]` | Holder of an open invitation      | Choose a name and password                            |
| `/admin/users`          | OWNER                             | Seats, users, invitations, invite form                |
| `/admin/senders`        | Signed in                         | Request and track own sender identities               |
| `/admin/approvals`      | OWNER                             | Review sender identity requests                       |
| `/admin/compose`        | Signed in                         | Compose, preview, send; today's limits; recent sends  |
| `/admin/schedules`      | Signed in                         | Schedule a send; own schedules; cancel; limits        |
| `/admin/contacts`       | Signed in                         | Own contacts: add, edit, delete, search (`?q=`)       |
| `/admin/templates`      | Signed in                         | Own templates: add, edit, delete                      |
| `/admin/history`        | Signed in                         | Own sends: search, filter, page                       |
| `/admin/history/[id]`   | Signed in (own operation only)    | One operation's recipients; retry failed ones         |
| `/admin/settings`       | Signed in (forms: OWNER)          | Own settings; OWNER configures every account          |
| `/admin/audit`          | Signed in (others' trails: OWNER) | Audit trail                                           |

`/admin/oauth/google/callback` is a Route Handler, not a page: Google
redirects the browser there after consent (see "Gmail connection").

A signed-out visitor to a protected page is redirected to `/admin/login`; a
USER on an OWNER page is redirected to `/admin`. Every page renders per
request (they read the session cookie), so none is prerendered or cached at
the edge.

## Code layout

```
app/admin/           Routing files only (layout sets noindex)
  oauth/google/callback/route.ts   Google's OAuth redirect target
components/admin/    Console UI; the forms and GmailConnectButton are the
                     only Client Components
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
  googleOAuth.ts     Google OAuth client: consent URL, token endpoint, revoke
  tokenCipher.ts     KMS envelope encryption of stored refresh tokens
  gmailConnections.ts  Connect, callback, refresh, check, disconnect, and
                     the getGmailAccessToken sending gate
  settings.ts        Per-user feature switches and sending limits
  contacts.ts        Own contacts: list, search, create, update, delete
  templates.ts       Own templates: list, create, update, delete
  personalization.ts Placeholder parsing and substitution (also used by the
                     compose preview in the browser)
  mimeMessage.ts     RFC 2822 / MIME message building, base64url encoding
  gmailApi.ts        Gmail users.messages.send client and error classes
  sending.ts         The send flow: checks, reservation, Gmail calls, results
  recurrence.ts      IANA time zones, local/UTC conversion, recurrence rules
  schedules.ts       Own schedules: create, list, cancel, display status
  scheduler.ts       EventBridge Scheduler triggers: create and delete
  scheduleExecution.ts  One scheduled occurrence: validate, claim, send
  scheduleHandler.ts The scheduler Lambda's entry point (bundled separately)
  dashboard.ts       Own dashboard summary; OWNER account counters
  history.ts         Own history: query parsing, filtered paging, detail
  retry.ts           Manual retry of failed sends through sendEmail
  audit.ts           Audit events: sanitizing, writing, authorized reading
  rateLimit.ts       Per-user action limits, counted in the table
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
  anyone else), not only in the pages. Mail data keeps this invariant:
  contacts, templates, send records, and daily counters live in partitions
  keyed by the owning user's ID, and every read or write builds that key
  from the session's user. The OWNER has no view of other users' contacts,
  templates, or sends either; administration is limited to settings.

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

| `pk`           | `sk`        | Item                                          |
| -------------- | ----------- | --------------------------------------------- |
| `USER`         | user ID     | User (including the password hash)            |
| `USER_EMAIL`   | email       | Unique-email lock                             |
| `META`         | `OWNER`     | The single-OWNER lock                         |
| `META`         | `SEATS`     | Version counter for the five-seat limit       |
| `INVITATION`   | ID          | Invitation (token hash only)                  |
| `SESSION`      | token hash  | Session; `expiresAtEpoch` TTL                 |
| `ATTEMPT`      | key         | Failed-attempt window; `expiresAtEpoch` TTL   |
| `SENDER`       | ID          | Sender identity                               |
| `SENDER_EMAIL` | email       | One active claimant per sender address        |
| `OAUTH_STATE`  | state hash  | Pending Google consent; `expiresAtEpoch` TTL  |
| `GMAIL`        | identity ID | Gmail connection (encrypted credential)       |
| `SETTINGS`     | user ID     | Feature switches and limits (absent: default) |

Milestone 3 adds per-user partitions:

| `pk`                     | `sk`           | Item                                 |
| ------------------------ | -------------- | ------------------------------------ |
| `CONTACT#<userId>`       | contact ID     | Contact                              |
| `CONTACT_EMAIL#<userId>` | email          | Unique-email lock for that user      |
| `TEMPLATE#<userId>`      | template ID    | Template                             |
| `QUOTA#<userId>`         | UTC day        | `total`, `bulk` counters; TTL 8 days |
| `SEND#<userId>`          | operation:hash | Send record; TTL 90 days             |

Milestone 4 adds:

| `pk`                    | `sk`                  | Item                                           |
| ----------------------- | --------------------- | ---------------------------------------------- |
| `SCHEDULE#<userId>`     | schedule ID           | Schedule; TTL 90 days once it ends             |
| `SCHEDULE_ID`           | schedule ID           | Owner pointer for the execution function       |
| `SCHEDULE_COUNT`        | user ID               | `active`, `recurring` counters                 |
| `SCHEDULE_RUN#<userId>` | scheduleId#local time | One occurrence's claim and result; TTL 90 days |

Milestone 5 adds:

| `pk`                        | `sk`                 | Item                                        |
| --------------------------- | -------------------- | ------------------------------------------- |
| `AUDIT#<userId>` / `system` | ISO time#random      | Audit event (metadata only); TTL 1 year     |
| `RATE`                      | action:userId#window | Rate-limit counter; TTL at the window's end |

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
OWNER's internal permission only; see "Approval and authorization".

## Gmail connection

A user connects the Gmail account behind one of their own APPROVED sender
identities by granting the console Google's `gmail.send` permission. The
console keeps an encrypted refresh token for it. Nothing is sent in M2;
the connection exists so a later milestone can send.

### Approval and authorization

|            | Sender identity approval         | Gmail authorization                      |
| ---------- | -------------------------------- | ---------------------------------------- |
| Decided by | The OWNER, in `/admin/approvals` | The address's owner, on Google's consent |
| Proves     | The console allows this address  | Google lets the console send as it       |
| Stored as  | `SENDER` item, status `APPROVED` | `GMAIL` item, status `CONNECTED`         |
| Revoked by | OWNER disables the identity      | Disconnect, or revocation at Google      |

Neither implies the other:

- Connecting requires an identity that belongs to the signed-in user and is
  APPROVED (`isApprovedSender`), checked both when the flow starts and
  again in the callback. A USER cannot connect a REQUESTED, REJECTED, or
  DISABLED identity, or anyone else's.
- Approving an identity creates no connection. The OWNER is a user like any
  other here: their own identities need their own Google consent.
- `getGmailAccessToken(deps, actor, email, now)` in
  `lib/admin/gmailConnections.ts` is the gate future sending must call. It
  returns an access token only when the address is APPROVED for the actor
  **and** its connection is CONNECTED and Google still accepts it.
  Disabling an identity therefore stops its use immediately, even though the
  connection record stays.
- The dashboard shows both statuses separately for each address, and says
  whether the address is usable.

### Scopes

`openid email https://www.googleapis.com/auth/gmail.send`, and nothing
else. `gmail.send` is the only Gmail permission; the console never reads,
lists, or modifies mail. `openid email` are requested for one concrete
reason: the console must confirm that the Google account authorized is the
approved address, and `gmail.send` alone cannot read the account's own
address (Gmail's `users.getProfile` needs a read or compose scope). With
`openid email`, the token response includes an ID token carrying the
account's verified address and stable ID (`sub`). `profile` is not
requested, and neither is `include_granted_scopes`, so no earlier grant is
merged in.

### Flow

```
Dashboard: "Connect Gmail" (Server Action, form carries only identityId)
  → own APPROVED identity? → store OAUTH_STATE (hashed state, user, session
    hash, identity, PKCE verifier, nonce; 10-minute expiry)
  → 303 to accounts.google.com (state, S256 code challenge, nonce,
    login_hint, access_type=offline, prompt=consent)
Google consent → 302 to /admin/oauth/google/callback?state&code
  → consume state → check expiry, session, user → identity still own and
    APPROVED → exchange code (client secret + PKCE verifier, server side)
  → verify ID token (Google's signature and claims)
  → verified address == identity address?
    → gmail.send granted? → refresh token present?
  → encrypt refresh token (KMS) → store GMAIL item, CONNECTED
  → 303 to /admin?gmail=connected
```

The callback is `/admin/oauth/google/callback`. In production its full URI
is `https://kshitijpal.in/admin/oauth/google/callback`, built by the
template from `SITE_URL` (see "Configuration"). Every callback response is
a `303` with a relative `Location` (`/admin?gmail=<result>`, or
`/admin/login` when signed out), `Cache-Control: private, no-store`, and
`Referrer-Policy: no-referrer`. The result code maps to a fixed message on
the dashboard; unknown codes show nothing, and nothing from the query is
echoed.

Connecting an address again (Reconnect) runs the same flow and replaces
the stored credential, keeping the connection's ID and creation date.

### State protection

- `state`, the PKCE verifier, and the nonce are each 32 random bytes
  (base64url). Only the state's SHA-256 hash is stored, so the table cannot
  be replayed into a callback.
- The state is bound to the user and to the SHA-256 of their session token.
  The callback refuses it unless the request's session is the same one,
  so a link started in one session, or by another user, does nothing. The
  callback's query carries no user or identity ID; both come from the stored
  state, and the identity is re-checked against the session's user.
- It expires after 10 minutes (`oauthStateTtlMs`), and the table's TTL
  removes leftovers.
- It is single use: the callback deletes it atomically (`DeleteItem` with
  `ReturnValues: ALL_OLD`) before any other check, so it is gone after
  success, failure, denial, or expiry alike, and two concurrent callbacks
  cannot both use it.
- PKCE (S256) means an intercepted code is useless without the verifier,
  which never leaves the server. The nonce ties the ID token to this
  attempt.

### Identity check

The ID token is verified cryptographically, not trusted for having arrived
over TLS. `verifyGoogleIdToken` in `lib/admin/googleOAuth.ts` uses
[`jose`](https://github.com/panva/jose) and requires:

- an **RS256 signature** by a key in Google's published key set
  (`https://www.googleapis.com/oauth2/v3/certs`), selected by the token's
  `kid`. Other algorithms, including `none` and HMAC, are refused. The key
  set is fetched on first use, cached per Lambda instance (10 minutes), and
  refetched when an unknown `kid` appears, so Google's key rotation needs
  nothing from us. If the keys cannot be loaded, the token is refused;
- `iss` = `https://accounts.google.com` or `accounts.google.com`;
- `aud` = the OAuth client ID, and `azp` = the client ID when present (and
  required when there are several audiences);
- `exp` in the future and `iat` in the past, no older than 5 minutes (the
  token is minted by the code exchange in the same request), each with 60
  seconds of clock tolerance;
- `nonce` = the one stored with this attempt's state;
- `sub` present, `email` a well-formed address, and `email_verified` true.

Any failure gives the `failed` result and stores nothing; the reason is not
shown or logged. The verified email, normalized, must then equal the
identity's address. If it differs, the result is `email-mismatch` with a clear
message, nothing is stored, and the tokens are dropped. They are not
revoked: revoking a token ends the user's whole grant to the app, including
a valid connection the same Google account may hold for another identity.

### Encryption and storage

Refresh tokens are envelope encrypted (`lib/admin/tokenCipher.ts`):

1. KMS `GenerateDataKey` (AES-256) on the `GmailTokenKey` customer managed
   key returns a plaintext data key and its encrypted copy.
2. The token is encrypted with AES-256-GCM under the data key (random
   96-bit IV); the plaintext data key is zeroed straight after.
3. The item stores the encrypted data key, IV, ciphertext, and
   authentication tag (`credentials`, `scheme: "kms"`).

The encryption context `{purpose: "gmail-oauth-refresh-token", userId,
senderIdentityId}` is bound in KMS and used as the GCM additional data, so
a credential copied to another user's or identity's item cannot be
decrypted. The key policy only lets the function use the key with that
`purpose`. Decrypting calls KMS `Decrypt` with the same context. The
decision is recorded in
[ADR 0004](../adr/0004-gmail-oauth-kms-envelope-encryption.md).

Access tokens are never stored: each is fetched on demand, used, and
discarded. The client secret and every token stay on the server. Pages
receive `PublicGmailConnection`, a projection without `credentials`;
Server Actions return only result codes; nothing goes into cookies, URLs,
browser storage, or client state.

Without `GMAIL_TOKEN_KMS_KEY_ID`, local development uses an in-process
AES-256-GCM key (scheme `local`, with a warning), lost on restart like the
memory store. In production a missing key ID fails closed: connecting is
reported as not configured.

### Lifecycle

| Status            | Meaning                           | Credential | Usable for sending       |
| ----------------- | --------------------------------- | ---------- | ------------------------ |
| (no item)         | Never connected ("Not connected") | none       | No                       |
| `CONNECTED`       | Google authorized this address    | encrypted  | Only while also APPROVED |
| `REAUTH_REQUIRED` | Google refused the stored token   | deleted    | No; Reconnect            |
| `DISCONNECTED`    | The user disconnected             | deleted    | No; Connect again        |

"Connecting…" is only the button's pending state while the browser goes to
Google; nothing is stored as connecting except the short-lived state.

**Refresh, on demand only.** There is no background job, poller, or timer.
A refresh happens when something needs an access token
(`getGmailAccessToken`) or the user presses "Check connection". The
outcome:

- Success: `lastValidatedAt` is updated; a rotated refresh token is
  re-encrypted and stored.
- `invalid_grant` (revoked, expired, or the password changed), a response
  without `gmail.send`, or a credential that cannot be decrypted: status
  becomes `REAUTH_REQUIRED` and the credential is deleted. With nothing left
  to try, there is no retry; only Reconnect restores it.
- Google unreachable or failing (network error, timeout after 8 seconds,
  5xx): nothing changes, and the user is told to try later.

**Disconnect** revokes the refresh token at Google
(`oauth2.googleapis.com/revoke`), then deletes the credential and marks the
connection `DISCONNECTED`. The local deletion always happens: if Google
cannot be reached or confirm, the message says so and points to the
Google Account's security settings. Revoking ends the app's grant for that
Google account as a whole. A `REAUTH_REQUIRED` connection can also be
disconnected.

### Configuration

| Name                        | Kind                | Source in production                                    |
| --------------------------- | ------------------- | ------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`          | Runtime             | GitHub environment variable → template parameter        |
| `GOOGLE_CLIENT_SECRET`      | Runtime, **secret** | GitHub environment secret → `NoEcho` template parameter |
| `GOOGLE_OAUTH_REDIRECT_URI` | Runtime             | Template: `${SiteUrl}/admin/oauth/google/callback`      |
| `GMAIL_TOKEN_KMS_KEY_ID`    | Runtime             | Template: the `GmailTokenKey` ARN                       |

The redirect URI must be `https` (or `http` on `localhost`), with exactly
the callback path; anything else turns the feature off. It cannot be derived
from the request, because behind CloudFront the request's `Host` is the
function URL. Until the client ID, secret, and redirect URI are all set,
the dashboard reports "Gmail connection is not configured on this server",
and the rest of the console works as before. Locally, set them in a
git-ignored `.env.local` with the redirect URI
`http://localhost:3000/admin/oauth/google/callback`.

### Google Cloud Console (manual)

The repository cannot configure Google. In the Google Cloud project that
owns the OAuth client:

1. **APIs & Services → Library**: enable the **Gmail API**.
2. **Google Auth Platform → Branding** (the OAuth consent screen): set the
   app name, support email, and developer contact.
3. **Audience**: user type **External**. While the publishing status is
   **Testing**, add each console member's Google account as a **test
   user** (at most five people use the console).
4. **Data Access**: add the scopes `openid`,
   `.../auth/userinfo.email`, and `.../auth/gmail.send`. Add nothing
   else.
5. **Clients → Create client**: type **Web application**. Authorized
   redirect URIs:
   - `https://kshitijpal.in/admin/oauth/google/callback` (production)
   - `http://localhost:3000/admin/oauth/google/callback` (local
     development, optional; a separate client works too)

   No JavaScript origins are needed: the browser never calls Google's APIs.

6. Copy the client ID into the GitHub `production` environment variable
   `GOOGLE_CLIENT_ID` and the client secret into the environment secret
   `GOOGLE_CLIENT_SECRET`. Never commit either.

`gmail.send` is a sensitive scope. In Testing status Google shows an
"unverified app" screen to test users and **expires refresh tokens after 7
days**, so connections then need Reconnect weekly. Publishing the app
("In production") removes the expiry, but Google requires verification for
sensitive scopes before an app can be used by other people; see Google's
OAuth app verification documentation for whether this app needs it.

## User settings

Each user has one `SETTINGS` item, written only by the OWNER from
`/admin/settings`. A user without one gets the defaults; an item saved
before a switch existed reads that switch as its default (on)
(`defaultUserSettings` in `lib/admin/settings.ts`):

| Setting                         | Default | Range | Meaning                                      |
| ------------------------------- | ------- | ----- | -------------------------------------------- |
| `sendingEnabled`                | on      |       | May send at all                              |
| `bulkSendingEnabled`            | on      |       | May send to more than one recipient at once  |
| `templatesEnabled`              | on      |       | May use templates                            |
| `contactsEnabled`               | on      |       | May use contacts                             |
| `schedulingEnabled`             | on      |       | May create schedules; occurrences may send   |
| `recurringEnabled`              | on      |       | Same, for recurring schedules                |
| `dailyTotalEmails`              | 50      | 0–500 | Emails per UTC day, individual and bulk      |
| `dailyBulkRecipients`           | 25      | 0–500 | Recipients of bulk sends per UTC day         |
| `maxBulkRecipientsPerOperation` | 10      | 1–20  | Recipients in one bulk send                  |
| `maxScheduledEmails`            | 20      | 0–100 | ACTIVE schedules, one-time and recurring     |
| `maxRecurringSchedules`         | 5       | 0–20  | ACTIVE recurring schedules (within the 20)   |
| `maxFutureSchedulingWindowDays` | 30      | 1–365 | How far ahead a schedule's first send may be |

**These are the console's own safety limits, not Google's Gmail quotas.**
Google applies its own per-account sending limits independently; the
console neither knows nor mirrors them. If Gmail refuses a message for its
own rate or quota reasons, the recipient is marked "Not sent: Gmail's own
sending rate limit was reached" and the rest of the operation stops.

The per-send maximum of 20 is bounded by the request: every recipient is
sent within one Lambda invocation, which times out after 15 seconds (see
"Bulk sending"). Changing a setting applies to the user's next request.
Settings are read on the server for every send; the browser only displays
them.

## Contacts and templates

Both are private to the user who created them and live in partitions keyed
by that user's ID (`CONTACT#<userId>`, `TEMPLATE#<userId>`). The domain
modules (`contacts.ts`, `templates.ts`) take the actor from the session and
always build keys from `actor.id`, so another user's contact or template
is simply "not found", for reads, edits, deletes, and sends alike. Nothing
is shared, and the OWNER cannot see them either.

**Contacts** have a name (required), an email (required), and an optional
company and notes. The email is trimmed and lowercased and must be a plain
ASCII address (no display names, spaces, or line breaks). It is unique per
user through a `CONTACT_EMAIL#<userId>` lock written in the same
transaction as the contact; changing a contact's email moves the lock in
one transaction. Two users may each have a contact with the same email.
Search (`/admin/contacts?q=`) matches name, email, or company. There is a
storage bound of 1000 contacts per user.

**Templates** have a name, a subject, and a plain-text body, with a bound
of 100 per user. Choosing a template in compose copies its subject and
body into the form, where they can still be edited; the send records which
template was used.

When the OWNER turns contacts or templates off for a user, the pages say
so, every action refuses, and sends that name a contact or template are
refused. Existing data is kept.

### Placeholders

`{{name}}`, `{{email}}`, and `{{company}}` (spaces inside the braces are
allowed). There are no expressions, defaults, filters, or nesting. The same
pure function (`lib/admin/personalization.ts`) runs in the compose preview
and on the server, which always re-checks:

- An unknown placeholder (for example `{{first_name}}`) or a stray `{{` or
  `}}` is rejected when a template is saved and when a message is sent.
- A placeholder with no value for a recipient (a contact without a company,
  or a typed address that is not a contact, which has only `{{email}}`)
  rejects the **whole send** before anything is reserved or sent, naming
  the recipient. Nothing goes out with a placeholder left in or silently
  removed.
- Values are inserted literally in one pass and never rescanned, so a
  contact named `{{email}}` stays that text.

## Sending

Sending from compose is explicit and synchronous: the user presses Send on
`/admin/compose`, and the Server Action sends within that request. There is
no queue, worker, cron, timer, or poller. A message is sent later only when
the user schedules it on `/admin/schedules`; that send goes through the
same flow below, run by the scheduler function (see "Scheduled sending").

### Message format

`lib/admin/mimeMessage.ts` builds one RFC 5322 / MIME message per
recipient, plain text only:

```
From: <approved identity address>
To: <one recipient>
Subject: <subject, RFC 2047 encoded unless plain printable ASCII>
Date: <now, UTC>
MIME-Version: 1.0
Content-Type: text/plain; charset="UTF-8"
Content-Transfer-Encoding: base64

<body, base64>
```

The whole message is base64url encoded into the `raw` field of Gmail's
`users.messages.send` (`gmail/v1/users/me/messages/send`), authenticated by
the access token from M2's `getGmailAccessToken`. Gmail sends it from the
account the token belongs to, and the message appears in that account's
Sent folder. There is no `Cc`, `Bcc`, `Reply-To`, display name, HTML,
attachment, tracking pixel, or unsubscribe header.

**Header injection.** No header value is built from unchecked input. Both
addresses must match a strict ASCII pattern with no spaces, commas, angle
brackets, quotes, or line breaks. The subject (after personalization) must
contain no control characters and is RFC 2047 encoded unless it is short
printable ASCII. The body is base64 encoded, so its content can never be
read as headers. A message that fails these checks refuses the whole send
before anything is reserved. The `From` address is the approved identity's
address read from the table; a `from` field in the form is ignored.

### Flow

```
Send (form: operationId, senderIdentityId, contactIds, typed addresses,
      templateId, subject, body; nothing else is read)
  → session user ACTIVE? sending enabled?
  → identity owned by the user and APPROVED? connection owned, matching,
    CONNECTED, credential present, gmail.send granted?
  → resolve own contacts and typed addresses; deduplicate by email
  → more than one recipient: bulk enabled? within the per-send maximum?
  → template (if any) owned and enabled?
  → personalize and build every message (any failure: refuse all)
  → reserve every send against today's counters (one transaction)
  → getGmailAccessToken (M2: approval + connection + refresh)
  → one Gmail call per recipient → record SENT / FAILED / UNCERTAIN
  → per-recipient results
```

Every check that can refuse the send runs before anything is reserved, so
a refused send consumes no quota and sends nothing. Ownership failures
(another user's identity, contact, or template) look the same as missing
records.

### Bulk sending

An operation with more than one unique recipient is a bulk send. Each
recipient gets their own message with only their address in `To`;
recipients never see each other. The recipient list is never truncated:
over the per-send maximum, or over a daily limit, the whole send is refused
with the numbers.

Messages are sent with at most 4 Gmail calls in flight. Recipients not
started within 10 seconds of the first call are released as "Not sent:
sending stopped before this recipient", which keeps the request inside the
Lambda's 15-second timeout. Gmail's own limits stop the rest of an
operation too:

| Gmail outcome                          | Recipient result | Rest of the operation |
| -------------------------------------- | ---------------- | --------------------- |
| Accepted (message ID)                  | `SENT`           | Continues             |
| Message refused (4xx)                  | `FAILED`         | Continues             |
| Rate or quota limit (429, quota error) | `FAILED`         | Not attempted         |
| Token refused (401, scope error)       | `FAILED`         | Not attempted         |
| Timeout, network error, 5xx            | `UNCERTAIN`      | Not attempted         |

A refused token triggers one M2 connection check
(`verifyGmailConnection`): if Google reports the grant gone, the connection
becomes `REAUTH_REQUIRED` exactly as in M2, and the user is asked to
Reconnect. No retry loop exists anywhere.

### Daily limits

Counters live in one item per user and UTC day (`QUOTA#<userId>`,
`sk` = `YYYY-MM-DD`), holding `total` and `bulk`. They reset at 00:00 UTC
because the next day is a new item; old items expire through the table's
TTL after 8 days.

A send reserves its quota **before** calling Gmail, in one DynamoDB
transaction with the send records:

- The counter update adds the number of recipients, conditional on
  `total <= dailyTotalEmails - n` (and for bulk sends also
  `bulk <= dailyBulkRecipients - n`), so the stored value can never exceed
  the limit, however many requests race. A request that would cross it is
  refused whole.
- Each send record is created `RESERVED` in the same transaction.
- On completion, `SENT` and `UNCERTAIN` keep their reservation. `FAILED`
  releases it: the record update and the counter decrement are one
  transaction, so the counter equals the number of sends that may have
  reached Gmail.

A send that dies mid-way (the Lambda times out or crashes) leaves records
`RESERVED`: still counted, shown as "outcome unknown", and never resent.
This errs towards under-sending.

### Idempotency

Each compose form carries an `operationId` generated by the server when the
page renders (a millisecond timestamp plus 16 random bytes; the server
checks its format). A send record's key is
`<operationId>:<first 32 hex characters of SHA-256(recipient)>`, so
repeating an operation addresses the same records:

| Existing record | On a repeat of the same operation                   |
| --------------- | --------------------------------------------------- |
| none            | Reserved and sent                                   |
| `SENT`          | Skipped: "Already sent; not sent again"             |
| `RESERVED`      | Skipped: "in progress or outcome unknown"           |
| `UNCERTAIN`     | Skipped: "Check the Sent folder in Gmail"           |
| `FAILED`        | Reserved again (only if still `FAILED`) and retried |

New records are written with "must not exist" and retried ones with
"must still be `FAILED`", inside the reservation transaction. Two
concurrent submissions of the same operation cannot both reserve a
recipient: the loser sees a conflict, re-reads the records, and skips them.
A double click, a retried request, or a resubmitted form therefore never
sends twice to the same recipient.

After a fully successful send, the server returns a fresh `operationId` and
the form clears. After a refused or partly failed send, the form keeps the
draft and the same `operationId`, so pressing Send again retries only the
recipients that were not sent. "Start a new message" reloads the page with
a new `operationId` for a deliberate fresh copy.

The decision is recorded in
[ADR 0005](../adr/0005-gmail-send-quota-and-idempotency.md).

**This is not exactly-once delivery.** The console guarantees it will not
call Gmail twice for the same operation and recipient. It cannot know
whether Gmail delivered a message whose request timed out; such sends are
`UNCERTAIN` and must be checked in Gmail's Sent folder. Gmail itself does
not offer an idempotency key.

### Send records and history

A send record holds the operation ID, the sender identity and connection
IDs, the sender address, the recipient, the personalized subject, the
template ID, whether it was bulk, the quota day, status, attempts, Gmail's
message ID, a failure code, and timestamps. **The body is never stored.**
Records expire after 90 days through the table's TTL. `/admin/compose`
lists the user's 20 most recent records (newest first; IDs begin with the
time-ordered operation ID), and only the user's own.

Results and history show fixed messages per status and failure code;
nothing from Google's responses is shown or stored.

## Scheduled sending

A user can schedule the same message compose would send, once
(`ONE_TIME`) or on a repeating timetable (`RECURRING`), from
`/admin/schedules`. Creating a schedule sends nothing. At each due time
EventBridge Scheduler invokes a short-lived Lambda function, which sends
that one occurrence through M3's `sendEmail` with the schedule's owner as
the actor. Nothing runs between occurrences: there is no worker, cron
process, poller, queue, or always-running service. The decision is
recorded in [ADR 0006](../adr/0006-eventbridge-scheduler-scheduled-sends.md).

```
/admin/schedules (Server Action; actor from the session)
  → validate the form, the times, and the window
  → the same checks a send would pass now (checkSendDraft)
  → DynamoDB transaction: schedule + owner pointer + counts within limits
  → EventBridge Scheduler: CreateSchedule (payload: schedule ID only)
… at each due time …
EventBridge Scheduler → (SchedulerInvokeRole) → scheduler Lambda
  → payload is exactly {scheduleId, scheduledTime}
  → schedule exists, ACTIVE, time is one of its occurrences, due now
  → claim the occurrence (transaction: run item absent + schedule ACTIVE)
  → sendEmail(owner, stored message, deterministic operation ID)
  → record the run; advance or end the schedule
```

### Schedule model

| Field                                                                       | Meaning                                                           |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `type`                                                                      | `ONE_TIME` or `RECURRING`                                         |
| `status`                                                                    | `ACTIVE`, `CANCELLED`, `COMPLETED`, or `FAILED`                   |
| `userId`, `createdBy`                                                       | The session's user; never from the form                           |
| `senderIdentityId`, `contactIds`, `emails`, `templateId`, `subject`, `body` | The message, as compose would submit it                           |
| `timeZone`, `startLocal`                                                    | IANA zone and the local start the user entered                    |
| `startAt`, `endAt`, `nextRunAt`                                             | UTC instants (ISO 8601)                                           |
| `recurrence`                                                                | `DAILY`, `WEEKLY` with weekdays, or `MONTHLY` with a day          |
| `lastRunAt`, `lastRunStatus`, `lastRunFailure`, `runCount`                  | The latest occurrence's outcome                                   |
| `triggerName`                                                               | The Scheduler schedule's name, `mail-<schedule ID>`               |
| `failureCode`                                                               | Why the schedule failed without running (`scheduler-unavailable`) |

`OVERDUE` is not stored: like an expired invitation, it is derived when
read for an `ACTIVE` schedule whose next send is more than an hour past
without having run (Scheduler did not invoke it). There is no `PAUSED`
state; pausing would need trigger updates and resumption rules for little
value at this scale. `COMPLETED` means the schedule ran out of
occurrences; `FAILED` means a one-time schedule's occurrence did not send,
or its trigger could not be created. A recurring schedule never becomes
`FAILED` because one occurrence failed; it continues with the next one.

When a schedule ends (cancelled, completed, or failed) its `body` is
cleared and it expires from the table after 90 days, like send records.
Subjects stay for the list. Message bodies are stored only while a
schedule is `ACTIVE`, because the function must send them later.

### Creation

- The owner is the signed-in user. The form carries no user ID; a
  `userId` or `createdBy` field is ignored.
- The message fields are exactly compose's (the form reuses its fields),
  and `checkSendDraft` applies every M3 check that does not depend on
  today's quota: user ACTIVE, sending enabled, own APPROVED sender with a
  usable Gmail connection, own contacts, bulk switch and per-send maximum,
  own template, placeholders resolvable for every recipient, and a
  buildable message. A schedule that could not send now is refused now.
- The sender identity must be the user's own; its address is stored for
  display only. The send always uses the identity's current address.
- Daily quotas are not reserved at creation. They are reserved when each
  occurrence sends, against that day's counters.

### Time zones and recurrence

The user enters a local date and time (`<input type="datetime-local">`)
and picks an IANA zone; the browser's zone is preselected. The server
validates the zone (`Area/Location` names known to the runtime, or `UTC`;
abbreviations such as `IST` or `EST` are refused) and converts with the
runtime's time zone database (`Intl`), never the server's own zone. Every
stored instant is UTC.

Recurrence is a small structured model, never cron text from the user:

| Frequency | Choice                      | Scheduler expression (in the zone) |
| --------- | --------------------------- | ---------------------------------- |
| `DAILY`   | (none)                      | `cron(m h * * ? *)`                |
| `WEEKLY`  | one or more weekdays        | `cron(m h ? * MON,WED *)`          |
| `MONTHLY` | a day of the month, 1 to 28 | `cron(m h D * ? *)`                |

The time of day is the start's local time. Days 29 to 31 are not offered,
so every month has the day. An optional end stops a recurring schedule;
without one it repeats until cancelled.

Daylight saving time follows EventBridge Scheduler's rules, and the
application computes the same occurrences: a local time that does not
exist that day (spring forward) has no occurrence, and a local time that
happens twice (fall back) is one occurrence. A one-time start that does
not exist in its zone is refused. Occurrences are keyed by their local
date and time, so both instants of a repeated time map to one claim.

### Limits

From the OWNER's settings for the user, enforced on the server:

- `maxScheduledEmails` (default 20): ACTIVE schedules of both types.
- `maxRecurringSchedules` (default 5): ACTIVE recurring schedules, which
  also count towards the first limit.
- `maxFutureSchedulingWindowDays` (default 30): a schedule's first send
  must be within this many days. A recurrence may continue beyond it,
  until its end or cancellation.
- The first send must be at least 2 minutes ahead, so its trigger exists
  before it is due.

The counts live in one item per user (`SCHEDULE_COUNT` / user ID). Creating
a schedule is one transaction: the counter update is conditional on staying
within the limits (`active <= max - 1`, and the same for `recurring`), and
the schedule and its owner pointer are written only if absent. Concurrent
creations cannot both take the last slot. Ending a schedule decrements the
counts in the same transaction that moves it out of `ACTIVE`, conditional
on it being `ACTIVE`, so a slot is released exactly once. Lowering a limit
below the current count keeps existing schedules and refuses new ones.

### Execution

EventBridge Scheduler holds one schedule per application schedule in the
`<stack>-mail` group. One-time triggers use `at(<UTC time>)`; recurring
ones use the cron expression above with the schedule's zone, a start a
minute before the first send, and the optional end. All use
`FlexibleTimeWindow: OFF` and delete themselves after their last
invocation. The trigger's payload is
`{"scheduleId": "<id>", "scheduledTime": "<aws.scheduler.scheduled-time>"}`
and nothing else; it holds no recipient, sender, content, or user.

The scheduler function (`lib/admin/scheduleHandler.ts`, bundled to
`.aws-build/scheduler`) has no function URL and no resource-based policy.
Only `SchedulerInvokeRole`, which only `scheduler.amazonaws.com` can assume
for this account's schedules in the console's group, may invoke it. For
each invocation it:

1. Accepts the event only if it is exactly `scheduleId` (a UUID) and
   `scheduledTime` (UTC). Any other field, including a recipient, body,
   sender, or user, makes the event invalid and nothing happens.
2. Loads the schedule from DynamoDB through its owner pointer. Missing:
   it deletes the orphaned trigger. Not `ACTIVE`: it deletes the trigger.
3. Checks that the time is one of the stored schedule's occurrences (the
   one-time instant, or an occurrence of the recurrence between start and
   end) and is due (at most a minute early). Past the end: the schedule is
   completed and the trigger deleted.
4. Claims the occurrence: one transaction creates the run item
   (`SCHEDULE_RUN#<userId>` / `<scheduleId>#<local time>`) only if absent,
   with a no-op write conditional on the schedule still being `ACTIVE`.
5. If the invocation is more than an hour late, records the occurrence as
   `missed` without sending.
6. Calls M3's `sendEmail` with the owner (loaded from the table) as the
   actor and the stored message, so every M3 gate applies again at send
   time: user ACTIVE, sending enabled, own APPROVED identity, CONNECTED
   Gmail with a working token (refreshed through M2), own contacts with
   their current details, template still present and templates enabled,
   bulk rules, placeholders, and today's quota, reserved atomically.
7. Records the run's result on the run and the schedule, and either moves
   the schedule to its next occurrence or ends it.

### Idempotency

Each occurrence is claimed once. The run item's key is the schedule ID and
the occurrence's local date and time, created with "must not exist", so a
repeated invocation (a Scheduler or Lambda retry, a duplicate delivery, or
both instants of a repeated local time) finds it and does nothing,
whatever its status: `SENT`, still in progress, `FAILED`, or `UNCERTAIN`.

The occurrence's M3 operation ID is deterministic: the occurrence's
millisecond timestamp, a dot, and the first 22 base64url characters of
SHA-256 of `schedule:<id>:<local time>`. Its send records therefore have
the same keys however often the occurrence is attempted, so M3's own
per-recipient idempotency applies underneath. Send records made by a
schedule carry its `scheduleId`, and compose's history marks them
"Scheduled".

### Failures and retries

No send is retried automatically. An occurrence is final once claimed; a
recurring schedule continues with its next occurrence.

| Category      | Failure codes                                                                                                                                                                                         | Result                               |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| AUTHORIZATION | `user-inactive`, `sending-disabled`, `scheduling-disabled`, `sender-unavailable`, `not-connected`, `reauth-required`, `gmail-auth-failed`, `contacts-disabled`, `templates-disabled`, `bulk-disabled` | Not sent                             |
| VALIDATION    | `template-not-found`, `recipient-not-found`, `invalid-recipient`, `no-recipients`, `unresolved-placeholder`, `invalid-message`, `missed`                                                              | Not sent                             |
| LIMIT         | `bulk-limit-exceeded`, `daily-limit-reached`, `daily-bulk-limit-reached`                                                                                                                              | Not sent                             |
| REJECTED      | `gmail-rejected`                                                                                                                                                                                      | Not sent (Gmail refused it)          |
| TRANSIENT     | `gmail-unavailable` (before sending), `gmail-rate-limited`, `busy`, `not-attempted`                                                                                                                   | Not sent; not retried                |
| UNCERTAIN     | `gmail-unavailable` (during sending), `interrupted`                                                                                                                                                   | May have been sent; **never resent** |

`interrupted` is an unexpected error while sending: the run is recorded
`UNCERTAIN` and whatever M3 reserved stays reserved. The only retries are
infrastructure retries of the invocation itself, before an occurrence is
claimed: Scheduler retries a failed invocation up to 2 times within an
hour, and Lambda retries a failed asynchronous invocation once, dropping
events older than an hour. Both are harmless because of the claim.

### Recurrence advancement

After an occurrence, the next one is computed from the recurrence in the
schedule's zone, as the first occurrence after both the intended time and
now. It is never "now plus an interval", so a late run does not shift the
timeline, and occurrences that were never invoked are not backfilled. A
next occurrence past the end, or none at all, completes the schedule and
deletes its trigger.

### Cancellation

The owner cancels from the list; no one else can, including the OWNER.
Cancelling moves the schedule to `CANCELLED` (conditional on `ACTIVE`,
releasing its slot in the same transaction), then deletes its trigger.

- Cancellation before an occurrence is claimed stops it: the claim
  requires the schedule to be `ACTIVE`.
- An occurrence already claimed keeps running. Its result is still
  recorded, but it cannot move the schedule back to `ACTIVE` or set a next
  send. A message Gmail has accepted cannot be recalled.
- If the trigger cannot be deleted at that moment, the schedule is still
  cancelled. The next time the trigger fires, the function finds the
  schedule not `ACTIVE`, sends nothing, and deletes the trigger, so no
  trigger is left behind for good.

### Editing

Schedules cannot be edited. Changing a schedule safely would mean updating
the stored message, the counts, and the trigger together while an
occurrence may be running; cancelling and creating a new schedule gives the
same result with the existing, tested paths. The list says so.

### Templates, contacts, and senders after scheduling

A schedule stores the subject and body as entered (a snapshot; editing the
template later does not change it) and the chosen template's ID, so M3's
template checks apply at each occurrence: if the template is deleted, or
the OWNER turns templates off, later occurrences fail as
`template-not-found` or `templates-disabled`. Contacts are stored by ID and
read at each occurrence, so placeholders use the contact's current name,
email, and company, and a deleted contact fails the occurrence
(`recipient-not-found`). A disabled identity, a disconnected or
reauthorization-required Gmail connection, a disabled user, or sending
turned off likewise stops each later occurrence until fixed. So does
turning scheduling off, or turning recurring schedules off for a recurring
one (M5): the occurrence fails as `scheduling-disabled`.

### Configuration

| Name                   | Function | Source in production                   |
| ---------------------- | -------- | -------------------------------------- |
| `SCHEDULER_GROUP_NAME` | both     | Template: the `ScheduleGroup` name     |
| `SCHEDULER_TARGET_ARN` | server   | Template: the scheduler function's ARN |
| `SCHEDULER_ROLE_ARN`   | server   | Template: `SchedulerInvokeRole`'s ARN  |

The scheduler function also receives `ADMIN_TABLE_NAME`, the Google client
settings, and `GMAIL_TOKEN_KMS_KEY_ID`, and runs only when all are set; it
never falls back to an in-memory store or local key. Without the three
`SCHEDULER_*` values the server reports "Scheduling is not configured" in
production. In local development schedules are kept by an in-process
stand-in that never fires (with a warning), so the pages can be used but
nothing is sent later.

### Not built

Campaigns, analytics, open or click tracking, unsubscribe handling,
attachments, HTML mail, inbox access or sync, other providers (Outlook,
Microsoft 365, GoDaddy, Titan), editing or pausing schedules, automatic
retries, public sign-up, billing, multi-tenancy, multi-factor
authentication, and password reset.

## Milestone 5

M5 adds no infrastructure, environment variable, dependency, index, or IAM
permission. Its new items live in the existing table, which both functions
can already read and write. Nothing runs between requests.

### Dashboard

`/admin` shows the signed-in user's own numbers (`lib/admin/dashboard.ts`):
today's emails and bulk recipients against their limits, with what
remains; how many sender addresses are ready (approved and connected),
approved, and awaiting review; active and recurring schedules against
their limits; the feature switches; up to five items needing attention
(failed, uncertain, or long-unfinished sends among the latest 50,
connections needing Reconnect, and overdue or failed schedules); and the
five most recent sends. The OWNER additionally sees an "Accounts overview":
each account's status, today's counters, and active schedules against its
limits. It is built from counters and settings only, never another user's
contacts, templates, recipients, subjects, or bodies.

### Settings

`/admin/settings` shows every user their own effective switches and
limits, read-only. The OWNER also gets, for each account, its role
(display only), a disable/re-enable button for USERs, and the settings
form, which now includes two switches:

- `schedulingEnabled`: off refuses new schedules (`scheduling-disabled`)
  and stops every occurrence of existing ones.
- `recurringEnabled`: off refuses new recurring schedules
  (`recurring-disabled`) and stops occurrences of existing recurring ones.

Both are checked in `createSchedule` and again in the execution function
before each occurrence; the schedules page only reflects them. Roles are
not editable: M1's single-OWNER rule means there is no promotion or
demotion path, and M5 keeps it.

### History and search

`/admin/history` lists the signed-in user's send records, newest first, 25
per page, with filters for status, UTC date range, recipient and sender
(substring), individual or bulk, sent now or scheduled, failure category
(the same categories as scheduled occurrences), and schedule. The query
string is parsed against allowlists (`parseHistoryQuery`); unknown
parameters and malformed values are ignored, and a reversed date range is
reported instead of searched.

Send record keys begin with the operation's millisecond timestamp, so a
date range is a key condition on the user's own `SEND#<userId>` partition;
no index is needed. The other filters are applied while reading. A request
reads at most 500 records, in pages of up to 100; if the budget runs out
before a page is full, the page offers to continue from where it stopped.
The cursor is the last record key read; it is accepted only in the shape of
a send record key and within the requested range, and the partition always
comes from the session.

`/admin/history/[operationId]` shows every recipient of one operation, its
schedule and occurrence when it came from one, and the retry form. Another
user's operation, or a malformed ID, is a 404.

### Retry

Retry (`lib/admin/retry.ts`) is a manual request for one of the user's own
operations, and it **is** M3's send path: it calls `sendEmail` again with
the operation's original ID, its sender identity, its template, and its
recipients except those Gmail rejected. Everything is checked again for
the signed-in user: account status, sending and bulk switches, sender
approval, the Gmail connection, contacts, the template, bulk limits, and
today's quota. M3's records then decide who is sent:

| Record                                  | On retry                       |
| --------------------------------------- | ------------------------------ |
| `SENT`                                  | Skipped, never resent          |
| `UNCERTAIN`, `RESERVED`                 | Skipped, never resent          |
| `FAILED` with `gmail-rejected`          | Excluded (would fail the same) |
| `FAILED`, any other code (listed below) | Reserved again and sent        |

Retryable codes: `not-connected`, `reauth-required`, `gmail-auth-failed`,
`gmail-rate-limited`, `gmail-unavailable` (as `FAILED`, so before sending),
`not-attempted`. An operation with nothing retryable is refused with a
reason ("unknown outcome", "rejected by Gmail", or "already sent").

The message: an immediate send's body was never stored, so the retry form
asks for the subject and body again (prefilled with the recorded subject,
and the template's body if one was used). A scheduled occurrence uses its
schedule's stored subject and body while the schedule is `ACTIVE`; once it
ends, its body has been cleared and the occurrence can no longer be
retried. A retry of an occurrence does not change the occurrence's run
record or the schedule; the new outcome is in the send records.

There is no automatic retry anywhere: retry runs only when the user
submits the form, and it is rate limited.

### Audit log

`lib/admin/audit.ts` appends one event per security-relevant action:
sign-in (success and failure), sign-out, OWNER setup, invitations
(create, revoke, accept), account status, sender requests and reviews,
Gmail connection start, completion (the callback), check, and disconnect,
settings changes, sends, retries, schedule creation and cancellation, and
each scheduled occurrence. Refusals by a rate limit are recorded as
`rate-limited`, refusals by role as `denied`.

An event records the trail it belongs to, the actor, the action, the
outcome, an optional target ID, a timestamp, and a small `detail` map.
`sanitizeAuditDetail` runs on every write: it keeps at most 16 primitive
values under plain keys, drops any key that could name a secret or
content (token, secret, password, credential, cookie, authorization,
verifier, nonce, state, code, body, subject, content, email), truncates
strings, and redacts anything that looks like an email address. Events
therefore never hold passwords, Gmail access or refresh tokens, the client
secret, authorization codes, OAuth state, message bodies, subjects, or
recipient addresses; sends are recorded as counts.

Trails: an event goes to the acting user's trail; an occurrence goes to the
schedule owner's trail with no actor; a sign-in attempt for an unknown
address and a wrong setup token go to the `system` trail without the
address. `/admin/audit` shows a USER only their own trail. The OWNER can
choose any account's trail or the system trail. Events expire after one
year. Writing is best effort: the action has already happened, so a failed
write logs a fixed line and is not retried.

### Rate limiting

`lib/admin/rateLimit.ts` limits each signed-in user's mutating Server
Actions per fixed window, keyed by the session's user ID (never by form
input):

| Action                                    | Limit         |
| ----------------------------------------- | ------------- |
| Every send submission                     | 30 per 10 min |
| Send submissions with several recipients  | 10 per hour   |
| Retries                                   | 20 per hour   |
| Starting a Gmail connection               | 10 per 15 min |
| Checking or disconnecting Gmail           | 30 per hour   |
| Sender identity requests                  | 10 per hour   |
| Sender identity reviews (OWNER)           | 60 per hour   |
| Invitations (OWNER)                       | 20 per hour   |
| Invitation revocations, status, settings  | 60 per hour   |
| Creating schedules                        | 20 per hour   |
| Cancelling schedules                      | 60 per hour   |
| Saving or deleting contacts and templates | 120 per hour  |

Counters are `RATE` items updated with one conditional `ADD` (allowed only
while below the limit), so concurrent requests on different Lambda
instances cannot exceed it; they expire through TTL. If the counter cannot
be read or written, the action fails closed with the generic error.
Scheduled occurrences call `sendEmail` from the scheduler function and are
never rate limited. Sign-in keeps its own per-email throttle (five failures
per 15 minutes). The limits sit far above what five people use and exist to
stop a stolen session or a runaway script from flooding Gmail.

### Daily limits and time zones (decision)

Daily quotas stay on UTC days. Moving them to each user's local day would
change the quota item key that M3's reservation transaction and every
existing counter use, and a user's day would shift whenever their time
zone did, either of which could release or double-count quota. The pages
say "today (UTC)" everywhere the limits appear. Revisit only if a user
needs it.

### Schedule message privacy (decision)

An `ACTIVE` schedule must keep its subject and body, because the function
sends them later without the user present. Reviewed in M5 and kept:

- Bodies exist only on `ACTIVE` schedules. Ending a schedule (completed,
  failed, or cancelled) clears the body in the same write, and the ended
  item expires 90 days later.
- Send records and run records never contain a body. Audit events never
  contain a subject or body.
- The table is encrypted at rest and reachable only through the two
  functions' roles; the OWNER has no view of another user's schedules.

Encrypting bodies with KMS would add a KMS call to every schedule read for
little gain against the table's own encryption and access controls, so the
scheduler is not redesigned.

### Security review

Reviewed across M1–M5 for this milestone:

- **Authentication.** Argon2id passwords; opaque session tokens stored as
  hashes; `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/admin` cookies;
  absolute 7-day sessions invalidated on disable; uniform login errors;
  per-email throttle; bootstrap token compared in constant time and only
  while no OWNER exists.
- **Authorization and IDOR.** Every page and action resolves the actor
  from the session. Every per-user partition key (contacts, templates,
  sends, quotas, schedules, runs, audit trails) is built from the session's
  user ID; IDs from forms or URLs are looked up only inside that partition,
  so another user's record looks missing. OWNER-only functions return
  `null` or `forbidden` for anyone else. Covered by tests for history,
  operation detail, retry, audit, dashboard, and the M1–M4 modules.
- **Gmail.** Scopes stay `openid email gmail.send`; the ID token signature,
  audience, issuer, nonce, and email are verified; refresh tokens are KMS
  envelope-encrypted; access tokens are held only in memory for one
  request; tokens, codes, and state are never logged, audited, or returned.
- **Sending.** Quota reserved atomically before Gmail; per-recipient
  idempotency; `UNCERTAIN` never resent; retry only through `sendEmail`;
  no automatic retries; rate limits on every send path a user triggers.
- **Scheduling.** Triggers carry only the schedule ID and time; the
  function re-reads and re-validates everything, claims each occurrence
  once, and now also enforces the scheduling switches.
- **Input.** All forms and query strings are parsed on the server against
  allowlists, lengths, and formats; result codes in URLs map to fixed
  messages (`Object.hasOwn`), so no query text is rendered as a message.
- **Secrets.** None in the repository; secrets reach Lambda as `NoEcho`
  parameters; nothing is `NEXT_PUBLIC_`.
- **Headers and routes.** `/admin` is noindex (metadata and
  `X-Robots-Tag`), absent from navigation and the sitemap, never cached by
  CloudFront, and Server Actions keep Next.js's Origin check with the site
  host allowed.
- **Infrastructure.** Unchanged in M5 and still least privilege: the
  server role has item-level actions on the console table only, the
  scheduler role cannot delete items, and the invoke role can invoke only
  the scheduler function.

### Production configuration

M5 adds no variables. Production needs, all set through the deploy as in
[`deployment.md`](deployment.md):

| Name                        | Required value                                                 |
| --------------------------- | -------------------------------------------------------------- |
| `ADMIN_TABLE_NAME`          | Set by the template                                            |
| `ADMIN_BOOTSTRAP_TOKEN`     | Secret, at least 32 characters, only while creating the OWNER  |
| `GOOGLE_CLIENT_ID`          | The Google Web client's ID (environment variable)              |
| `GOOGLE_CLIENT_SECRET`      | Its secret (environment secret, `NoEcho`)                      |
| `GOOGLE_OAUTH_REDIRECT_URI` | `https://kshitijpal.in/admin/oauth/google/callback` (template) |
| `GMAIL_TOKEN_KMS_KEY_ID`    | The `GmailTokenKey` ARN (template)                             |
| `SCHEDULER_*`               | Set by the template                                            |

Before going live: the redirect URI registered on the Google client must be
exactly the value above; the Google app's consent screen must list only the
`gmail.send` scope besides `openid` and `email`; `ADMIN_BOOTSTRAP_TOKEN`
must be removed and redeployed after the OWNER exists; and the GitHub
`production` environment must hold the secrets (nothing is committed). The
Resend contact form's variables are unchanged.

## Logging

Server Actions and the OAuth callback log only
`[admin] <operation> failed (<error name>).` on an unexpected error.
Passwords, password hashes, session tokens, invitation tokens, the
bootstrap token, OAuth state, codes, access and refresh tokens, ID tokens,
the client secret, and email addresses are never logged. Google errors
carry a fixed message (`Google OAuth request failed (<kind>).`) and never a
response body. Sending logs nothing on success or on a Gmail refusal (the
outcome is in the send record); an unexpected error logs only
`[admin] Send failed (<error name>).` Message bodies, subjects,
recipients, and Gmail responses are never logged. The scheduler function
logs one fixed line per invocation, `[scheduler] Occurrence <outcome>.`,
with the failure category and code when it did not send; never an
address, subject, body, user, or token.

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
- **7-day Gmail connections while the Google app is in Testing.** Google
  expires its refresh tokens; the next refresh marks the connection
  REAUTH_REQUIRED.
- **Connection status is only as fresh as its last check.** With no
  background refresh, a connection revoked at Google shows CONNECTED until
  something refreshes it (Check connection, or a future send).
- **A disabled identity keeps its connection record**, unusable because
  approval is checked on every use. Re-approval needs a new request, which
  creates a new identity and so a new connection.
- **Disconnect revokes the whole Google grant** for that Google account,
  which matters only if one Google account were connected for two
  identities.
- **Last write wins** on a connection: two simultaneous reconnects or
  refreshes of the same address store whichever finishes last, which is
  still a valid credential.
- **No exactly-once delivery.** A Gmail request that times out or fails
  with a 5xx is `UNCERTAIN`; the console never resends it, so the user must
  check Gmail's Sent folder.
- **Interrupted sends stay counted.** If the function stops mid-send,
  records left `RESERVED` keep their quota for the rest of the UTC day and
  show "outcome unknown".
- **Contact and template bounds are not atomic.** Two simultaneous creates
  at the bound can exceed it by one; they are storage hygiene, not
  security limits.
- **Bulk sends are capped at 20 recipients** by the request's time budget;
  larger lists need several sends.
- **Plain text only.** No HTML, attachments, display names, or `Reply-To`.
- **A user's daily counters reset at 00:00 UTC**, not local midnight.
- **Scheduled sends are not retried automatically.** A failed or missed
  occurrence is recorded; a one-time schedule then ends `FAILED`, and a
  recurring one waits for its next occurrence. Its owner can retry a
  failed occurrence by hand only while the schedule is `ACTIVE`, because
  ended schedules no longer hold the message.
- **Retrying an immediate send needs the message again**, since bodies are
  never stored.
- **Roles are fixed.** There is one OWNER and no promotion or demotion.
- **History search reads at most 500 records per request.** Rare filters
  over a long history may need "Continue searching".
- **Audit writes are best effort.** If the table refuses a write, the
  action still stands and only a fixed log line records the gap.
- **The OWNER's administrative actions are in the OWNER's trail**, not the
  affected user's; the OWNER sees both.
- **Rate limits use fixed windows**, so up to twice a limit can pass around
  a window boundary.
- **No editing or pausing of schedules.** Cancel and create a new one.
- **Late invocations are dropped.** If Scheduler invokes an occurrence
  more than an hour late, it is recorded as missed and not sent.
- **Message bodies of ACTIVE schedules are stored** in the table until the
  schedule ends, because the function must send them later.
- **Monthly schedules run on day 1 to 28** only.
- **Local development never fires schedules.** The in-process stand-in
  only records them.
