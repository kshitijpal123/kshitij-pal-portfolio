import { createHash } from "node:crypto";
import {
  createRemoteJWKSet,
  type JWTPayload,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose";

/** The callback route; Google must list `<origin><this path>` exactly. */
export const gmailCallbackPath = "/admin/oauth/google/callback";

export const gmailSendScope = "https://www.googleapis.com/auth/gmail.send";

/**
 * `gmail.send` is the only Gmail permission. `openid email` add an ID token
 * with the account's verified address and stable ID: `gmail.send` cannot read
 * the account's own address, and the connection must prove it matches the
 * approved sender identity.
 */
export const gmailScopes = ["openid", "email", gmailSendScope] as const;

const authorizationEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";
const tokenEndpoint = "https://oauth2.googleapis.com/token";
const revocationEndpoint = "https://oauth2.googleapis.com/revoke";
const signingKeysEndpoint = "https://www.googleapis.com/oauth2/v3/certs";
const googleIssuers = new Set([
  "https://accounts.google.com",
  "accounts.google.com",
]);
const requestTimeoutMs = 8000;
/** The token is minted by the code exchange in the same request. */
const idTokenMaxAgeSeconds = 5 * 60;
const idTokenClockToleranceSeconds = 60;

/** Resolves the key that signed a token, by its `kid`. */
export type GoogleSigningKeys = JWTVerifyGetKey;

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

/**
 * `invalid_grant`: the code or refresh token is permanently unusable
 * (revoked, expired, or already redeemed). `rejected`: any other refusal.
 * `unavailable`: Google could not be reached or failed; nothing is known.
 * Messages are fixed and never contain a response body or token.
 */
export type GoogleOAuthErrorKind = "invalid_grant" | "rejected" | "unavailable";

export class GoogleOAuthError extends Error {
  constructor(readonly kind: GoogleOAuthErrorKind) {
    super(`Google OAuth request failed (${kind}).`);
    this.name = "GoogleOAuthError";
  }
}

export type GoogleTokens = {
  accessToken: string;
  expiresInSeconds: number;
  scopes: string[];
  refreshToken: string | null;
  idToken: string | null;
};

export type GoogleOAuthClient = {
  clientId: string;
  authorizationUrl(input: {
    state: string;
    codeVerifier: string;
    nonce: string;
    loginHint: string;
  }): string;
  exchangeCode(code: string, codeVerifier: string): Promise<GoogleTokens>;
  refresh(refreshToken: string): Promise<GoogleTokens>;
  /** `true` once Google no longer honors the token. */
  revoke(token: string): Promise<boolean>;
  /** See `verifyGoogleIdToken`; the audience is this client's ID. */
  verifyIdToken(
    idToken: string,
    expected: { nonce: string; now: Date },
  ): Promise<VerifiedGoogleAccount | null>;
};

/** RFC 7636 S256 code challenge. */
export function codeChallenge(codeVerifier: string) {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}

function isLocalhost(url: URL) {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1";
}

/**
 * The OAuth settings, or `null` when any is missing or the redirect URI is
 * not an https (or local http) URL ending in the callback path.
 */
export function getGoogleOAuthConfig(
  env: Record<string, string | undefined> = process.env,
): GoogleOAuthConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = env.GOOGLE_OAUTH_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) return null;

  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    return null;
  }
  const secure =
    url.protocol === "https:" || (url.protocol === "http:" && isLocalhost(url));
  if (!secure || url.pathname !== gmailCallbackPath || url.search || url.hash) {
    return null;
  }
  return { clientId, clientSecret, redirectUri: url.href };
}

