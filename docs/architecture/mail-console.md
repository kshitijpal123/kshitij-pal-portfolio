# Private Mail Console

Status: Milestone 2 of the console. Milestone 1 (foundation) built
authentication, users, roles, invitations, the five-user limit, the OWNER
bootstrap, and sender identity approval. Milestone 2 adds Gmail account
connection through Google OAuth (see "Gmail connection"). Nothing sends
email yet.

Approved sender identity does not mean Gmail authorization, and Gmail
authorization does not mean approval. Sending (a later milestone) needs
both.

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
| `/admin`                | Signed in                        | Profile, identities, Gmail accounts, OWNER overview   |
| `/admin/login`          | Anyone                           | Sign in (redirects to `/admin` if signed in)          |
| `/admin/setup`          | Anyone, only while bootstrapping | Create the OWNER; 404 otherwise (signed in: `/admin`) |
| `/admin/invite/[token]` | Holder of an open invitation     | Choose a name and password                            |
| `/admin/users`          | OWNER                            | Seats, users, invitations, invite form                |
| `/admin/senders`        | Signed in                        | Request and track own sender identities               |
| `/admin/approvals`      | OWNER                            | Review sender identity requests                       |

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
components/admin/    Console UI; the five forms and GmailConnectButton are
                     the only Client Components
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

| `pk`           | `sk`        | Item                                         |
| -------------- | ----------- | -------------------------------------------- |
| `USER`         | user ID     | User (including the password hash)           |
| `USER_EMAIL`   | email       | Unique-email lock                            |
| `META`         | `OWNER`     | The single-OWNER lock                        |
| `META`         | `SEATS`     | Version counter for the five-seat limit      |
| `INVITATION`   | ID          | Invitation (token hash only)                 |
| `SESSION`      | token hash  | Session; `expiresAtEpoch` TTL                |
| `ATTEMPT`      | key         | Failed-attempt window; `expiresAtEpoch` TTL  |
| `SENDER`       | ID          | Sender identity                              |
| `SENDER_EMAIL` | email       | One active claimant per sender address       |
| `OAUTH_STATE`  | state hash  | Pending Google consent; `expiresAtEpoch` TTL |
| `GMAIL`        | identity ID | Gmail connection (encrypted credential)      |

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

### Not built in M2

Compose, sending, templates, contacts, bulk mail, scheduling, recurring
sends, inbox access or sync, other providers, background workers, public
sign-up, billing, multi-factor authentication, and password reset.

## Logging

Server Actions and the OAuth callback log only
`[admin] <operation> failed (<error name>).` on an unexpected error.
Passwords, password hashes, session tokens, invitation tokens, the
bootstrap token, OAuth state, codes, access and refresh tokens, ID tokens,
the client secret, and email addresses are never logged. Google errors
carry a fixed message (`Google OAuth request failed (<kind>).`) and never a
response body.

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
