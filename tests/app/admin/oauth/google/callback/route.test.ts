// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/admin/oauth/google/callback/route";
import { startGmailConnection } from "@/lib/admin/gmailConnections";
import type { GoogleOAuthClient } from "@/lib/admin/googleOAuth";
import type { AdminStore } from "@/lib/admin/store";
import {
  createLocalTokenCipher,
  type TokenCipher,
} from "@/lib/admin/tokenCipher";
import { now, seedOwner, seedUser } from "@/tests/helpers/admin";
import {
  accessToken,
  createFakeGoogle,
  refreshToken,
  seedApprovedIdentity,
  stateFrom,
} from "@/tests/helpers/gmail";

const next = await vi.hoisted(async () => {
  const { createNextRequestMocks } =
    await import("@/tests/helpers/nextRequest");
  return {
    mocks: createNextRequestMocks(),
    store: undefined as AdminStore | undefined,
    google: null as GoogleOAuthClient | null,
    cipher: null as TokenCipher | null,
  };
});

vi.mock("next/headers", () => next.mocks.headers);
vi.mock("@/lib/admin/getAdminStore", () => ({
  getAdminStore: () => next.store,
}));
vi.mock("@/lib/admin/googleOAuth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/googleOAuth")>()),
  getGoogleOAuthClient: () => next.google,
}));
vi.mock("@/lib/admin/tokenCipher", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/tokenCipher")>()),
  getTokenCipher: () => next.cipher,
}));

let logs: string[];

