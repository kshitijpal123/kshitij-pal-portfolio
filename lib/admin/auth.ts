import { recordAudit, systemAuditSubject } from "@/lib/admin/audit";
import {
  type PublicUser,
  sessionTtlMs,
  toPublicUser,
  type User,
} from "@/lib/admin/model";
import { hashPassword, verifyPassword } from "@/lib/admin/password";
import type { AdminStore } from "@/lib/admin/store";
import {
  generateToken,
  hashToken,
  isWellFormedToken,
  secretsMatch,
} from "@/lib/admin/tokens";
import type { Credentials, OwnerSetup } from "@/lib/admin/validation";

export const attemptWindowMs = 15 * 60 * 1000;

/** Failed logins per email (or setup attempts) allowed per window. */
export const maxFailedAttempts = 5;

/** The bootstrap token must be long enough to be unguessable. */
const minBootstrapTokenLength = 32;

export type StartedSession = { token: string; expiresAt: Date };

export async function startSession(
  store: AdminStore,
  userId: string,
  now: Date,
): Promise<StartedSession> {
  const token = generateToken();
  const expiresAt = new Date(now.getTime() + sessionTtlMs);
  await store.createSession({
    tokenHash: hashToken(token),
    userId,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });
  return { token, expiresAt };
}

/**
 * The user behind a session cookie, re-read from the store on every request,
 * or `null` for a missing, unknown, expired, or revoked session, or a user
 * who is no longer ACTIVE.
 */
export async function resolveSession(
  store: AdminStore,
  token: string | undefined,
  now: Date,
): Promise<PublicUser | null> {
  if (!token || !isWellFormedToken(token)) return null;

  const tokenHash = hashToken(token);
  const session = await store.getSession(tokenHash);
  if (!session) return null;

  if (Date.parse(session.expiresAt) <= now.getTime()) {
    await store.deleteSession(tokenHash);
    return null;
  }

  const user = await store.getUserById(session.userId);
  if (!user || user.status !== "ACTIVE") return null;
  if (
    user.sessionsValidAfter &&
    Date.parse(session.createdAt) <= Date.parse(user.sessionsValidAfter)
  ) {
    return null;
  }
  return toPublicUser(user);
}

export async function endSession(store: AdminStore, token: string | undefined) {
  if (token && isWellFormedToken(token)) {
    await store.deleteSession(hashToken(token));
  }
}

export type LoginResult =
  | ({ ok: true; user: PublicUser } & StartedSession)
  | { ok: false; reason: "invalid" | "throttled" };

/**
 * Unknown emails, wrong passwords, and disabled accounts all return the same
 * `invalid` result after the same password-hashing work, so a response never
 * reveals whether an account exists.
 */
export async function login(
  store: AdminStore,
  { email, password }: Credentials,
  now: Date,
): Promise<LoginResult> {
  const key = `login:${email}`;
  if (
    (await store.getFailedAttempts(key, now, attemptWindowMs)) >=
    maxFailedAttempts
  ) {
    return { ok: false, reason: "throttled" };
  }

  const user = await store.getUserByEmail(email);
  const passwordMatches = await verifyPassword(
    user?.passwordHash ?? null,
    password,
  );
  if (!user || !passwordMatches || user.status !== "ACTIVE") {
    await store.recordFailedAttempt(key, now, attemptWindowMs);
    // An unknown address goes to the system trail without the address.
    await recordAudit(
      store,
      {
        subject: user?.id ?? systemAuditSubject,
        actorId: null,
        action: "auth.login",
        outcome: "failure",
        targetId: user?.id ?? null,
        detail: {
          reason: !user
            ? "unknown-account"
            : !passwordMatches
              ? "wrong-password"
              : "account-disabled",
        },
      },
      now,
    );
    return { ok: false, reason: "invalid" };
  }

  await store.clearFailedAttempts(key);
  const at = now.toISOString();
  await store.recordLogin(user.id, at);
  const session = await startSession(store, user.id, now);
  await recordAudit(
    store,
    {
      subject: user.id,
      actorId: user.id,
      action: "auth.login",
      outcome: "success",
      targetId: user.id,
    },
    now,
  );
  return {
    ok: true,
    user: toPublicUser({ ...user, lastLoginAt: at }),
    ...session,
  };
}

/** The configured setup token, or `null` when bootstrap is switched off. */
export function getBootstrapToken(
  env: Record<string, string | undefined> = process.env,
) {
  const token = env.ADMIN_BOOTSTRAP_TOKEN?.trim();
  return token && token.length >= minBootstrapTokenLength ? token : null;
}

/** Whether `/admin/setup` is open: a token is configured and no OWNER exists. */
export async function isBootstrapAvailable(
  store: AdminStore,
  configuredToken: string | null,
) {
  return configuredToken !== null && !(await store.ownerExists());
}

export type BootstrapResult =
  | ({ ok: true; user: PublicUser } & StartedSession)
  | { ok: false; reason: "unavailable" | "invalid-token" | "throttled" };

/**
 * Creates the single OWNER. Requires the deployment's setup token and works
 * only while no OWNER exists; the store enforces the latter atomically.
 */
export async function bootstrapOwner(
  store: AdminStore,
  input: OwnerSetup,
  configuredToken: string | null,
  now: Date,
): Promise<BootstrapResult> {
  if (!configuredToken) return { ok: false, reason: "unavailable" };

  const key = "bootstrap";
  if (
    (await store.getFailedAttempts(key, now, attemptWindowMs)) >=
    maxFailedAttempts
  ) {
    return { ok: false, reason: "throttled" };
  }
  if (!secretsMatch(input.setupToken, configuredToken)) {
    await store.recordFailedAttempt(key, now, attemptWindowMs);
    return { ok: false, reason: "invalid-token" };
  }
  if (await store.ownerExists()) return { ok: false, reason: "unavailable" };

  const at = now.toISOString();
  const owner: User = {
    id: crypto.randomUUID(),
    email: input.email,
    name: input.name,
    passwordHash: await hashPassword(input.password),
    role: "OWNER",
    status: "ACTIVE",
    createdAt: at,
    updatedAt: at,
    lastLoginAt: at,
    sessionsValidAfter: null,
  };
  if ((await store.createOwner(owner)) !== "created") {
    return { ok: false, reason: "unavailable" };
  }

  await store.clearFailedAttempts(key);
  const session = await startSession(store, owner.id, now);
  return { ok: true, user: toPublicUser(owner), ...session };
}
