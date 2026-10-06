import type { NextRequest } from "next/server";
import { getAdminStore } from "@/lib/admin/getAdminStore";
import {
  completeGmailConnection,
  type GmailCallbackOutcome,
} from "@/lib/admin/gmailConnections";
import { getGoogleOAuthClient } from "@/lib/admin/googleOAuth";
import { getCurrentUser, readSessionCookie } from "@/lib/admin/session";
import { getTokenCipher } from "@/lib/admin/tokenCipher";

/*
 * Google redirects here with `code` and `state` (or `error`). The response
 * is always a redirect to a fixed result code. The Location is relative:
 * behind CloudFront the request's host is the function URL, not the site.
 */
function finish(outcome: GmailCallbackOutcome | "unavailable") {
  return new Response(null, {
    status: 303,
    headers: {
      Location:
        outcome === "signed-out" ? "/admin/login" : `/admin?gmail=${outcome}`,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function GET(request: NextRequest) {
  const google = getGoogleOAuthClient();
  const cipher = getTokenCipher();
  if (!google || !cipher) return finish("unavailable");

  const query = request.nextUrl.searchParams;
  let outcome: GmailCallbackOutcome;
  try {
    outcome = await completeGmailConnection(
      { store: getAdminStore(), google, cipher },
      {
        actor: await getCurrentUser(),
        sessionToken: await readSessionCookie(),
        state: query.get("state"),
        code: query.get("code"),
        error: query.get("error"),
      },
      new Date(),
    );
  } catch (error) {
    const name = error instanceof Error ? error.name : "UnknownError";
    console.error(`[admin] Gmail connection failed (${name}).`);
    outcome = "failed";
  }
  return finish(outcome);
}
