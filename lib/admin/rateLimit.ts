import type { AdminStore } from "@/lib/admin/store";

/*
 * Application rate limits for signed-in users' mutations, counted per user
 * in DynamoDB so they hold across Lambda instances. The key is always the
 * session's user ID, never anything from the form. They apply only to
 * Server Actions: the scheduler function sends through `sendEmail` directly,
 * so scheduled occurrences are never rate limited. Sign-in has its own
 * per-email throttle (`lib/admin/auth.ts`).
 */

const minuteMs = 60_000;
const hourMs = 60 * minuteMs;

export const rateLimits = {
  /** Creating and revoking invitations (OWNER). */
  invitation: { limit: 20, windowMs: hourMs },
  "sender-request": { limit: 10, windowMs: hourMs },
  /** Approving, rejecting, and disabling sender identities (OWNER). */
  "sender-review": { limit: 60, windowMs: hourMs },
  /** Starting a Google consent flow. */
  "gmail-connect": { limit: 10, windowMs: 15 * minuteMs },
  /** Checking and disconnecting Gmail connections. */
  "gmail-manage": { limit: 30, windowMs: hourMs },
  /** Every send submission, individual or bulk. */
  send: { limit: 30, windowMs: 10 * minuteMs },
  /** Submissions with more than one recipient, on top of `send`. */
  "bulk-send": { limit: 10, windowMs: hourMs },
  "schedule-create": { limit: 20, windowMs: hourMs },
  "schedule-cancel": { limit: 60, windowMs: hourMs },
  retry: { limit: 20, windowMs: hourMs },
  /** Settings and account status changes (OWNER). */
  administration: { limit: 60, windowMs: hourMs },
  /** Saving and deleting contacts and templates. */
  content: { limit: 120, windowMs: hourMs },
} as const satisfies Record<string, { limit: number; windowMs: number }>;

export type RateLimitedAction = keyof typeof rateLimits;

/**
 * Counts one use and says whether it is allowed. A store failure throws, so
 * the caller's action fails closed rather than running unlimited.
 */
export function consumeRateLimit(
  store: AdminStore,
  action: RateLimitedAction,
  userId: string,
  now: Date,
) {
  const { limit, windowMs } = rateLimits[action];
  return store.consumeRateLimit(`${action}:${userId}`, limit, windowMs, now);
}
