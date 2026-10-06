// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as actions from "@/lib/admin/actions";
import { idleFormState } from "@/lib/admin/formState";
import type { GmailClient } from "@/lib/admin/gmailApi";
import { completeGmailConnection } from "@/lib/admin/gmailConnections";
import type { GoogleOAuthClient } from "@/lib/admin/googleOAuth";
import { createMemoryStore } from "@/lib/admin/memoryStore";
import type { ScheduleTriggers } from "@/lib/admin/scheduler";
import { newOperationId } from "@/lib/admin/sending";
import type { AdminStore } from "@/lib/admin/store";
import {
  createLocalTokenCipher,
  type TokenCipher,
} from "@/lib/admin/tokenCipher";
import { hashToken } from "@/lib/admin/tokens";
import {
  accessToken,
  createFakeGoogle,
  refreshToken,
  seedApprovedIdentity,
  stateFrom,
} from "@/tests/helpers/gmail";
import {
  ownerPassword,
  seedOwner,
  seedUser,
  setupToken,
  userPassword,
} from "@/tests/helpers/admin";
import { createFakeGmail, seedConnectedSender } from "@/tests/helpers/mail";
import { NavigationSignal } from "@/tests/helpers/nextRequest";
import { createScheduleTriggers } from "@/tests/helpers/schedule";

const next = await vi.hoisted(async () => {
  const { createNextRequestMocks } =
    await import("@/tests/helpers/nextRequest");
  return {
    mocks: createNextRequestMocks(),
    store: undefined as AdminStore | undefined,
    google: null as GoogleOAuthClient | null,
    cipher: null as TokenCipher | null,
    gmail: null as GmailClient | null,
    triggers: null as ScheduleTriggers | null,
  };
});

vi.mock("next/headers", () => next.mocks.headers);
vi.mock("next/navigation", () => next.mocks.navigation);
vi.mock("next/cache", () => next.mocks.cache);
vi.mock("next/server", () => next.mocks.server);
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
vi.mock("@/lib/admin/gmailApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/gmailApi")>()),
  getGmailClient: () => next.gmail,
}));
vi.mock("@/lib/admin/scheduler", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/scheduler")>()),
  getScheduleTriggers: () => next.triggers,
}));

function jar() {
  return next.mocks.jar;
}

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
}

function signIn(token: string) {
  jar().set("admin_session", { value: token });
}

async function navigation(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(NavigationSignal);
  return (error as InstanceType<typeof NavigationSignal>).to;
}

let logs: string[];