type FetchLike = (
  input: string,
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<Pick<Response, "ok" | "status" | "json">>;

async function readJson(response: Pick<Response, "json">) {
  try {
    const body: unknown = await response.json();
    return body && typeof body === "object"
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function asString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function createGoogleOAuthClient(
  config: GoogleOAuthConfig,
  fetchImpl: FetchLike = fetch,
  // Fetched on first use and cached per instance; refetched for an unknown kid.
  keys: GoogleSigningKeys = createRemoteJWKSet(new URL(signingKeysEndpoint)),
): GoogleOAuthClient {
  async function post(url: string, form: Record<string, string>) {
    try {
      return await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(form).toString(),
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
    } catch {
      throw new GoogleOAuthError("unavailable");
    }
  }

  async function requestTokens(form: Record<string, string>) {
    const response = await post(tokenEndpoint, {
      ...form,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    });
    const body = await readJson(response);
    if (!response.ok) {
      if (response.status >= 500) throw new GoogleOAuthError("unavailable");
      throw new GoogleOAuthError(
        body.error === "invalid_grant" ? "invalid_grant" : "rejected",
      );
    }
    const accessToken = asString(body.access_token);
    if (!accessToken) throw new GoogleOAuthError("rejected");
    return {
      accessToken,
      expiresInSeconds:
        typeof body.expires_in === "number" ? body.expires_in : 0,
      scopes: (asString(body.scope) ?? "").split(" ").filter(Boolean),
      refreshToken: asString(body.refresh_token),
      idToken: asString(body.id_token),
    };
  }

  return {
    clientId: config.clientId,

    authorizationUrl({ state, codeVerifier, nonce, loginHint }) {
      const url = new URL(authorizationEndpoint);
      url.search = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: "code",
        scope: gmailScopes.join(" "),
        state,
        nonce,
        code_challenge: codeChallenge(codeVerifier),
        code_challenge_method: "S256",
        // A refresh token for on-demand use; consent every time so Google
        // always returns one.
        access_type: "offline",
        prompt: "consent",
        login_hint: loginHint,
      }).toString();
      return url.href;
    },

    exchangeCode(code, codeVerifier) {
      return requestTokens({
        grant_type: "authorization_code",
        code,
        code_verifier: codeVerifier,
        redirect_uri: config.redirectUri,
      });
    },

    refresh(refreshToken) {
      return requestTokens({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      });
    },

    async revoke(token) {
      const response = await post(revocationEndpoint, { token });
      if (response.ok) return true;
      // An already invalid token is as revoked as it can be.
      const body = await readJson(response);
      return response.status === 400 && body.error === "invalid_token";
    },

    verifyIdToken(idToken, { nonce, now }) {
      return verifyGoogleIdToken(idToken, {
        clientId: config.clientId,
        nonce,
        now,
        keys,
      });
    },
  };
}

export type VerifiedGoogleAccount = { sub: string; email: string };

/**
 * Verifies a Google ID token: an RS256 signature by one of Google's
 * published keys, Google as issuer, our client ID as audience (and as `azp`
 * when present), not expired, issued within `idTokenMaxAgeSeconds` and not
 * in the future, the nonce from this attempt, and a verified, well-formed
 * email. `null` unless all of that holds; the reason is never surfaced.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  expected: {
    clientId: string;
    nonce: string;
    now: Date;
    keys: GoogleSigningKeys;
  },
): Promise<VerifiedGoogleAccount | null> {
  let claims: JWTPayload;
  try {
    ({ payload: claims } = await jwtVerify(idToken, expected.keys, {
      algorithms: ["RS256"],
      issuer: [...googleIssuers],
      audience: expected.clientId,
      currentDate: expected.now,
      clockTolerance: idTokenClockToleranceSeconds,
      maxTokenAge: idTokenMaxAgeSeconds,
      requiredClaims: ["exp", "iat", "sub", "email"],
    }));
  } catch {
    return null;
  }

  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const sub = asString(claims.sub);
  const email = asString(claims.email);
  const valid =
    (claims.azp === undefined
      ? audiences.length === 1
      : claims.azp === expected.clientId) &&
    claims.nonce === expected.nonce &&
    (claims.email_verified === true || claims.email_verified === "true") &&
    sub !== null &&
    email !== null &&
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  return valid ? { sub, email } : null;
}

let client: GoogleOAuthClient | null | undefined;

/** The configured client, or `null` while Google OAuth is not configured. */
export function getGoogleOAuthClient(
  env: Record<string, string | undefined> = process.env,
): GoogleOAuthClient | null {
  if (client !== undefined) return client;
  const config = getGoogleOAuthConfig(env);
  client = config ? createGoogleOAuthClient(config) : null;
  return client;
}
