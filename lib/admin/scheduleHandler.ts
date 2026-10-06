import { createDynamoStore } from "@/lib/admin/dynamoStore";
import { createGmailClient } from "@/lib/admin/gmailApi";
import {
  createGoogleOAuthClient,
  getGoogleOAuthConfig,
} from "@/lib/admin/googleOAuth";
import {
  type ExecutionDeps,
  executeScheduledOccurrence,
  failureCategory,
} from "@/lib/admin/scheduleExecution";
import { createAwsTriggerRemover } from "@/lib/admin/scheduler";
import { createKmsTokenCipher } from "@/lib/admin/tokenCipher";

/*
 * The scheduler Lambda's entry point, bundled separately from the site.
 * It is invoked only by EventBridge Scheduler through its IAM role (no
 * function URL, no resource policy). Production wiring only: without every
 * setting it sends nothing, and it never falls back to an in-memory store
 * or a local key. Logs carry fixed words only: no addresses, content, or
 * tokens.
 */

export function createExecutionDeps(
  env: Record<string, string | undefined>,
): ExecutionDeps | null {
  const tableName = env.ADMIN_TABLE_NAME?.trim();
  const keyId = env.GMAIL_TOKEN_KMS_KEY_ID?.trim();
  const groupName = env.SCHEDULER_GROUP_NAME?.trim();
  const google = getGoogleOAuthConfig(env);
  if (!tableName || !keyId || !groupName || !google) return null;
  return {
    store: createDynamoStore(tableName),
    google: createGoogleOAuthClient(google),
    cipher: createKmsTokenCipher(keyId),
    gmail: createGmailClient(),
    triggers: createAwsTriggerRemover(groupName),
  };
}

let deps: ExecutionDeps | null | undefined;

export async function handler(event: unknown) {
  deps ??= createExecutionDeps(process.env);
  if (!deps) {
    console.error("[scheduler] Not configured; nothing was sent.");
    return { outcome: "not-configured" };
  }
  const result = await executeScheduledOccurrence(deps, event, new Date());
  const category =
    result.outcome === "FAILED" || result.outcome === "UNCERTAIN"
      ? failureCategory(result.outcome, result.failureCode ?? null)
      : null;
  console.log(
    `[scheduler] Occurrence ${result.outcome}${category ? ` (${category}: ${result.failureCode})` : ""}.`,
  );
  return { outcome: result.outcome };
}
