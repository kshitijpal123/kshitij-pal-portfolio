// @vitest-environment node
import { generateKeyPairSync } from "node:crypto";
import { SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  codeChallenge,
  createGoogleOAuthClient,
  getGoogleOAuthConfig,
  gmailCallbackPath,
  gmailScopes,
  GoogleOAuthError,
  verifyGoogleIdToken,
} from "@/lib/admin/googleOAuth";
import { now } from "@/tests/helpers/admin";
import {
  clientId,
  googleKeyId,
  googleKeys,
  googlePublicJwk,
  idTokenClaims,
  type IdTokenSigner,
  signedIdToken,
  unsignedIdToken,
} from "@/tests/helpers/gmail";

const clientSecret = "test-client-secret-value";
const config = {
  clientId,
  clientSecret,
  redirectUri: `https://portfolio.test${gmailCallbackPath}`,
};

afterEach(() => {
  vi.resetModules();
});

function fakeFetch(status: number, body: unknown) {
  return vi.fn<
    (
      url: string,
      init: { body: string },
    ) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>
  >(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
}

function sentForm(fetch: ReturnType<typeof fakeFetch>) {
  const [url, init] = fetch.mock.calls[0];
  return { url, form: Object.fromEntries(new URLSearchParams(init.body)) };
}

describe("getGoogleOAuthConfig", () => {
  const env = {
    GOOGLE_CLIENT_ID: clientId,
    GOOGLE_CLIENT_SECRET: clientSecret,
    GOOGLE_OAUTH_REDIRECT_URI: `https://kshitijpal.in${gmailCallbackPath}`,
  };

  it("reads the client and redirect URI", () => {
    expect(getGoogleOAuthConfig(env)).toEqual({
      clientId,
      clientSecret,
      redirectUri: `https://kshitijpal.in${gmailCallbackPath}`,
    });
  });

  it("is off while any value is missing", () => {
    for (const name of Object.keys(env)) {
      expect(getGoogleOAuthConfig({ ...env, [name]: " " })).toBeNull();
    }
  });

  it("accepts http only for localhost", () => {
    expect(
      getGoogleOAuthConfig({
        ...env,
        GOOGLE_OAUTH_REDIRECT_URI: `http://localhost:3000${gmailCallbackPath}`,
      }),
    ).not.toBeNull();
    expect(
      getGoogleOAuthConfig({
        ...env,
        GOOGLE_OAUTH_REDIRECT_URI: `http://kshitijpal.in${gmailCallbackPath}`,
      }),
    ).toBeNull();
  });

  it("requires the callback path exactly", () => {
    for (const uri of [
      "https://kshitijpal.in/admin",
      `https://kshitijpal.in${gmailCallbackPath}?next=/`,
      "not a url",
    ]) {
      expect(
        getGoogleOAuthConfig({ ...env, GOOGLE_OAUTH_REDIRECT_URI: uri }),
      ).toBeNull();
    }
  });

  it("caches the configured client", async () => {
    const { getGoogleOAuthClient } = await import("@/lib/admin/googleOAuth");
    const client = getGoogleOAuthClient(env);
    expect(client?.clientId).toBe(clientId);
    expect(getGoogleOAuthClient({})).toBe(client);
  });
});

describe("authorization URL", () => {
  it("requests gmail.send plus openid email, offline, with PKCE", () => {
    const client = createGoogleOAuthClient(config, fakeFetch(200, {}));
    const url = new URL(
      client.authorizationUrl({
        state: "state-value",
        codeVerifier: "verifier-value",
        nonce: "nonce-value",
        loginHint: "alice@gmail.com",
      }),
    );

    expect(url.origin + url.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: clientId,
      redirect_uri: config.redirectUri,
      response_type: "code",
      scope: "openid email https://www.googleapis.com/auth/gmail.send",
      state: "state-value",
      nonce: "nonce-value",
      code_challenge: codeChallenge("verifier-value"),
      code_challenge_method: "S256",
      access_type: "offline",
      prompt: "consent",
      login_hint: "alice@gmail.com",
    });
    expect(url.href).not.toContain(clientSecret);
    expect(url.href).not.toContain("verifier-value");
    expect(url.searchParams.has("include_granted_scopes")).toBe(false);
  });

  it("asks for no Gmail permission beyond sending", () => {
    expect([...gmailScopes]).toEqual([
      "openid",
      "email",
      "https://www.googleapis.com/auth/gmail.send",
    ]);
    expect(gmailScopes.join(" ")).not.toMatch(
      /mail\.google\.com|readonly|modify|metadata|compose|insert|profile/,
    );
  });

  it("derives the RFC 7636 S256 challenge", () => {
    // Appendix B of RFC 7636.
    expect(codeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });
});

describe("token requests", () => {
  it("exchanges a code server-side with the secret and verifier", async () => {
    const fetch = fakeFetch(200, {
      access_token: "ya29.access",
      expires_in: 3599,
      refresh_token: "1//refresh",
      scope: "openid https://www.googleapis.com/auth/gmail.send email",
      id_token: "id.token.value",
      token_type: "Bearer",
    });
    const client = createGoogleOAuthClient(config, fetch);

    expect(await client.exchangeCode("auth-code", "verifier")).toEqual({
      accessToken: "ya29.access",
      expiresInSeconds: 3599,
      refreshToken: "1//refresh",
      scopes: ["openid", "https://www.googleapis.com/auth/gmail.send", "email"],
      idToken: "id.token.value",
    });
    const { url, form } = sentForm(fetch);
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(form).toEqual({
      grant_type: "authorization_code",
      code: "auth-code",
      code_verifier: "verifier",
      redirect_uri: config.redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    });
  });

  it("refreshes with the refresh token", async () => {
    const fetch = fakeFetch(200, {
      access_token: "ya29.new",
      expires_in: 3599,
      scope: "https://www.googleapis.com/auth/gmail.send",
    });
    const client = createGoogleOAuthClient(config, fetch);
    expect(await client.refresh("1//refresh")).toMatchObject({
      accessToken: "ya29.new",
      refreshToken: null,
    });
    expect(sentForm(fetch).form).toMatchObject({
      grant_type: "refresh_token",
      refresh_token: "1//refresh",
    });
  });

  it.each([
    [
      400,
      { error: "invalid_grant", error_description: "Token revoked 1//x" },
      "invalid_grant",
    ],
    [400, { error: "invalid_client" }, "rejected"],
    [401, {}, "rejected"],
    [500, {}, "unavailable"],
    [503, { error: "invalid_grant" }, "unavailable"],
    [200, { token_type: "Bearer" }, "rejected"],
  ])(
    "maps HTTP %i to %s without the response body",
    async (status, body, kind) => {
      const client = createGoogleOAuthClient(config, fakeFetch(status, body));
      const error = await client.refresh("1//refresh-SECRET").catch((e) => e);
      expect(error).toBeInstanceOf(GoogleOAuthError);
      expect(error.kind).toBe(kind);
      expect(error.message).toBe(`Google OAuth request failed (${kind}).`);
      expect(String(error.message)).not.toMatch(/SECRET|revoked|1\/\//);
    },
  );

  it("treats a network failure as unavailable", async () => {
    const client = createGoogleOAuthClient(config, async () => {
      throw new Error("ECONNRESET 1//refresh-SECRET");
    });
    const error = await client.refresh("1//refresh-SECRET").catch((e) => e);
    expect(error).toMatchObject({ kind: "unavailable" });
    expect(error.message).not.toContain("SECRET");
  });

  it("survives a non-JSON error body", async () => {
    const client = createGoogleOAuthClient(config, async () => ({
      ok: false,
      status: 400,
      json: async () => {
        throw new SyntaxError("bad json");
      },
    }));
    await expect(client.refresh("x")).rejects.toMatchObject({
      kind: "rejected",
    });
  });
});

describe("revocation", () => {
  it("posts the token to Google's revocation endpoint", async () => {
    const fetch = fakeFetch(200, {});
    const client = createGoogleOAuthClient(config, fetch);
    expect(await client.revoke("1//refresh")).toBe(true);
    expect(sentForm(fetch)).toEqual({
      url: "https://oauth2.googleapis.com/revoke",
      form: { token: "1//refresh" },
    });
  });

  it("counts an already invalid token as revoked, other failures not", async () => {
    expect(
      await createGoogleOAuthClient(
        config,
        fakeFetch(400, { error: "invalid_token" }),
      ).revoke("x"),
    ).toBe(true);
    expect(
      await createGoogleOAuthClient(config, fakeFetch(503, {})).revoke("x"),
    ).toBe(false);
  });
});

describe("verifyGoogleIdToken", () => {
  const nonce = "nonce-value";
  const seconds = Math.floor(now.getTime() / 1000);
  const claims = (overrides: Record<string, unknown> = {}) =>
    idTokenClaims(now, { nonce, ...overrides });
  const verifyToken = (token: string) =>
    verifyGoogleIdToken(token, { clientId, nonce, now, keys: googleKeys });
  const verify = async (
    overrides: Record<string, unknown> = {},
    signer: IdTokenSigner = "google",
  ) => verifyToken(await signedIdToken(claims(overrides), signer));

  it("returns the account from a valid token signed by Google", async () => {
    expect(await verify()).toEqual({
      sub: "google-sub-123",
      email: "alice@gmail.com",
    });
    expect(await verify({ iss: "accounts.google.com" })).not.toBeNull();
    expect(await verify({ azp: undefined })).not.toBeNull();
    expect(await verify({ email_verified: "true" })).not.toBeNull();
    // Within the clock tolerance.
    expect(await verify({ iat: seconds + 30 })).not.toBeNull();
    expect(await verify({ exp: seconds - 30 })).not.toBeNull();
  });

  describe("signature", () => {
    it("rejects a token signed by any other key, even with Google's key ID", async () => {
      expect(await verify({}, "attacker")).toBeNull();
    });

    it("rejects a token whose claims were altered after signing", async () => {
      const [header, , signature] = (await signedIdToken(claims())).split(".");
      const forged = Buffer.from(
        JSON.stringify(claims({ email: "bob@gmail.com" })),
      ).toString("base64url");
      expect(await verifyToken(`${header}.${forged}.${signature}`)).toBeNull();
    });

    it("rejects unsigned and alg=none tokens", async () => {
      expect(await verifyToken(unsignedIdToken(claims()))).toBeNull();
      const none = Buffer.from(JSON.stringify({ alg: "none" })).toString(
        "base64url",
      );
      const payload = unsignedIdToken(claims()).split(".")[1];
      expect(await verifyToken(`${none}.${payload}.`)).toBeNull();
    });

    it("rejects a symmetric token keyed with public material", async () => {
      const token = await new SignJWT(claims())
        .setProtectedHeader({ alg: "HS256", kid: googleKeyId })
        .sign(new TextEncoder().encode(clientId));
      expect(await verifyToken(token)).toBeNull();
    });

    it("rejects a key ID Google has not published", async () => {
      const token = await new SignJWT(claims())
        .setProtectedHeader({ alg: "RS256", kid: "unknown" })
        .sign(generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey);
      expect(await verifyToken(token)).toBeNull();
    });

    it("rejects malformed tokens", async () => {
      for (const token of ["", "abc", "a.!!!.c", "a.b.c.d"]) {
        expect(await verifyToken(token)).toBeNull();
      }
    });
  });

  it.each([
    ["another issuer", { iss: "https://evil.example" }],
    [
      "a look-alike issuer",
      { iss: "https://accounts.google.com.evil.example" },
    ],
    ["no issuer", { iss: undefined }],
    ["another audience", { aud: "other-client" }],
    ["no audience", { aud: undefined }],
    [
      "several audiences without azp",
      { aud: [clientId, "other"], azp: undefined },
    ],
    ["another authorized party", { azp: "other-client" }],
    ["an expired token", { exp: seconds - 120 }],
    ["no expiry", { exp: undefined }],
    ["a token issued in the future", { iat: seconds + 600 }],
    ["a token issued too long ago", { iat: seconds - 600 }],
    ["no issued-at", { iat: undefined }],
    ["another nonce", { nonce: "replayed" }],
    ["no nonce", { nonce: undefined }],
    ["no subject", { sub: undefined }],
    ["an empty subject", { sub: "" }],
    ["no email", { email: undefined }],
    ["an empty email", { email: "" }],
    ["a non-string email", { email: 42 }],
    ["an invalid email", { email: "not-an-email" }],
    ["an email with spaces", { email: "alice @gmail.com" }],
    ["an unverified email", { email_verified: false }],
    ["no email_verified", { email_verified: undefined }],
  ])("rejects %s", async (_name, override) => {
    expect(await verify(override)).toBeNull();
  });

  it("is what the client uses, with the client ID as audience", async () => {
    const google = createGoogleOAuthClient(config, vi.fn(), googleKeys);
    const token = await signedIdToken(claims());
    expect(await google.verifyIdToken(token, { nonce, now })).toEqual({
      sub: "google-sub-123",
      email: "alice@gmail.com",
    });
    const otherClient = createGoogleOAuthClient(
      { ...config, clientId: "other-client" },
      vi.fn(),
      googleKeys,
    );
    expect(await otherClient.verifyIdToken(token, { nonce, now })).toBeNull();
  });

  it("loads Google's published keys from Google by default", async () => {
    const fetchKeys = vi.fn(
      async () =>
        new Response(JSON.stringify({ keys: [googlePublicJwk] }), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchKeys);
    try {
      const google = createGoogleOAuthClient(config, vi.fn());
      const token = await signedIdToken(claims());
      expect(await google.verifyIdToken(token, { nonce, now })).not.toBeNull();
      expect(fetchKeys).toHaveBeenCalledWith(
        "https://www.googleapis.com/oauth2/v3/certs",
        expect.objectContaining({ method: "GET" }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects the token when Google's keys cannot be loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network down");
      }),
    );
    try {
      const google = createGoogleOAuthClient(config, vi.fn());
      const token = await signedIdToken(claims());
      expect(await google.verifyIdToken(token, { nonce, now })).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
