/*
 * The one Gmail API call the console makes: `users.messages.send` for the
 * account the access token belongs to (`me`). Google decides which account
 * sends; the console never names another. Sent messages appear in that
 * account's Sent folder. Errors are reduced to a kind; no response body,
 * token, or message content is kept or logged.
 */

const sendEndpoint =
  "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const requestTimeoutMs = 8000;

/**
 * `auth`: Google refused the access token or its scope.
 * `rejected`: Gmail refused this message (for example an invalid recipient).
 * `rate-limited`: Gmail's own per-user limits; nothing was sent.
 * `uncertain`: no definite answer (timeout, network error, 5xx); Gmail may
 * or may not have accepted the message.
 */
export type GmailSendFailure =
  "auth" | "rejected" | "rate-limited" | "uncertain";

export type GmailSendResult =
  { ok: true; messageId: string } | { ok: false; kind: GmailSendFailure };

export type GmailClient = {
  send(accessToken: string, raw: string): Promise<GmailSendResult>;
};

type FetchLike = (
  input: string,
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<Pick<Response, "ok" | "status" | "json">>;

const rateLimitReasons = new Set([
  "rateLimitExceeded",
  "userRateLimitExceeded",
  "dailyLimitExceeded",
  "quotaExceeded",
]);

const authReasons = new Set([
  "insufficientPermissions",
  "ACCESS_TOKEN_SCOPE_INSUFFICIENT",
  "authError",
]);

/** Google's error reasons, read only to classify the failure. */
function errorReasons(body: unknown) {
  const error =
    body && typeof body === "object"
      ? (body as { error?: unknown }).error
      : undefined;
  if (!error || typeof error !== "object") return [];
  const { errors, details } = error as { errors?: unknown; details?: unknown };
  return [errors, details]
    .flatMap((list) => (Array.isArray(list) ? list : []))
    .map((entry: unknown) =>
      entry && typeof entry === "object"
        ? (entry as { reason?: unknown }).reason
        : undefined,
    )
    .filter((reason): reason is string => typeof reason === "string");
}

async function readJson(response: Pick<Response, "json">) {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

export function classifyGmailError(
  status: number,
  body: unknown,
): GmailSendFailure {
  const reasons = errorReasons(body);
  if (status === 401) return "auth";
  if (status === 429 || reasons.some((reason) => rateLimitReasons.has(reason)))
    return "rate-limited";
  if (status === 403 && reasons.some((reason) => authReasons.has(reason)))
    return "auth";
  if (status >= 500) return "uncertain";
  return "rejected";
}

export function createGmailClient(fetchImpl: FetchLike = fetch): GmailClient {
  return {
    async send(accessToken, raw) {
      let response;
      try {
        response = await fetchImpl(sendEndpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ raw }),
          signal: AbortSignal.timeout(requestTimeoutMs),
        });
      } catch {
        return { ok: false, kind: "uncertain" };
      }
      const body = await readJson(response);
      if (!response.ok) {
        return { ok: false, kind: classifyGmailError(response.status, body) };
      }
      const id =
        body && typeof body === "object"
          ? (body as { id?: unknown }).id
          : undefined;
      return typeof id === "string" && id.length > 0
        ? { ok: true, messageId: id }
        : { ok: false, kind: "uncertain" };
    },
  };
}

let client: GmailClient | undefined;

export function getGmailClient(): GmailClient {
  client ??= createGmailClient();
  return client;
}
