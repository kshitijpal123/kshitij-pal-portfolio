// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { send } = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("resend", () => ({
  Resend: vi.fn(function () {
    return { emails: { send } };
  }),
}));

type Route = typeof import("@/app/api/contact/route");

let route: Route;
let errorLog: ReturnType<typeof vi.spyOn>;
let ipCounter = 0;

const valid = {
  name: "Ada Lovelace",
  email: "visitor@example.com",
  subject: "Backend role",
  message: "Hello, I would like to talk about a backend role.",
};

function request(
  body: unknown,
  {
    ip = `203.0.113.${++ipCounter}`,
    contentType = "application/json",
  }: { ip?: string; contentType?: string } = {},
) {
  return new Request("http://localhost/api/contact", {
    method: "POST",
    headers: { "content-type": contentType, "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function post(body: unknown, options?: Parameters<typeof request>[1]) {
  const response = await route.POST(request(body, options));
  return { status: response.status, body: await response.json() };
}

function stubConfiguredEnv() {
  vi.stubEnv("RESEND_API_KEY", "re_secret_test_key");
  vi.stubEnv("CONTACT_TO_EMAIL", "owner@example.com");
  vi.stubEnv("CONTACT_FROM_EMAIL", "Portfolio <portfolio@example.com>");
}

beforeEach(async () => {
  vi.resetModules();
  route = await import("@/app/api/contact/route");
  send.mockReset();
  send.mockResolvedValue({ data: { id: "email_1" }, error: null });
  stubConfiguredEnv();
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  errorLog.mockRestore();
});

describe("POST /api/contact", () => {
  it("sends a valid submission and responds 200", async () => {
    await expect(post(valid)).resolves.toEqual({
      status: 200,
      body: { success: true },
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("sends from the configured sender to the configured inbox", async () => {
    await post({
      ...valid,
      to: "attacker@example.com",
      from: "attacker@example.com",
      headers: { Bcc: "attacker@example.com" },
      html: "<h1>Injected</h1>",
    });

    const options = send.mock.calls[0][0];
    expect(options.from).toBe("Portfolio <portfolio@example.com>");
    expect(options.to).toBe("owner@example.com");
    expect(options.replyTo).toBe("visitor@example.com");
    expect(options).not.toHaveProperty("headers");
    expect(options).not.toHaveProperty("bcc");
    expect(options.html).not.toContain("<h1>Injected</h1>");
    expect(JSON.stringify(options)).not.toContain("attacker@example.com");
  });

  it("rejects malformed JSON with 400", async () => {
    await expect(post("{not json")).resolves.toEqual({
      status: 400,
      body: { success: false, error: "Please check the form fields." },
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects a non-JSON content type with 415", async () => {
    const { status, body } = await post("name=Ada", {
      contentType: "application/x-www-form-urlencoded",
    });

    expect(status).toBe(415);
    expect(body.success).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects missing fields with 400 and field errors", async () => {
    const { status, body } = await post({ name: "Ada" });

    expect(status).toBe(400);
    expect(body).toEqual({
      success: false,
      error: "Please check the form fields.",
      fieldErrors: {
        email: "Email is required.",
        subject: "Subject is required.",
        message: "Message is required.",
      },
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects an invalid email with 400", async () => {
    const { status, body } = await post({ ...valid, email: "not-an-email" });

    expect(status).toBe(400);
    expect(body.fieldErrors).toEqual({
      email: "Enter a valid email address.",
    });
  });

  it("rejects oversized fields with 400", async () => {
    const { status, body } = await post({
      ...valid,
      name: "a".repeat(101),
      message: "a".repeat(5001),
    });

    expect(status).toBe(400);
    expect(Object.keys(body.fieldErrors)).toEqual(["name", "message"]);
  });

  it("rejects an oversized body with 413", async () => {
    const { status } = await post({ ...valid, message: "a".repeat(25_000) });

    expect(status).toBe(413);
    expect(send).not.toHaveBeenCalled();
  });

  it("answers a filled honeypot like a success and sends nothing", async () => {
    await expect(
      post({ ...valid, website: "https://spam.example" }),
    ).resolves.toEqual({
      status: 200,
      body: { success: true },
    });
    await expect(post({ website: "https://spam.example" })).resolves.toEqual({
      status: 200,
      body: { success: true },
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("allows three sends per address, then responds 429", async () => {
    const ip = "198.51.100.1";
    const statuses = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      statuses.push((await post(valid, { ip })).status);
    }

    expect(statuses).toEqual([200, 200, 200, 429]);
    expect(send).toHaveBeenCalledTimes(3);
    expect((await post(valid, { ip: "198.51.100.2" })).status).toBe(200);
  });

  it("responds 429 with a generic body and Retry-After", async () => {
    const ip = "198.51.100.3";
    for (let attempt = 0; attempt < 3; attempt += 1) await post(valid, { ip });

    const response = await route.POST(request(valid, { ip }));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("900");
    expect(await response.json()).toEqual({
      success: false,
      error: "Too many messages. Try again later.",
    });
  });

  it.each(["RESEND_API_KEY", "CONTACT_TO_EMAIL", "CONTACT_FROM_EMAIL"])(
    "responds 500 without sending when %s is missing",
    async (name) => {
      vi.stubEnv(name, "");

      await expect(post(valid)).resolves.toEqual({
        status: 500,
        body: {
          success: false,
          error: "Something went wrong while sending your message.",
        },
      });
      expect(send).not.toHaveBeenCalled();
    },
  );

  it("responds 500 with a generic body when Resend fails", async () => {
    send.mockResolvedValue({
      data: null,
      error: {
        name: "invalid_from_address",
        message: "Provider detail: re_secret_test_key rejected",
        statusCode: 422,
      },
    });

    const response = await route.POST(request(valid));
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(text)).toEqual({
      success: false,
      error: "Something went wrong while sending your message.",
    });
    expect(text).not.toMatch(/422|invalid_from_address|Provider|re_secret/);
  });

  it("responds 500 with a generic body on an unexpected exception", async () => {
    send.mockRejectedValue(new Error("ECONNRESET at internal/socket.js:1"));

    const response = await route.POST(request(valid));
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).not.toMatch(/ECONNRESET|socket|stack/i);
  });

  it("never logs submitted content, addresses, or secrets", async () => {
    send.mockRejectedValue(new Error("boom"));
    await post(valid, { ip: "192.0.2.55" });
    vi.stubEnv("RESEND_API_KEY", "");
    await post(valid);

    const logged = JSON.stringify(errorLog.mock.calls);
    expect(errorLog).toHaveBeenCalled();
    for (const secret of [
      valid.name,
      valid.email,
      valid.subject,
      valid.message,
      "192.0.2.55",
      "re_secret_test_key",
      "owner@example.com",
    ]) {
      expect(logged).not.toContain(secret);
    }
  });
});

describe("other methods", () => {
  it.each(["GET", "PUT", "PATCH", "DELETE"] as const)(
    "%s responds 405 with JSON",
    async (method) => {
      const response = route[method]();

      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
      expect(response.headers.get("content-type")).toContain(
        "application/json",
      );
      expect(await response.json()).toEqual({
        success: false,
        error: "Method not allowed.",
      });
    },
  );
});