beforeEach(() => {
  jar().clear();
  next.google = null;
  next.cipher = null;
  next.gmail = null;
  next.triggers = null;
  logs = [];
  for (const method of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("loginAction", () => {
  it("sets a secure session cookie and redirects to the console", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { store } = await seedOwner();
    next.store = store;

    expect(
      await navigation(
        actions.loginAction(
          idleFormState,
          form({ email: " OWNER@example.com ", password: ownerPassword }),
        ),
      ),
    ).toBe("/admin");

    const cookie = jar().get("admin_session");
    expect(cookie?.options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/admin",
    });
    expect(
      await store.getSession(hashToken(cookie?.value ?? "")),
    ).not.toBeNull();
  });

  it("answers a wrong password generically and sets no cookie", async () => {
    next.store = (await seedOwner()).store;
    const state = await actions.loginAction(
      idleFormState,
      form({ email: "owner@example.com", password: "wrong password" }),
    );

    expect(state).toEqual({
      status: "error",
      message: "Invalid email or password.",
      values: { email: "owner@example.com" },
    });
    expect(jar().has("admin_session")).toBe(false);
  });

  it("handles malformed input without throwing", async () => {
    next.store = (await seedOwner()).store;
    const data = new FormData();
    data.append("email", new Blob(["x"]));
    expect(await actions.loginAction(idleFormState, data)).toMatchObject({
      status: "error",
      fieldErrors: {
        email: "Enter your email address.",
        password: "Enter your password.",
      },
    });
  });

  it("logs only a fixed message when the store fails", async () => {
    const { store } = await seedOwner();
    next.store = {
      ...store,
      getFailedAttempts: async () => {
        throw new Error(`leak ${ownerPassword}`);
      },
    };

    expect(
      await actions.loginAction(
        idleFormState,
        form({ email: "owner@example.com", password: ownerPassword }),
      ),
    ).toMatchObject({ status: "error" });
    expect(logs).toEqual(["[admin] Login failed (Error)."]);
  });
});

describe("logoutAction", () => {
  it("deletes the session and clears the cookie", async () => {
    const { store, ownerToken } = await seedOwner();
    next.store = store;
    signIn(ownerToken);

    expect(await navigation(actions.logoutAction())).toBe("/admin/login");
    expect(await store.getSession(hashToken(ownerToken))).toBeNull();
    expect(jar().get("admin_session")).toMatchObject({
      value: "",
      options: { expires: new Date(0), path: "/admin" },
    });
  });
});

describe("authorization", () => {
  it("sends unauthenticated and expired sessions to the login page", async () => {
    next.store = (await seedOwner()).store;
    expect(
      await navigation(
        actions.createInvitationAction(
          idleFormState,
          form({ email: "a@b.co" }),
        ),
      ),
    ).toBe("/admin/login");

    signIn("a".repeat(43));
    expect(
      await navigation(
        actions.requestSenderIdentityAction(
          idleFormState,
          form({ email: "a@b.co" }),
        ),
      ),
    ).toBe("/admin/login");
  });

  it("does not let a USER invite, even claiming the OWNER role", async () => {
    const { store, owner } = await seedOwner();
    const { token } = await seedUser(store, owner, "friend@example.com");
    next.store = store;
    signIn(token);

    const state = await actions.createInvitationAction(
      idleFormState,
      form({ email: "other@example.com", role: "OWNER", userId: owner.id }),
    );
    expect(state).toMatchObject({
      status: "error",
      message: "Only the owner can invite users.",
    });
    expect(state).not.toHaveProperty("invitationPath");
    expect(await store.listInvitations()).toHaveLength(1);
  });

  it("always invites a USER, whatever role the form asks for", async () => {
    const { store, ownerToken } = await seedOwner();
    next.store = store;
    signIn(ownerToken);

    const state = await actions.createInvitationAction(
      idleFormState,
      form({ email: "friend@example.com", role: "OWNER" }),
    );
    expect(state.status).toBe("success");
    expect(state.invitationPath).toMatch(
      /^\/admin\/invite\/[A-Za-z0-9_-]{43}$/,
    );
    expect((await store.listInvitations())[0].role).toBe("USER");
  });

  it("creates a USER on acceptance, ignoring role and email in the form", async () => {
    const { store, ownerToken } = await seedOwner();
    next.store = store;
    signIn(ownerToken);
    const { invitationPath } = await actions.createInvitationAction(
      idleFormState,
      form({ email: "friend@example.com" }),
    );
    const token = invitationPath?.split("/").pop() ?? "";
    jar().clear();

    expect(
      await navigation(
        actions.acceptInvitationAction(
          idleFormState,
          form({
            token,
            name: "Friend",
            password: userPassword,
            confirmPassword: userPassword,
            role: "OWNER",
            email: "attacker@example.com",
          }),
        ),
      ),
    ).toBe("/admin");

    const created = await store.getUserByEmail("friend@example.com");
    expect(created).toMatchObject({ role: "USER", status: "ACTIVE" });
    expect(await store.getUserByEmail("attacker@example.com")).toBeNull();
    expect(
      (await store.listUsers()).filter((user) => user.role === "OWNER"),
    ).toHaveLength(1);
  });

  it("does not let a USER change user statuses or review identities", async () => {
    const { store, owner } = await seedOwner();
    const { user: alice, token } = await seedUser(
      store,
      owner,
      "alice@example.com",
    );
    const { user: bob } = await seedUser(store, owner, "bob@example.com");
    await store.createSenderIdentity({
      id: "s1",
      userId: alice.id,
      email: "alice@gmail.com",
      provider: "GMAIL",
      status: "REQUESTED",
      requestedAt: new Date().toISOString(),
      reviewedAt: null,
      reviewedBy: null,
      rejectionReason: null,
    });
    next.store = store;
    signIn(token);

    await actions.setUserStatusAction(
      form({ userId: bob.id, status: "DISABLED" }),
    );
    await actions.setUserStatusAction(
      form({ userId: owner.id, status: "DISABLED" }),
    );
    await actions.reviewSenderIdentityAction(
      form({ identityId: "s1", decision: "approve", role: "OWNER" }),
    );

    expect((await store.getUserById(bob.id))?.status).toBe("ACTIVE");
    expect((await store.getUserById(owner.id))?.status).toBe("ACTIVE");
    expect((await store.getSenderIdentity("s1"))?.status).toBe("REQUESTED");
  });

  it("assigns a requested identity to the signed-in user, not a userId in the form", async () => {
    const { store, owner } = await seedOwner();
    const { user: alice, token } = await seedUser(
      store,
      owner,
      "alice@example.com",
    );
    const { user: bob } = await seedUser(store, owner, "bob@example.com");
    next.store = store;
    signIn(token);

    const state = await actions.requestSenderIdentityAction(
      idleFormState,
      form({ email: "Alice@Gmail.com", userId: bob.id }),
    );
    expect(state.status).toBe("success");
    const [identity] = await store.listSenderIdentities();
    expect(identity).toMatchObject({
      userId: alice.id,
      email: "alice@gmail.com",
      status: "REQUESTED",
    });
    expect(await store.listSenderIdentitiesForUser(bob.id)).toEqual([]);
  });

  it("ignores malformed review and status requests from the OWNER", async () => {
    const { store, owner, ownerToken } = await seedOwner();
    const { user } = await seedUser(store, owner, "friend@example.com");
    next.store = store;
    signIn(ownerToken);

    await actions.setUserStatusAction(
      form({ userId: user.id, status: "OWNER" }),
    );
    await actions.reviewSenderIdentityAction(
      form({ identityId: "missing", decision: "delete" }),
    );
    expect((await store.getUserById(user.id))?.status).toBe("ACTIVE");
  });
});

describe("setupOwnerAction", () => {
  it("creates the owner once, then refuses", async () => {
    vi.stubEnv("ADMIN_BOOTSTRAP_TOKEN", setupToken);
    next.store = createMemoryStore();
    const input = {
      setupToken,
      email: "owner@example.com",
      name: "Owner",
      password: ownerPassword,
      confirmPassword: ownerPassword,
    };

    expect(
      await navigation(actions.setupOwnerAction(idleFormState, form(input))),
    ).toBe("/admin");
    expect(
      await actions.setupOwnerAction(
        idleFormState,
        form({ ...input, email: "second@example.com" }),
      ),
    ).toMatchObject({ status: "error", message: "Setup is not available." });
  });
});

describe("Gmail actions", () => {
  async function gmailSetup() {
    const { store, owner, ownerToken } = await seedOwner();
    const alice = await seedUser(store, owner, "alice@example.com");
    const bob = await seedUser(store, owner, "bob@example.com");
    const identity = await seedApprovedIdentity(
      store,
      owner,
      alice.user,
      "alice@gmail.com",
    );
    const google = createFakeGoogle({ issuedAt: new Date() });
    next.store = store;
    next.google = google.client;
    next.cipher = createLocalTokenCipher();
    return { store, owner, ownerToken, alice, bob, identity, google };
  }

  async function connectAlice(context: Awaited<ReturnType<typeof gmailSetup>>) {
    signIn(context.alice.token);
    const url = await navigation(
      actions.startGmailConnectionAction(
        form({ identityId: context.identity.id }),
      ),
    );
    expect(
      await completeGmailConnection(
        {
          store: context.store,
          google: context.google.client,
          cipher: next.cipher!,
        },
        {
          actor: context.alice.user,
          sessionToken: context.alice.token,
          state: stateFrom(url),
          code: "code",
          error: null,
        },
        new Date(),
      ),
    ).toBe("connected");
  }

  it("sends the user to Google for their own approved identity", async () => {
    const context = await gmailSetup();
    signIn(context.alice.token);
    const url = await navigation(
      actions.startGmailConnectionAction(
        form({ identityId: context.identity.id, userId: context.bob.user.id }),
      ),
    );

    expect(url).toMatch(/^https:\/\/accounts\.google\.com\//);
    const state = await context.store.takeOAuthState(hashToken(stateFrom(url)));
    expect(state).toMatchObject({
      userId: context.alice.user.id,
      sessionHash: hashToken(context.alice.token),
      senderIdentityId: context.identity.id,
    });
  });

  it("refuses to start for another user's identity", async () => {
    const context = await gmailSetup();
    signIn(context.bob.token);
    expect(
      await navigation(
        actions.startGmailConnectionAction(
          form({ identityId: context.identity.id }),
        ),
      ),
    ).toBe("/admin?gmail=not-approved");
    expect(context.google.calls.authorizationUrl).toHaveLength(0);
  });

  it("requires a session", async () => {
    await gmailSetup();
    for (const action of [
      actions.startGmailConnectionAction,
      actions.verifyGmailConnectionAction,
      actions.disconnectGmailAction,
    ]) {
      expect(await navigation(action(form({ identityId: "x" })))).toBe(
        "/admin/login",
      );
    }
  });

  it("reports an unconfigured server instead of starting", async () => {
    const context = await gmailSetup();
    next.google = null;
    signIn(context.alice.token);
    expect(
      await navigation(
        actions.startGmailConnectionAction(
          form({ identityId: context.identity.id }),
        ),
      ),
    ).toBe("/admin?gmail=unavailable");
  });

  it("checks and disconnects only the user's own connection", async () => {
    const context = await gmailSetup();
    await connectAlice(context);

    signIn(context.bob.token);
    for (const action of [
      actions.verifyGmailConnectionAction,
      actions.disconnectGmailAction,
    ]) {
      expect(
        await navigation(action(form({ identityId: context.identity.id }))),
      ).toBe("/admin?gmail=not-found");
    }
    expect(
      (await context.store.getGmailConnection(context.identity.id))?.status,
    ).toBe("CONNECTED");

    signIn(context.alice.token);
    expect(
      await navigation(
        actions.verifyGmailConnectionAction(
          form({ identityId: context.identity.id }),
        ),
      ),
    ).toBe("/admin?gmail=verified");
    expect(
      await navigation(
        actions.disconnectGmailAction(
          form({ identityId: context.identity.id }),
        ),
      ),
    ).toBe("/admin?gmail=disconnected");
    expect(
      await context.store.getGmailConnection(context.identity.id),
    ).toMatchObject({ status: "DISCONNECTED", credentials: null });
  });

  it("never returns or logs OAuth credentials", async () => {
    const context = await gmailSetup();
    await connectAlice(context);
    const destinations = [
      await navigation(
        actions.verifyGmailConnectionAction(
          form({ identityId: context.identity.id }),
        ),
      ),
    ];

    next.store = {
      ...context.store,
      getGmailConnection: async () => {
        throw new Error(`leak ${refreshToken} ${accessToken}`);
      },
    };
    destinations.push(
      await navigation(
        actions.verifyGmailConnectionAction(
          form({ identityId: context.identity.id }),
        ),
      ),
      await navigation(
        actions.disconnectGmailAction(
          form({ identityId: context.identity.id }),
        ),
      ),
    );

    const output = destinations.join("\n") + logs.join("\n");
    expect(output).not.toContain(refreshToken);
    expect(output).not.toContain(accessToken);
    expect(output).not.toMatch(/ciphertext|encryptedDataKey|ya29|1\/\//);
    expect(logs).toEqual([
      "[admin] Gmail connection check failed (Error).",
      "[admin] Gmail disconnect failed (Error).",
    ]);
  });
});

describe("mail actions", () => {
  async function mailSetup() {
    const { store, owner, ownerToken } = await seedOwner();
    const alice = await seedUser(store, owner, "alice@example.com");
    const bob = await seedUser(store, owner, "bob@example.com");
    const cipher = createLocalTokenCipher();
    const { identity } = await seedConnectedSender(
      store,
      cipher,
      owner,
      alice.user,
      "alice@gmail.com",
    );
    const google = createFakeGoogle({ issuedAt: new Date() });
    const gmail = createFakeGmail();
    next.store = store;
    next.google = google.client;
    next.cipher = cipher;
    next.gmail = gmail.client;
    return { store, owner, ownerToken, alice, bob, identity, gmail };
  }

  function compose(values: Record<string, string>) {
    return form({
      operationId: newOperationId(new Date()),
      subject: "Hello",
      body: "Hi there",
      ...values,
    });
  }

  it("requires a session for every mail action", async () => {
    await mailSetup();
    const attempts = [
      actions.saveContactAction(idleFormState, form({})),
      actions.deleteContactAction(form({})),
      actions.saveTemplateAction(idleFormState, form({})),
      actions.deleteTemplateAction(form({})),
      actions.sendEmailAction(
        { status: "idle", operationId: "" },
        compose({ emails: "x@example.com" }),
      ),
      actions.updateUserSettingsAction(idleFormState, form({})),
    ];
    for (const attempt of attempts) {
      expect(await navigation(attempt)).toBe("/admin/login");
    }
  });

  it("saves contacts and templates for the signed-in user, not a userId in the form", async () => {
    const context = await mailSetup();
    signIn(context.alice.token);
    expect(
      await actions.saveContactAction(
        idleFormState,
        form({
          name: "Rahul",
          email: "Rahul@Example.com",
          userId: context.bob.user.id,
        }),
      ),
    ).toMatchObject({ status: "success" });
    expect(
      await actions.saveTemplateAction(
        idleFormState,
        form({
          name: "Hello",
          subject: "Hi {{name}}",
          body: "Hello {{name}}",
          userId: context.bob.user.id,
        }),
      ),
    ).toMatchObject({ status: "success" });

    expect(await context.store.listContacts(context.bob.user.id)).toEqual([]);
    expect(await context.store.listTemplates(context.bob.user.id)).toEqual([]);
    expect(await context.store.listContacts(context.alice.user.id)).toEqual([
      expect.objectContaining({ email: "rahul@example.com" }),
    ]);
  });

  it("cannot edit or delete another user's contact or template", async () => {
    const context = await mailSetup();
    signIn(context.alice.token);
    await actions.saveContactAction(
      idleFormState,
      form({ name: "Rahul", email: "rahul@example.com" }),
    );
    await actions.saveTemplateAction(
      idleFormState,
      form({ name: "Hello", subject: "Hi", body: "Hello" }),
    );
    const [contact] = await context.store.listContacts(context.alice.user.id);
    const [template] = await context.store.listTemplates(context.alice.user.id);

    signIn(context.bob.token);
    expect(
      await actions.saveContactAction(
        idleFormState,
        form({ contactId: contact.id, name: "Bob's", email: "b@example.com" }),
      ),
    ).toMatchObject({
      status: "error",
      message: "That contact was not found.",
    });
    expect(
      await actions.saveTemplateAction(
        idleFormState,
        form({ templateId: template.id, name: "X", subject: "X", body: "X" }),
      ),
    ).toMatchObject({
      status: "error",
      message: "That template was not found.",
    });
    await actions.deleteContactAction(form({ contactId: contact.id }));
    await actions.deleteTemplateAction(form({ templateId: template.id }));

    expect(
      await context.store.getContact(context.alice.user.id, contact.id),
    ).toEqual(contact);
    expect(
      await context.store.getTemplate(context.alice.user.id, template.id),
    ).toEqual(template);
  });

  it("rejects a template with an unknown placeholder", async () => {
    const context = await mailSetup();
    signIn(context.alice.token);
    const state = await actions.saveTemplateAction(
      idleFormState,
      form({ name: "Bad", subject: "Hi {{first_name}}", body: "Hello" }),
    );
    expect(state.status).toBe("error");
    expect(state.fieldErrors?.subject).toMatch(/first_name/);
    expect(await context.store.listTemplates(context.alice.user.id)).toEqual(
      [],
    );
  });

  it("sends from the user's own identity, ignoring From and userId fields", async () => {
    const context = await mailSetup();
    signIn(context.alice.token);
    const operationId = newOperationId(new Date());
    const state = await actions.sendEmailAction(
      { status: "idle", operationId },
      compose({
        operationId,
        senderIdentityId: context.identity.id,
        emails: "rahul@example.com",
        from: "ceo@example.com",
        userId: context.bob.user.id,
      }),
    );

    expect(state).toMatchObject({
      status: "success",
      message: "Sent 1 email.",
    });
    expect(state.operationId).not.toBe(operationId);
    const [message] = context.gmail.messages();
    expect(message.headers.From).toBe("alice@gmail.com");
    expect(message.headers.To).toBe("rahul@example.com");
    expect(
      await context.store.listRecentSendRecords(context.alice.user.id, 10),
    ).toHaveLength(1);
    expect(
      await context.store.listRecentSendRecords(context.bob.user.id, 10),
    ).toEqual([]);
  });

  it("refuses to send from another user's identity", async () => {
    const context = await mailSetup();
    signIn(context.bob.token);
    const state = await actions.sendEmailAction(
      { status: "idle", operationId: "" },
      compose({
        senderIdentityId: context.identity.id,
        emails: "rahul@example.com",
      }),
    );
    expect(state.status).toBe("error");
    expect(context.gmail.calls).toHaveLength(0);
  });

  it("keeps the operation ID when a send is refused or invalid", async () => {
    const context = await mailSetup();
    signIn(context.alice.token);
    const operationId = newOperationId(new Date());
    const invalid = await actions.sendEmailAction(
      { status: "idle", operationId },
      form({ operationId, senderIdentityId: context.identity.id }),
    );
    expect(invalid).toMatchObject({ status: "error", operationId });
    expect(invalid.fieldErrors?.recipients).toBeDefined();

    const stale = await actions.sendEmailAction(
      { status: "idle", operationId },
      compose({
        operationId: "forged",
        senderIdentityId: context.identity.id,
        emails: "rahul@example.com",
      }),
    );
    expect(stale).toMatchObject({ status: "error", operationId });
    expect(context.gmail.calls).toHaveLength(0);
  });

  it("does not send twice when the same form is submitted again", async () => {
    const context = await mailSetup();
    signIn(context.alice.token);
    const operationId = newOperationId(new Date());
    const submit = () =>
      actions.sendEmailAction(
        { status: "idle", operationId },
        compose({
          operationId,
          senderIdentityId: context.identity.id,
          emails: "rahul@example.com",
        }),
      );
    await submit();
    const again = await submit();
    expect(again.results).toEqual([
      expect.objectContaining({ status: "ALREADY_SENT" }),
    ]);
    expect(context.gmail.calls).toHaveLength(1);
  });

  it("reports an unconfigured server without sending", async () => {
    const context = await mailSetup();
    next.google = null;
    signIn(context.alice.token);
    expect(
      await actions.sendEmailAction(
        { status: "idle", operationId: "" },
        compose({
          senderIdentityId: context.identity.id,
          emails: "rahul@example.com",
        }),
      ),
    ).toMatchObject({
      status: "error",
      message: "Gmail is not configured on this server. Nothing was sent.",
    });
    expect(context.gmail.calls).toHaveLength(0);
  });

  it("lets only the OWNER change sending settings", async () => {
    const context = await mailSetup();
    const settings = form({
      userId: context.alice.user.id,
      sendingEnabled: "on",
      dailyTotalEmails: "500",
      dailyBulkRecipients: "500",
      maxBulkRecipientsPerOperation: "20",
      maxScheduledEmails: "20",
      maxRecurringSchedules: "5",
      maxFutureSchedulingWindowDays: "30",
    });

    signIn(context.alice.token);
    expect(
      await actions.updateUserSettingsAction(idleFormState, settings),
    ).toMatchObject({
      status: "error",
      message: "Only the owner can change sending settings.",
    });
    expect(
      await context.store.getUserSettings(context.alice.user.id),
    ).toBeNull();

    signIn(context.ownerToken);
    expect(
      await actions.updateUserSettingsAction(idleFormState, settings),
    ).toMatchObject({ status: "success" });
    expect(
      await context.store.getUserSettings(context.alice.user.id),
    ).toMatchObject({
      sendingEnabled: true,
      bulkSendingEnabled: false,
      dailyTotalEmails: 500,
      updatedBy: context.owner.id,
    });
  });

  it("never returns or logs tokens or message bodies", async () => {
    const context = await mailSetup();
    signIn(context.alice.token);
    const body = "Private body text";
    const states: unknown[] = [
      await actions.sendEmailAction(
        { status: "idle", operationId: "" },
        compose({
          senderIdentityId: context.identity.id,
          emails: "rahul@example.com",
          body,
        }),
      ),
    ];
    next.store = {
      ...context.store,
      listSendRecordsForOperation: async () => {
        throw new Error(`leak ${refreshToken} ${accessToken} ${body}`);
      },
    };
    states.push(
      await actions.sendEmailAction(
        { status: "idle", operationId: "" },
        compose({
          senderIdentityId: context.identity.id,
          emails: "other@example.com",
          body,
        }),
      ),
    );

    const output = JSON.stringify(states) + logs.join("\n");
    expect(output).not.toContain(refreshToken);
    expect(output).not.toContain(accessToken);
    expect(output).not.toContain(body);
    expect(output).not.toMatch(/ciphertext|encryptedDataKey/);
    expect(logs).toEqual(["[admin] Send failed (Error)."]);
  });
});

describe("schedule actions", () => {
  async function scheduleActionSetup() {
    const { store, owner, ownerToken } = await seedOwner();
    const alice = await seedUser(store, owner, "alice@example.com");
    const bob = await seedUser(store, owner, "bob@example.com");
    const cipher = createLocalTokenCipher();
    const { identity } = await seedConnectedSender(
      store,
      cipher,
      owner,
      alice.user,
      "alice@gmail.com",
    );
    const gmail = createFakeGmail();
    const triggers = createScheduleTriggers();
    next.store = store;
    next.gmail = gmail.client;
    next.triggers = triggers.triggers;
    return { store, ownerToken, alice, bob, identity, gmail, triggers };
  }

  /** Tomorrow at this minute, in UTC, as a datetime-local value. */
  function tomorrow() {
    return new Date(Date.now() + 24 * 3600_000).toISOString().slice(0, 16);
  }

  function scheduleForm(values: Record<string, string>) {
    return form({
      subject: "Hello",
      body: "Private scheduled body",
      emails: "rahul@example.com",
      type: "ONE_TIME",
      startAt: tomorrow(),
      timeZone: "UTC",
      ...values,
    });
  }

  it("requires a session", async () => {
    await scheduleActionSetup();
    for (const attempt of [
      actions.createScheduleAction(idleFormState, scheduleForm({})),
      actions.cancelScheduleAction(form({ scheduleId: "x" })),
    ]) {
      expect(await navigation(attempt)).toBe("/admin/login");
    }
  });

  it("schedules for the signed-in user only, ignoring any user in the form, and sends nothing", async () => {
    const context = await scheduleActionSetup();
    signIn(context.alice.token);
    const state = await actions.createScheduleAction(
      idleFormState,
      scheduleForm({
        senderIdentityId: context.identity.id,
        userId: context.bob.user.id,
        createdBy: context.bob.user.id,
      }),
    );
    expect(state).toMatchObject({ status: "success" });
    expect(state.message).toMatch(/^Scheduled\. First send: .+ UTC\.$/);

    const [schedule] = await context.store.listSchedules(context.alice.user.id);
    expect(schedule).toMatchObject({
      userId: context.alice.user.id,
      createdBy: context.alice.user.id,
      status: "ACTIVE",
    });
    expect(await context.store.listSchedules(context.bob.user.id)).toEqual([]);
    expect(context.triggers.created).toHaveLength(1);
    expect(context.gmail.calls).toHaveLength(0);
    const output = JSON.stringify(state) + logs.join("\n");
    expect(output).not.toContain("Private scheduled body");
  });

  it("refuses another user's sender, and reports invalid fields", async () => {
    const context = await scheduleActionSetup();
    signIn(context.bob.token);
    expect(
      await actions.createScheduleAction(
        idleFormState,
        scheduleForm({ senderIdentityId: context.identity.id }),
      ),
    ).toMatchObject({
      status: "error",
      message: "Choose one of your own approved sender addresses.",
    });

    signIn(context.alice.token);
    const invalid = await actions.createScheduleAction(
      idleFormState,
      scheduleForm({
        senderIdentityId: context.identity.id,
        timeZone: "IST",
        startAt: "tomorrow",
      }),
    );
    expect(invalid).toMatchObject({
      status: "error",
      message: "Check the highlighted fields. Nothing was scheduled.",
      fieldErrors: {
        timeZone: "Choose a time zone from the list.",
        startAt: "Enter a valid date and time.",
      },
    });
    expect(context.triggers.created).toHaveLength(0);
  });

  it("explains that scheduling is unavailable without Scheduler", async () => {
    const context = await scheduleActionSetup();
    next.triggers = null;
    signIn(context.alice.token);
    expect(
      await actions.createScheduleAction(
        idleFormState,
        scheduleForm({ senderIdentityId: context.identity.id }),
      ),
    ).toMatchObject({
      status: "error",
      message:
        "Scheduling is not configured on this server. Nothing was scheduled.",
    });
  });

  it("lets only the owner of a schedule cancel it", async () => {
    const context = await scheduleActionSetup();
    signIn(context.alice.token);
    await actions.createScheduleAction(
      idleFormState,
      scheduleForm({ senderIdentityId: context.identity.id }),
    );
    const [schedule] = await context.store.listSchedules(context.alice.user.id);

    for (const token of [context.bob.token, context.ownerToken]) {
      signIn(token);
      await actions.cancelScheduleAction(form({ scheduleId: schedule.id }));
    }
    expect(
      await context.store.getSchedule(context.alice.user.id, schedule.id),
    ).toMatchObject({ status: "ACTIVE" });

    signIn(context.alice.token);
    await actions.cancelScheduleAction(form({ scheduleId: schedule.id }));
    expect(
      await context.store.getSchedule(context.alice.user.id, schedule.id),
    ).toMatchObject({ status: "CANCELLED" });
    expect(context.triggers.removed).toEqual([schedule.triggerName]);
  });
});

describe("sensitive values", () => {
  it("never returns or logs passwords, hashes, or session tokens", async () => {
    const { store, ownerToken } = await seedOwner();
    next.store = store;
    signIn(ownerToken);

    const states = [
      await actions.createInvitationAction(
        idleFormState,
        form({ email: "friend@example.com" }),
      ),
      await actions.requestSenderIdentityAction(
        idleFormState,
        form({ email: "owner@gmail.com" }),
      ),
      await actions.loginAction(
        idleFormState,
        form({ email: "owner@example.com", password: "wrong password" }),
      ),
    ];
    const output = JSON.stringify(states) + logs.join("\n");

    expect(output).not.toMatch(/argon2|passwordHash|tokenHash/);
    expect(output).not.toContain(ownerPassword);
    expect(output).not.toContain("wrong password");
    expect(output).not.toContain(ownerToken);
    expect(logs).toEqual([]);
  });
});