beforeEach(() => {
  next.mocks.jar.clear();
  logs = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** The function URL host, as CloudFront forwards it. */
function request(query: Record<string, string>) {
  return new NextRequest(
    `https://abc.lambda-url.ap-south-1.on.aws/admin/oauth/google/callback?${new URLSearchParams(query)}`,
  );
}

async function setup(google = createFakeGoogle({ issuedAt: new Date() })) {
  const { store, owner } = await seedOwner();
  const alice = await seedUser(store, owner, "alice@example.com");
  const bob = await seedUser(store, owner, "bob@example.com");
  const identity = await seedApprovedIdentity(
    store,
    owner,
    alice.user,
    "alice@gmail.com",
  );
  next.store = store;
  next.google = google.client;
  next.cipher = createLocalTokenCipher();
  const started = await startGmailConnection(
    { store, google: google.client },
    alice.user,
    alice.token,
    identity.id,
    new Date(),
  );
  if (!started.ok) throw new Error("start failed");
  return {
    store,
    alice,
    bob,
    identity,
    google,
    state: stateFrom(started.authorizationUrl),
  };
}

function signIn(token: string) {
  next.mocks.jar.set("admin_session", { value: token });
}

async function expectResult(response: Response, location: string) {
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(location);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  const body = await response.text();
  for (const secret of [refreshToken, accessToken]) {
    expect(body + JSON.stringify([...response.headers])).not.toContain(secret);
  }
}

describe("GET /admin/oauth/google/callback", () => {
  it("connects the signed-in user's approved identity with a relative redirect", async () => {
    const context = await setup();
    signIn(context.alice.token);
    await expectResult(
      await GET(request({ state: context.state, code: "auth-code" })),
      "/admin?gmail=connected",
    );
    expect(
      await context.store.getGmailConnection(context.identity.id),
    ).toMatchObject({ status: "CONNECTED", userId: context.alice.user.id });
  });

  it("rejects a reused state", async () => {
    const context = await setup();
    signIn(context.alice.token);
    await GET(request({ state: context.state, code: "auth-code" }));
    await expectResult(
      await GET(request({ state: context.state, code: "auth-code" })),
      "/admin?gmail=invalid-state",
    );
    expect(context.google.calls.exchangeCode).toHaveLength(1);
  });

  it("ignores user and identity IDs in the query", async () => {
    const context = await setup();
    signIn(context.bob.token);
    await expectResult(
      await GET(
        request({
          state: context.state,
          code: "auth-code",
          userId: context.bob.user.id,
          senderIdentityId: context.identity.id,
        }),
      ),
      "/admin?gmail=invalid-state",
    );
    expect(
      await context.store.listGmailConnectionsForUser(context.bob.user.id),
    ).toEqual([]);
    expect(
      await context.store.getGmailConnection(context.identity.id),
    ).toBeNull();
  });

  it("sends a signed-out visitor to sign in", async () => {
    const context = await setup();
    await expectResult(
      await GET(request({ state: context.state, code: "auth-code" })),
      "/admin/login",
    );
  });

  it("reports a cancelled consent", async () => {
    const context = await setup();
    signIn(context.alice.token);
    await expectResult(
      await GET(request({ state: context.state, error: "access_denied" })),
      "/admin?gmail=denied",
    );
  });

  it("reports a mismatched Google account without connecting", async () => {
    const context = await setup(
      createFakeGoogle({ email: "other@gmail.com", issuedAt: new Date() }),
    );
    signIn(context.alice.token);
    await expectResult(
      await GET(request({ state: context.state, code: "auth-code" })),
      "/admin?gmail=email-mismatch",
    );
    expect(
      await context.store.getGmailConnection(context.identity.id),
    ).toBeNull();
  });

  it("refuses an ID token not signed by Google without connecting", async () => {
    const context = await setup(
      createFakeGoogle({ idTokenSigner: "attacker", issuedAt: new Date() }),
    );
    signIn(context.alice.token);
    await expectResult(
      await GET(request({ state: context.state, code: "auth-code" })),
      "/admin?gmail=failed",
    );
    expect(
      await context.store.getGmailConnection(context.identity.id),
    ).toBeNull();
  });

  it("reports an unconfigured server without touching the state", async () => {
    const context = await setup();
    next.google = null;
    signIn(context.alice.token);
    await expectResult(
      await GET(request({ state: context.state, code: "auth-code" })),
      "/admin?gmail=unavailable",
    );
  });

  it("logs only a fixed message on an unexpected error", async () => {
    const context = await setup();
    signIn(context.alice.token);
    next.store = {
      ...context.store,
      takeOAuthState: async () => {
        throw new Error(`boom ${refreshToken} ${context.state}`);
      },
    };
    await expectResult(
      await GET(request({ state: context.state, code: "auth-code-SECRET" })),
      "/admin?gmail=failed",
    );
    expect(logs).toEqual(["[admin] Gmail connection failed (Error)."]);
  });

  it("audits the result code only, never the code, state, or tokens", async () => {
    const context = await setup();
    signIn(context.alice.token);
    await GET(request({ state: context.state, code: "auth-code-SECRET" }));
    await GET(request({ state: context.state, code: "auth-code-SECRET" }));
    const trail = await context.store.listAuditEvents(context.alice.user.id, {
      after: null,
      limit: 10,
    });
    expect(trail.items).toHaveLength(2);
    expect(trail.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "gmail.connect",
          outcome: "failure",
          detail: { result: "invalid-state" },
        }),
        expect.objectContaining({
          action: "gmail.connect",
          outcome: "success",
          detail: { result: "connected" },
        }),
      ]),
    );
    const stored = JSON.stringify(trail);
    for (const secret of [
      "auth-code-SECRET",
      context.state,
      refreshToken,
      accessToken,
    ]) {
      expect(stored).not.toContain(secret);
    }
  });

  it("is dated by the server clock, not the query", async () => {
    vi.useFakeTimers({
      now: new Date(now.getTime() + 60 * 60 * 1000),
      toFake: ["Date"],
    });
    try {
      const context = await setup();
      vi.setSystemTime(new Date(Date.now() + 11 * 60 * 1000));
      signIn(context.alice.token);
      await expectResult(
        await GET(request({ state: context.state, code: "auth-code" })),
        "/admin?gmail=expired-state",
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
