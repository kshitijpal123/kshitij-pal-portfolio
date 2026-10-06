// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createExecutionDeps, handler } from "@/lib/admin/scheduleHandler";

const env = {
  ADMIN_TABLE_NAME: "portfolio-production-admin",
  GMAIL_TOKEN_KMS_KEY_ID: "arn:aws:kms:us-east-1:123456789012:key/k",
  SCHEDULER_GROUP_NAME: "portfolio-production-mail",
  GOOGLE_CLIENT_ID: "client",
  GOOGLE_CLIENT_SECRET: "secret",
  GOOGLE_OAUTH_REDIRECT_URI: "https://example.com/admin/oauth/google/callback",
};

describe("scheduler function entry point", () => {
  it("runs only with every production setting, never a local fallback", () => {
    expect(createExecutionDeps(env)).not.toBeNull();
    for (const name of Object.keys(env)) {
      expect(
        createExecutionDeps({ ...env, [name]: "" }),
        `${name} missing`,
      ).toBeNull();
    }
  });

  it("sends nothing and logs fixed words when not configured", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await handler({
      scheduleId: "8c5d2f9e-1b0a-4c3d-9e8f-7a6b5c4d3e2f",
      scheduledTime: "2026-10-12T04:30:00Z",
    });
    expect(result).toEqual({ outcome: "not-configured" });
    expect(error).toHaveBeenCalledWith(
      "[scheduler] Not configured; nothing was sent.",
    );
    error.mockRestore();
  });
});
