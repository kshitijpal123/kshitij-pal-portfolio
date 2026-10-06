// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { classifyGmailError, createGmailClient } from "@/lib/admin/gmailApi";

function respond(status: number, body: unknown) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
}

describe("createGmailClient", () => {
  it("posts the raw message to users.me.messages.send with the bearer token", async () => {
    const fetch = respond(200, { id: "msg-1", threadId: "t-1" });
    const result = await createGmailClient(fetch).send("ya29.token", "UkFX");

    expect(result).toEqual({ ok: true, messageId: "msg-1" });
    const [url, init] = fetch.mock.calls[0] as unknown as [
      string,
      { method: string; headers: Record<string, string>; body: string },
    ];
    expect(url).toBe(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    );
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer ya29.token");
    expect(JSON.parse(init.body)).toEqual({ raw: "UkFX" });
  });

  it("classifies failures without keeping Google's response", async () => {
    const cases: [number, unknown, string][] = [
      [401, { error: { status: "UNAUTHENTICATED" } }, "auth"],
      [
        403,
        { error: { errors: [{ reason: "insufficientPermissions" }] } },
        "auth",
      ],
      [
        403,
        {
          error: { details: [{ reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" }] },
        },
        "auth",
      ],
      [
        403,
        { error: { errors: [{ reason: "dailyLimitExceeded" }] } },
        "rate-limited",
      ],
      [429, {}, "rate-limited"],
      [400, { error: { message: "Invalid To header" } }, "rejected"],
      [403, { error: { errors: [{ reason: "domainPolicy" }] } }, "rejected"],
      [500, {}, "uncertain"],
      [503, null, "uncertain"],
    ];
    for (const [status, body, kind] of cases) {
      const result = await createGmailClient(respond(status, body)).send(
        "t",
        "r",
      );
      expect(result, `${status}`).toEqual({ ok: false, kind });
    }
  });

  it("treats network errors and answers without an ID as uncertain", async () => {
    const failing = vi.fn(async () => {
      throw new Error("socket hang up");
    });
    expect(await createGmailClient(failing).send("t", "r")).toEqual({
      ok: false,
      kind: "uncertain",
    });
    expect(await createGmailClient(respond(200, {})).send("t", "r")).toEqual({
      ok: false,
      kind: "uncertain",
    });
    const badJson = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("bad");
      },
    }));
    expect(await createGmailClient(badJson).send("t", "r")).toEqual({
      ok: false,
      kind: "uncertain",
    });
  });

  it("ignores malformed error bodies", () => {
    expect(classifyGmailError(403, { error: "nope" })).toBe("rejected");
    expect(classifyGmailError(403, "text")).toBe("rejected");
  });
});
