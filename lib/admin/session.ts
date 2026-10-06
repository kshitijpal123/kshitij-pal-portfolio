import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { resolveSession, type StartedSession } from "@/lib/admin/auth";
import { getAdminStore } from "@/lib/admin/getAdminStore";
import { findOpenInvitation } from "@/lib/admin/invitations";
import type { PublicUser } from "@/lib/admin/model";

export const sessionCookieName = "admin_session";

/**
 * HttpOnly, Secure outside local development, SameSite=Lax (so a link into
 * the console from email still carries it), and scoped to `/admin`, so no
 * public page request ever carries it.
 */
export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/admin",
    expires,
  };
}

export async function setSessionCookie({ token, expiresAt }: StartedSession) {
  (await cookies()).set(
    sessionCookieName,
    token,
    sessionCookieOptions(expiresAt),
  );
}

export async function readSessionCookie() {
  return (await cookies()).get(sessionCookieName)?.value;
}

export async function clearSessionCookie() {
  (await cookies()).set(
    sessionCookieName,
    "",
    sessionCookieOptions(new Date(0)),
  );
}

/**
 * The signed-in user for this request, resolved from the session cookie and
 * the store (never from client input), or `null`. Memoized per render.
 * Reading cookies makes every page that calls it dynamic.
 */
export const getCurrentUser = cache(async (): Promise<PublicUser | null> => {
  const token = await readSessionCookie();
  if (!token) return null;
  return resolveSession(getAdminStore(), token, new Date());
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  return user;
}

/**
 * The email an invitation token is for, while it can still be accepted.
 * Invitation state changes per request, so the page is never prerendered or
 * cached.
 */
export async function getOpenInvitationEmail(token: string) {
  await connection();
  const invitation = await findOpenInvitation(
    getAdminStore(),
    token,
    new Date(),
  );
  return invitation?.email ?? null;
}

/** Signed-in USERs who reach an OWNER page go back to their dashboard. */
export async function requireOwner() {
  const user = await requireUser();
  if (user.role !== "OWNER") redirect("/admin");
  return user;
}
