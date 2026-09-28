import { createRateLimiter, getClientIp } from "@/lib/contact/rateLimit";
import {
  getContactConfig,
  sendContactEmail,
} from "@/lib/contact/sendContactEmail";
import {
  type ContactResponse,
  honeypotField,
  validateContact,
} from "@/lib/contact/validation";

/** A full submission at its limits is about 6,000 characters of JSON. */
const maxBodyLength = 20_000;

const rateLimitWindowMs = 15 * 60 * 1000;

/** Per process only; see `createRateLimiter`. */
const rateLimiter = createRateLimiter({
  limit: 3,
  windowMs: rateLimitWindowMs,
});

const invalidFields = "Please check the form fields.";
const deliveryFailed = "Something went wrong while sending your message.";

function respond(
  body: ContactResponse,
  status: number,
  headers?: Record<string, string>,
) {
  return Response.json(body, { status, headers });
}

function isHoneypotFilled(payload: unknown) {
  if (typeof payload !== "object" || payload === null) return false;
  const value = (payload as Record<string, unknown>)[honeypotField];
  return typeof value === "string" ? value.trim() !== "" : value != null;
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("application/json")) {
      return respond(
        { success: false, error: "Content-Type must be application/json." },
        415,
      );
    }

    const body = await request.text();
    if (body.length > maxBodyLength) {
      return respond({ success: false, error: invalidFields }, 413);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      return respond({ success: false, error: invalidFields }, 400);
    }

    // Answer bots exactly as a delivered message would, and send nothing.
    if (isHoneypotFilled(payload)) {
      return respond({ success: true }, 200);
    }

    const result = validateContact(payload);
    if (!result.success) {
      return respond(
        { success: false, error: invalidFields, fieldErrors: result.errors },
        400,
      );
    }

    if (!rateLimiter.consume(getClientIp(request.headers))) {
      return respond(
        { success: false, error: "Too many messages. Try again later." },
        429,
        { "Retry-After": String(rateLimitWindowMs / 1000) },
      );
    }

    const config = getContactConfig();
    if (!config) {
      console.error("[contact] Email delivery is not configured.");
      return respond({ success: false, error: deliveryFailed }, 500);
    }

    const sent = await sendContactEmail(config, result.data);
    if (!sent.sent) {
      console.error(`[contact] Email delivery failed (${sent.reason}).`);
      return respond({ success: false, error: deliveryFailed }, 500);
    }

    return respond({ success: true }, 200);
  } catch {
    console.error("[contact] Unexpected error while handling a submission.");
    return respond({ success: false, error: deliveryFailed }, 500);
  }
}

function methodNotAllowed() {
  return respond({ success: false, error: "Method not allowed." }, 405, {
    Allow: "POST",
  });
}

export {
  methodNotAllowed as DELETE,
  methodNotAllowed as GET,
  methodNotAllowed as PATCH,
  methodNotAllowed as PUT,
};
