import { generateKeyPairSync } from "node:crypto";
import { createLocalJWKSet, SignJWT } from "jose";
import {
  gmailSendScope,
  GoogleOAuthError,
  type GoogleOAuthClient,
  type GoogleOAuthErrorKind,
  type GoogleTokens,
  verifyGoogleIdToken,
} from "@/lib/admin/googleOAuth";
import type { PublicUser } from "@/lib/admin/model";
import {
  listOwnSenderIdentities,
  requestSenderIdentity,
  reviewSenderIdentity,
} from "@/lib/admin/senderIdentities";
import type { AdminStore } from "@/lib/admin/store";
import { now } from "@/tests/helpers/admin";

export const clientId = "test-client.apps.googleusercontent.com";
export const refreshToken = "1//refresh-token-SECRET-value";
export const rotatedRefreshToken = "1//rotated-refresh-token-SECRET";
export const accessToken = "ya29.access-token-SECRET-value";

export function unsignedIdToken(claims: Record<string, unknown>) {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "RS256" })}.${encode(claims)}.signature`;
}

function rsaKeyPair() {
  return generateKeyPairSync("rsa", { modulusLength: 2048 });
}

/** Stands in for Google's signing key; its public half is `googleKeys`. */
const googleKeyPair = rsaKeyPair();
/** A key Google never published, as an attacker would sign with. */
const attackerKeyPair = rsaKeyPair();
export const googleKeyId = "test-google-key";

/** The public key as Google publishes it at its JWKS endpoint. */
export const googlePublicJwk = {
  ...googleKeyPair.publicKey.export({ format: "jwk" }),
  kid: googleKeyId,
  alg: "RS256",
  use: "sig",
};

/** Google's published key set, as `jose` would load it from Google. */
export const googleKeys = createLocalJWKSet({ keys: [googlePublicJwk] });

export type IdTokenSigner = "google" | "attacker";

/** An RS256 ID token signed by Google's test key, or the attacker's. */
export function signedIdToken(
  claims: Record<string, unknown>,
  signer: IdTokenSigner = "google",
) {
  const key =
    signer === "google" ? googleKeyPair.privateKey : attackerKeyPair.privateKey;
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: googleKeyId, typ: "JWT" })
    .sign(key);
}

/** Valid ID token claims issued at `issuedAt`, before any `overrides`. */
export function idTokenClaims(
  issuedAt: Date,
  overrides: Record<string, unknown> = {},
) {
  const iat = Math.floor(issuedAt.getTime() / 1000);
  return {
    iss: "https://accounts.google.com",
    aud: clientId,
    azp: clientId,
    sub: "google-sub-123",
    email: "alice@gmail.com",
    email_verified: true,
    iat,
    exp: iat + 3600,
    ...overrides,
  };
}

type FakeGoogleOptions = {
  /** The Google account the user picks on the consent screen. */
  email?: string;
  emailVerified?: boolean;
  /** When Google mints the ID token; tests on the real clock pass `new Date()`. */
  issuedAt?: Date;
  /** Claims replacing the ID token's valid ones. */
  idTokenOverrides?: Record<string, unknown>;
  idTokenSigner?: IdTokenSigner;
  scopes?: string[];
  refreshToken?: string | null;
  exchangeError?: GoogleOAuthErrorKind;
  refreshError?: GoogleOAuthErrorKind;
  refreshScopes?: string[];
  refreshRotates?: boolean;
  revokeResult?: boolean | "throw";
};

/** A stand-in for Google's OAuth endpoints; no network. */
export function createFakeGoogle(options: FakeGoogleOptions = {}) {
  const calls = {
    authorizationUrl: [] as Parameters<
      GoogleOAuthClient["authorizationUrl"]
    >[0][],
    exchangeCode: [] as { code: string; codeVerifier: string }[],
    refresh: [] as string[],
    revoke: [] as string[],
  };
  let nonce = "";

  const client: GoogleOAuthClient = {
    clientId,
    authorizationUrl(input) {
      calls.authorizationUrl.push(input);
      nonce = input.nonce;
      return `https://accounts.google.com/o/oauth2/v2/auth?state=${input.state}`;
    },
    async exchangeCode(code, codeVerifier) {
      calls.exchangeCode.push({ code, codeVerifier });
      if (options.exchangeError) {
        throw new GoogleOAuthError(options.exchangeError);
      }
      return {
        accessToken,
        expiresInSeconds: 3599,
        scopes: options.scopes ?? ["openid", "email", gmailSendScope],
        refreshToken:
          options.refreshToken === undefined
            ? refreshToken
            : options.refreshToken,
        idToken: await signedIdToken(
          idTokenClaims(options.issuedAt ?? now, {
            email: options.email ?? "alice@gmail.com",
            email_verified: options.emailVerified ?? true,
            nonce,
            ...options.idTokenOverrides,
          }),
          options.idTokenSigner,
        ),
      } satisfies GoogleTokens;
    },
    async refresh(token) {
      calls.refresh.push(token);
      if (options.refreshError)
        throw new GoogleOAuthError(options.refreshError);
      return {
        accessToken,
        expiresInSeconds: 3599,
        scopes: options.refreshScopes ?? [gmailSendScope],
        refreshToken: options.refreshRotates ? rotatedRefreshToken : null,
        idToken: null,
      };
    },
    async revoke(token) {
      calls.revoke.push(token);
      if (options.revokeResult === "throw") {
        throw new GoogleOAuthError("unavailable");
      }
      return options.revokeResult ?? true;
    },
    verifyIdToken(idToken, expected) {
      return verifyGoogleIdToken(idToken, {
        clientId,
        keys: googleKeys,
        ...expected,
      });
    },
  };
  return { client, calls };
}

/** Requests an address for `user` and has the OWNER approve it. */
export async function seedApprovedIdentity(
  store: AdminStore,
  owner: PublicUser,
  user: PublicUser,
  email: string,
) {
  if (!(await requestSenderIdentity(store, user, email, now))) {
    throw new Error("Identity request failed");
  }
  const identity = (await listOwnSenderIdentities(store, user)).find(
    (candidate) => candidate.email === email,
  );
  if (!identity) throw new Error("Identity missing");
  await reviewSenderIdentity(store, owner, identity.id, "approve", null, now);
  return { ...identity, status: "APPROVED" as const };
}

/** The `state` value a fake authorization URL carries. */
export function stateFrom(authorizationUrl: string) {
  return new URL(authorizationUrl).searchParams.get("state") ?? "";
}
