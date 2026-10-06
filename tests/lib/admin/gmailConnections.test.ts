// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  completeGmailConnection,
  disconnectGmail,
  getGmailAccessToken,
  gmailNotice,
  listGmailAccounts,
  startGmailConnection,
  verifyGmailConnection,
} from "@/lib/admin/gmailConnections";
import { codeChallenge, gmailSendScope } from "@/lib/admin/googleOAuth";
import { oauthStateTtlMs, type PublicUser } from "@/lib/admin/model";
import {
  requestSenderIdentity,
  reviewSenderIdentity,
} from "@/lib/admin/senderIdentities";
import type { AdminStore } from "@/lib/admin/store";
import { createLocalTokenCipher } from "@/lib/admin/tokenCipher";
import { hashToken } from "@/lib/admin/tokens";
import { later, now, seedOwner, seedUser } from "@/tests/helpers/admin";
import {
  accessToken,
  createFakeGoogle,
  refreshToken,
  rotatedRefreshToken,
  seedApprovedIdentity,
  stateFrom,
} from "@/tests/helpers/gmail";

async function setup(google = createFakeGoogle()) {
  const { store, owner, ownerToken } = await seedOwner();
  const alice = await seedUser(store, owner, "alice@example.com");
  const bob = await seedUser(store, owner, "bob@example.com");
  const identity = await seedApprovedIdentity(
    store,
    owner,
    alice.user,
    "alice@gmail.com",
  );
  const cipher = createLocalTokenCipher();
  return {
    store,
    owner,
    ownerToken,
    alice,
    bob,
    identity,
    google,
    cipher,
    deps: { store, google: google.client, cipher },
  };
}

type Context = Awaited<ReturnType<typeof setup>>;

async function start(
  context: Context,
  actor: PublicUser = context.alice.user,
  sessionToken = context.alice.token,
  identityId = context.identity.id,
) {
  const result = await startGmailConnection(
    context.deps,
    actor,
    sessionToken,
    identityId,
    now,
  );
  if (!result.ok) throw new Error(`start failed: ${result.reason}`);
  return stateFrom(result.authorizationUrl);
}

function callback(
  context: Context,
  state: string,
  overrides: Partial<Parameters<typeof completeGmailConnection>[1]> = {},
  at = later(1000),
) {
  return completeGmailConnection(
    context.deps,
    {
      actor: context.alice.user,
      sessionToken: context.alice.token,
      state,
      code: "google-auth-code",
      error: null,
      ...overrides,
    },
    at,
  );
}

async function connect(context: Context) {
  expect(await callback(context, await start(context))).toBe("connected");
  const connection = await context.store.getGmailConnection(
    context.identity.id,
  );
  if (!connection) throw new Error("not connected");
  return connection;
}

function takeState(store: AdminStore, state: string) {
  return store.takeOAuthState(hashToken(state));
}

