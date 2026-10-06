# ADR 0004: Gmail OAuth with KMS envelope-encrypted refresh tokens

- Status: Accepted
- Date: 2026-10-06

## Context

Milestone 2 of the private mail console (see
`docs/architecture/mail-console.md`) connects each approved sender identity
to its Gmail account so a later milestone can send as it. Sending as a
Gmail address through the Gmail API needs the account owner's OAuth consent
and a long-lived refresh token, kept on the server, from which short-lived
access tokens are minted on demand. A refresh token is a bearer credential
for sending mail as that person, so it must not be stored in plaintext.
There are no background workers (ADR 0002), and the console's data lives
in one DynamoDB table (ADR 0003).

Options considered for storing refresh tokens:

- **Plaintext in DynamoDB.** Simplest, but anyone who can read the table or
  a backup can send mail as every connected account.
- **AWS Secrets Manager, one secret per connection.** Strong, but a
  per-secret monthly charge, secrets created and deleted at runtime (wider
  Lambda permissions than the stack's least-privilege model), and a second
  place where connection state lives.
- **Application-level encryption with a key in an environment variable.**
  No AWS service, but the key sits next to the code, cannot be rotated
  without re-encrypting, and leaks with the function configuration.
- **KMS envelope encryption, ciphertext in DynamoDB.** One customer managed
  key defined in the template; each token encrypted locally with its own
  data key, whose encrypted copy is stored beside it. The plaintext key
  material never leaves KMS, use is audited by CloudTrail, and rotation is
  automatic.

## Decision

Use the authorization-code flow with PKCE, run entirely on the server
(Server Action to start, Route Handler at `/admin/oauth/google/callback`),
with scopes `openid email https://www.googleapis.com/auth/gmail.send`.
`openid email` are needed only to prove which Google account consented,
because `gmail.send` cannot read the account's own address. That proof is
the ID token, whose RS256 signature is verified against Google's published
keys with `jose`, along with its issuer, audience, expiry, issued-at,
nonce, and verified email.

Store each refresh token in the console table, encrypted with AES-256-GCM
under a data key from KMS `GenerateDataKey` on a dedicated customer managed
key (`GmailTokenKey` in `infra/portfolio.yaml`, rotation on, retained on
stack deletion). The KMS encryption context, also the GCM additional data,
names the purpose, user, and sender identity. The key policy grants the
function role only `kms:GenerateDataKey` and `kms:Decrypt`, only with that
purpose; the permissions boundary caps the role the same way.

Pass the Google client secret like the existing secrets: a GitHub
environment secret, a `NoEcho` template parameter, the Lambda environment.

## Consequences

- Two new dependencies: `@aws-sdk/client-kms`, from the same SDK v3 family
  as the DynamoDB clients, and `jose` (no dependencies of its own) for ID
  token verification, rather than `google-auth-library`, which brings a
  much larger dependency tree for the same check.
- Verifying an ID token fetches Google's key set on first use per Lambda
  instance; it is cached afterwards.
- One new standing cost: the customer managed key's monthly charge. KMS
  requests happen only on connect, refresh, and disconnect.
- A copy of the table, or read access to it, does not expose usable tokens;
  decrypting needs the function role's KMS permission and the matching
  context.
- The bootstrap stack must be updated before the next application deploy:
  the CloudFormation role needs KMS key administration, and the boundary
  must allow the two KMS actions.
- Deleting the key would make every stored token unreadable; the key is
  retained, and deletion is a deliberate manual act with a waiting period.
- Refresh happens only when a token is needed or the user checks the
  connection, so a revocation at Google is noticed then, not immediately.