describe("starting a Gmail connection", () => {
  it("stores a hashed, short-lived state bound to the user, session, and identity", async () => {
    const context = await setup();
    const result = await startGmailConnection(
      context.deps,
      context.alice.user,
      context.alice.token,
      context.identity.id,
      now,
    );
    if (!result.ok) throw new Error("start failed");

    const [request] = context.google.calls.authorizationUrl;
    expect(request.loginHint).toBe("alice@gmail.com");
    expect(request.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(request.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(request.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const stored = await takeState(context.store, request.state);
    expect(stored).toEqual({
      stateHash: hashToken(request.state),
      userId: context.alice.user.id,
      sessionHash: hashToken(context.alice.token),
      senderIdentityId: context.identity.id,
      codeVerifier: request.codeVerifier,
      nonce: request.nonce,
      createdAt: now.toISOString(),
      expiresAt: later(oauthStateTtlMs).toISOString(),
    });
    expect(JSON.stringify(stored)).not.toContain(`"${request.state}"`);
  });

  it("generates an unpredictable state every time", async () => {
    const context = await setup();
    const states = new Set<string>();
    for (let index = 0; index < 20; index++) states.add(await start(context));
    expect(states.size).toBe(20);
  });

  it("refuses identities that are not approved", async () => {
    const context = await setup();
    await requestSenderIdentity(
      context.store,
      context.alice.user,
      "pending@gmail.com",
      now,
    );
    const pending = (
      await context.store.listSenderIdentitiesForUser(context.alice.user.id)
    ).find((identity) => identity.email === "pending@gmail.com");

    expect(
      await startGmailConnection(
        context.deps,
        context.alice.user,
        context.alice.token,
        pending?.id ?? "",
        now,
      ),
    ).toEqual({ ok: false, reason: "not-approved" });
    expect(context.google.calls.authorizationUrl).toHaveLength(0);
  });

  it("refuses another user's identity, even for the OWNER", async () => {
    const context = await setup();
    for (const [actor, token] of [
      [context.bob.user, context.bob.token],
      [context.owner, context.ownerToken],
    ] as const) {
      expect(
        await startGmailConnection(
          context.deps,
          actor,
          token,
          context.identity.id,
          now,
        ),
      ).toEqual({ ok: false, reason: "not-approved" });
    }
    expect(
      await startGmailConnection(
        context.deps,
        context.alice.user,
        context.alice.token,
        "missing-identity",
        now,
      ),
    ).toEqual({ ok: false, reason: "not-approved" });
    expect(context.google.calls.authorizationUrl).toHaveLength(0);
  });
});

describe("completing a Gmail connection", () => {
  it("exchanges the code with the PKCE verifier and stores an encrypted connection", async () => {
    const context = await setup();
    const state = await start(context);
    expect(await callback(context, state)).toBe("connected");

    const [request] = context.google.calls.authorizationUrl;
    expect(context.google.calls.exchangeCode).toEqual([
      { code: "google-auth-code", codeVerifier: request.codeVerifier },
    ]);
    expect(codeChallenge(request.codeVerifier)).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const connection = await context.store.getGmailConnection(
      context.identity.id,
    );
    expect(connection).toMatchObject({
      userId: context.alice.user.id,
      senderIdentityId: context.identity.id,
      provider: "GMAIL",
      email: "alice@gmail.com",
      providerAccountId: "google-sub-123",
      status: "CONNECTED",
      scopes: ["openid", "email", gmailSendScope],
      connectedAt: later(1000).toISOString(),
      lastValidatedAt: later(1000).toISOString(),
      disconnectedAt: null,
    });
    expect(connection?.credentials?.scheme).toBe("local");
    expect(JSON.stringify(connection)).not.toContain(refreshToken);
    expect(JSON.stringify(connection)).not.toContain(accessToken);
    expect(
      await context.cipher.decrypt(connection!.credentials!, {
        purpose: "gmail-oauth-refresh-token",
        userId: context.alice.user.id,
        senderIdentityId: context.identity.id,
      }),
    ).toBe(refreshToken);
  });

  it("accepts a state only once, whatever the first outcome", async () => {
    const context = await setup();
    const state = await start(context);
    expect(await callback(context, state)).toBe("connected");
    expect(await callback(context, state)).toBe("invalid-state");

    const denied = await start(context);
    expect(await callback(context, denied, { error: "access_denied" })).toBe(
      "denied",
    );
    expect(await callback(context, denied)).toBe("invalid-state");
    expect(context.google.calls.exchangeCode).toHaveLength(1);
  });

  it("rejects an expired state and invalidates it", async () => {
    const context = await setup();
    const state = await start(context);
    expect(await callback(context, state, {}, later(oauthStateTtlMs))).toBe(
      "expired-state",
    );
    expect(await callback(context, state)).toBe("invalid-state");
    expect(context.google.calls.exchangeCode).toHaveLength(0);
  });

  it("rejects missing, malformed, and unknown states", async () => {
    const context = await setup();
    for (const state of [null, "", "short", "a".repeat(43)]) {
      expect(await callback(context, state as string)).toBe("invalid-state");
    }
    expect(context.google.calls.exchangeCode).toHaveLength(0);
  });

  it("refuses a callback from another user's session (account-linking CSRF)", async () => {
    const context = await setup();
    const bobIdentity = await seedApprovedIdentity(
      context.store,
      context.owner,
      context.bob.user,
      "bob@gmail.com",
    );
    // Bob starts a flow and lures Alice into finishing it in her browser.
    const bobsState = await start(
      context,
      context.bob.user,
      context.bob.token,
      bobIdentity.id,
    );
    expect(await callback(context, bobsState)).toBe("invalid-state");
    expect(await context.store.getGmailConnection(bobIdentity.id)).toBeNull();
    expect(
      await context.store.listGmailConnectionsForUser(context.alice.user.id),
    ).toEqual([]);
    expect(context.google.calls.exchangeCode).toHaveLength(0);
  });

  it("refuses the same user with a different session", async () => {
    const context = await setup();
    const state = await start(context);
    expect(
      await callback(context, state, { sessionToken: "b".repeat(43) }),
    ).toBe("invalid-state");
  });

  it("sends a signed-out callback to sign in without connecting", async () => {
    const context = await setup();
    const state = await start(context);
    expect(
      await callback(context, state, { actor: null, sessionToken: undefined }),
    ).toBe("signed-out");
    expect(await callback(context, state)).toBe("invalid-state");
  });

  it("refuses an identity whose approval was withdrawn after starting", async () => {
    const context = await setup();
    const state = await start(context);
    await reviewSenderIdentity(
      context.store,
      context.owner,
      context.identity.id,
      "disable",
      null,
      now,
    );
    expect(await callback(context, state)).toBe("not-approved");
    expect(context.google.calls.exchangeCode).toHaveLength(0);
    expect(
      await context.store.getGmailConnection(context.identity.id),
    ).toBeNull();
  });

  it("does not associate a Google account whose address differs", async () => {
    const context = await setup(createFakeGoogle({ email: "bob@gmail.com" }));
    expect(await callback(context, await start(context))).toBe(
      "email-mismatch",
    );
    expect(
      await context.store.getGmailConnection(context.identity.id),
    ).toBeNull();
    expect(context.google.calls.revoke).toEqual([]);
  });

  it("matches addresses case-insensitively", async () => {
    const context = await setup(createFakeGoogle({ email: "Alice@Gmail.com" }));
    expect(await callback(context, await start(context))).toBe("connected");
  });

  it("refuses an unverified Google address", async () => {
    const context = await setup(createFakeGoogle({ emailVerified: false }));
    expect(await callback(context, await start(context))).toBe("failed");
    expect(
      await context.store.getGmailConnection(context.identity.id),
    ).toBeNull();
  });

  it.each([
    ["signed by a key Google never published", { idTokenSigner: "attacker" }],
    [
      "from another issuer",
      { idTokenOverrides: { iss: "https://evil.example" } },
    ],
    ["for another client", { idTokenOverrides: { aud: "other-client" } }],
    [
      "expired",
      { idTokenOverrides: { exp: Math.floor(now.getTime() / 1000) - 120 } },
    ],
    ["without an email", { idTokenOverrides: { email: undefined } }],
    ["with an invalid email", { idTokenOverrides: { email: "alice" } }],
    ["for another sign-in attempt", { idTokenOverrides: { nonce: "other" } }],
  ] as const)(
    "refuses an ID token %s, storing nothing",
    async (_name, options) => {
      const context = await setup(createFakeGoogle(options));
      expect(await callback(context, await start(context))).toBe("failed");
      expect(
        await context.store.getGmailConnection(context.identity.id),
      ).toBeNull();
    },
  );

  it("refuses a forged token claiming the approved address", async () => {
    // Valid claims for Alice's address, but not signed by Google.
    const context = await setup(
      createFakeGoogle({
        email: "alice@gmail.com",
        idTokenOverrides: { sub: "attacker-sub" },
        idTokenSigner: "attacker",
      }),
    );
    expect(await callback(context, await start(context))).toBe("failed");
    expect(
      await context.store.getGmailConnection(context.identity.id),
    ).toBeNull();
  });

  it("refuses a grant without gmail.send", async () => {
    const context = await setup(
      createFakeGoogle({ scopes: ["openid", "email"] }),
    );
    expect(await callback(context, await start(context))).toBe("scope-missing");
    expect(
      await context.store.getGmailConnection(context.identity.id),
    ).toBeNull();
  });

  it("refuses a grant without a refresh token", async () => {
    const context = await setup(createFakeGoogle({ refreshToken: null }));
    expect(await callback(context, await start(context))).toBe("failed");
  });

  it("reports a failed code exchange without storing anything", async () => {
    const context = await setup(
      createFakeGoogle({ exchangeError: "invalid_grant" }),
    );
    expect(await callback(context, await start(context))).toBe("failed");
    expect(
      await context.store.getGmailConnection(context.identity.id),
    ).toBeNull();
  });

  it("refuses a callback without a code", async () => {
    const context = await setup();
    expect(await callback(context, await start(context), { code: null })).toBe(
      "failed",
    );
  });

  it("reconnects in place, keeping the connection ID", async () => {
    const context = await setup();
    const first = await connect(context);
    await disconnectGmail(
      context.deps,
      context.alice.user,
      context.identity.id,
      later(2000),
    );
    expect(await callback(context, await start(context), {}, later(3000))).toBe(
      "connected",
    );
    expect(
      await context.store.getGmailConnection(context.identity.id),
    ).toMatchObject({
      id: first.id,
      createdAt: first.createdAt,
      status: "CONNECTED",
      disconnectedAt: null,
    });
  });
});

describe("listing Gmail accounts", () => {
  it("shows approval and Gmail authorization separately, own accounts only", async () => {
    const context = await setup();
    await seedApprovedIdentity(
      context.store,
      context.owner,
      context.bob.user,
      "bob@gmail.com",
    );
    await requestSenderIdentity(
      context.store,
      context.alice.user,
      "requested@gmail.com",
      now,
    );

    const before = await listGmailAccounts(context.store, context.alice.user);
    expect(before).toEqual([
      {
        identity: expect.objectContaining({
          email: "alice@gmail.com",
          status: "APPROVED",
        }),
        connection: null,
        usable: false,
      },
    ]);

    await connect(context);
    const [after] = await listGmailAccounts(context.store, context.alice.user);
    expect(after.usable).toBe(true);
    expect(after.connection?.status).toBe("CONNECTED");
    expect(after.connection).not.toHaveProperty("credentials");
    expect(JSON.stringify(after)).not.toMatch(/ciphertext|encryptedDataKey/);

    expect(
      (await listGmailAccounts(context.store, context.bob.user)).map(
        (account) => account.identity.email,
      ),
    ).toEqual(["bob@gmail.com"]);
  });

  it("is not usable once the OWNER disables the identity", async () => {
    const context = await setup();
    await connect(context);
    await reviewSenderIdentity(
      context.store,
      context.owner,
      context.identity.id,
      "disable",
      null,
      now,
    );
    const [account] = await listGmailAccounts(
      context.store,
      context.alice.user,
    );
    expect(account).toMatchObject({
      identity: { status: "DISABLED" },
      connection: { status: "CONNECTED" },
      usable: false,
    });
  });
});

describe("getting an access token (the sending gate)", () => {
  it("refreshes on demand without storing the access token", async () => {
    const context = await setup();
    await connect(context);
    const result = await getGmailAccessToken(
      context.deps,
      context.alice.user,
      "Alice@Gmail.com",
      later(5000),
    );
    expect(result).toEqual({
      ok: true,
      email: "alice@gmail.com",
      accessToken,
      expiresAt: new Date(later(5000).getTime() + 3599 * 1000),
    });
    expect(context.google.calls.refresh).toEqual([refreshToken]);
    const stored = await context.store.getGmailConnection(context.identity.id);
    expect(stored?.lastValidatedAt).toBe(later(5000).toISOString());
    expect(JSON.stringify(stored)).not.toContain(accessToken);
  });

  it("re-encrypts a rotated refresh token", async () => {
    const context = await setup(createFakeGoogle({ refreshRotates: true }));
    await connect(context);
    await getGmailAccessToken(
      context.deps,
      context.alice.user,
      "alice@gmail.com",
      later(5000),
    );
    const stored = await context.store.getGmailConnection(context.identity.id);
    expect(
      await context.cipher.decrypt(stored!.credentials!, {
        purpose: "gmail-oauth-refresh-token",
        userId: context.alice.user.id,
        senderIdentityId: context.identity.id,
      }),
    ).toBe(rotatedRefreshToken);
  });

  it("requires sender approval even with a live connection", async () => {
    const context = await setup();
    await connect(context);
    await reviewSenderIdentity(
      context.store,
      context.owner,
      context.identity.id,
      "disable",
      null,
      now,
    );
    expect(
      await getGmailAccessToken(
        context.deps,
        context.alice.user,
        "alice@gmail.com",
        later(5000),
      ),
    ).toEqual({ ok: false, reason: "not-approved" });
    expect(context.google.calls.refresh).toHaveLength(0);
  });

  it("requires a Gmail connection even when approved", async () => {
    const context = await setup();
    expect(
      await getGmailAccessToken(
        context.deps,
        context.alice.user,
        "alice@gmail.com",
        now,
      ),
    ).toEqual({ ok: false, reason: "not-connected" });
  });

  it("never hands one user's credentials to another", async () => {
    const context = await setup();
    await connect(context);
    for (const actor of [context.bob.user, context.owner]) {
      expect(
        await getGmailAccessToken(context.deps, actor, "alice@gmail.com", now),
      ).toEqual({ ok: false, reason: "not-approved" });
    }
    expect(context.google.calls.refresh).toHaveLength(0);
  });

  it("marks a revoked grant REAUTH_REQUIRED, deletes it, and stops retrying", async () => {
    const context = await setup(
      createFakeGoogle({ refreshError: "invalid_grant" }),
    );
    await connect(context);
    const access = () =>
      getGmailAccessToken(
        context.deps,
        context.alice.user,
        "alice@gmail.com",
        later(5000),
      );

    expect(await access()).toEqual({ ok: false, reason: "reauth-required" });
    expect(
      await context.store.getGmailConnection(context.identity.id),
    ).toMatchObject({ status: "REAUTH_REQUIRED", credentials: null });

    expect(await access()).toEqual({ ok: false, reason: "reauth-required" });
    expect(context.google.calls.refresh).toHaveLength(1);
  });

  it("keeps the connection on a transient Google failure", async () => {
    const context = await setup(
      createFakeGoogle({ refreshError: "unavailable" }),
    );
    const before = await connect(context);
    expect(
      await getGmailAccessToken(
        context.deps,
        context.alice.user,
        "alice@gmail.com",
        later(5000),
      ),
    ).toEqual({ ok: false, reason: "unavailable" });
    expect(await context.store.getGmailConnection(context.identity.id)).toEqual(
      before,
    );
  });

  it("requires reauthorization when gmail.send is no longer granted", async () => {
    const context = await setup(
      createFakeGoogle({ refreshScopes: ["openid", "email"] }),
    );
    await connect(context);
    expect(
      await getGmailAccessToken(
        context.deps,
        context.alice.user,
        "alice@gmail.com",
        later(5000),
      ),
    ).toEqual({ ok: false, reason: "reauth-required" });
  });

  it("requires reauthorization when the stored credential cannot be decrypted", async () => {
    const context = await setup();
    await connect(context);
    const restarted = { ...context.deps, cipher: createLocalTokenCipher() };
    expect(
      await getGmailAccessToken(
        restarted,
        context.alice.user,
        "alice@gmail.com",
        later(5000),
      ),
    ).toEqual({ ok: false, reason: "reauth-required" });
    expect(context.google.calls.refresh).toHaveLength(0);
  });

  it("refuses a credential moved to another user's record", async () => {
    const context = await setup();
    const alices = await connect(context);
    const bobIdentity = await seedApprovedIdentity(
      context.store,
      context.owner,
      context.bob.user,
      "bob@gmail.com",
    );
    // A tampered table: Alice's ciphertext copied onto Bob's connection.
    await context.store.saveGmailConnection({
      ...alices,
      id: "forged",
      userId: context.bob.user.id,
      senderIdentityId: bobIdentity.id,
      email: "bob@gmail.com",
    });
    expect(
      await getGmailAccessToken(
        context.deps,
        context.bob.user,
        "bob@gmail.com",
        later(5000),
      ),
    ).toEqual({ ok: false, reason: "reauth-required" });
    expect(context.google.calls.refresh).toHaveLength(0);
  });
});

describe("verifying a connection", () => {
  it("reports a working connection and records the check", async () => {
    const context = await setup();
    await connect(context);
    expect(
      await verifyGmailConnection(
        context.deps,
        context.alice.user,
        context.identity.id,
        later(9000),
      ),
    ).toBe("verified");
    expect(
      (await context.store.getGmailConnection(context.identity.id))
        ?.lastValidatedAt,
    ).toBe(later(9000).toISOString());
  });

  it("detects revocation", async () => {
    const context = await setup(
      createFakeGoogle({ refreshError: "invalid_grant" }),
    );
    await connect(context);
    expect(
      await verifyGmailConnection(
        context.deps,
        context.alice.user,
        context.identity.id,
        now,
      ),
    ).toBe("reauth-required");
  });

  it("reports an unreachable Google without changing anything", async () => {
    const context = await setup(
      createFakeGoogle({ refreshError: "unavailable" }),
    );
    await connect(context);
    expect(
      await verifyGmailConnection(
        context.deps,
        context.alice.user,
        context.identity.id,
        now,
      ),
    ).toBe("check-failed");
  });

  it("does not let another user check someone's connection", async () => {
    const context = await setup();
    await connect(context);
    for (const actor of [context.bob.user, context.owner]) {
      expect(
        await verifyGmailConnection(
          context.deps,
          actor,
          context.identity.id,
          now,
        ),
      ).toBe("not-found");
    }
    expect(context.google.calls.refresh).toHaveLength(0);
  });
});

describe("disconnecting", () => {
  it("revokes at Google, deletes the credential, and marks it DISCONNECTED", async () => {
    const context = await setup();
    await connect(context);
    expect(
      await disconnectGmail(
        context.deps,
        context.alice.user,
        context.identity.id,
        later(7000),
      ),
    ).toBe("disconnected");
    expect(context.google.calls.revoke).toEqual([refreshToken]);
    expect(
      await context.store.getGmailConnection(context.identity.id),
    ).toMatchObject({
      status: "DISCONNECTED",
      credentials: null,
      disconnectedAt: later(7000).toISOString(),
    });
    expect(
      await getGmailAccessToken(
        context.deps,
        context.alice.user,
        "alice@gmail.com",
        later(8000),
      ),
    ).toEqual({ ok: false, reason: "not-connected" });
  });

  it("still removes the credential when Google cannot be reached", async () => {
    const context = await setup(createFakeGoogle({ revokeResult: "throw" }));
    await connect(context);
    expect(
      await disconnectGmail(
        context.deps,
        context.alice.user,
        context.identity.id,
        now,
      ),
    ).toBe("disconnected-locally");
    expect(
      await context.store.getGmailConnection(context.identity.id),
    ).toMatchObject({ status: "DISCONNECTED", credentials: null });
  });

  it("works without Google or KMS configured", async () => {
    const context = await setup();
    await connect(context);
    expect(
      await disconnectGmail(
        { store: context.store, google: null, cipher: null },
        context.alice.user,
        context.identity.id,
        now,
      ),
    ).toBe("disconnected-locally");
    expect(
      (await context.store.getGmailConnection(context.identity.id))
        ?.credentials,
    ).toBeNull();
  });

  it("does not let another user disconnect someone's connection", async () => {
    const context = await setup();
    await connect(context);
    for (const actor of [context.bob.user, context.owner]) {
      expect(
        await disconnectGmail(context.deps, actor, context.identity.id, now),
      ).toBe("not-found");
    }
    expect(
      (await context.store.getGmailConnection(context.identity.id))?.status,
    ).toBe("CONNECTED");
    expect(context.google.calls.revoke).toEqual([]);
  });
});

describe("result notices", () => {
  it("maps only known codes to fixed messages", () => {
    expect(gmailNotice("connected")).toEqual({
      status: "success",
      message: "Gmail is connected for this address.",
    });
    for (const code of [
      undefined,
      "",
      "__proto__",
      "toString",
      "<script>",
      ["connected"],
    ]) {
      expect(gmailNotice(code)).toBeNull();
    }
  });
});
