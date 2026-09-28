import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getContactConfig,
  sendContactEmail,
} from "@/lib/contact/sendContactEmail";

const { send, Resend } = vi.hoisted(() => {
  const send = vi.fn();
  const Resend = vi.fn(function () {
    return { emails: { send } };
  });
  return { send, Resend };
});

vi.mock("resend", () => ({ Resend }));

const config = {
  apiKey: "re_test",
  to: "owner@example.com",
  from: "Portfolio <portfolio@example.com>",
};

const submission = {
  name: "Ada",
  email: "visitor@example.com",
  subject: "Hello",
  message: "A message long enough.",
};

beforeEach(() => {
  send.mockReset();
  Resend.mockClear();
});

describe("getContactConfig", () => {
  it("reads the three variables", () => {
    expect(
      getContactConfig({
        RESEND_API_KEY: "re_test",
        CONTACT_TO_EMAIL: "owner@example.com",
        CONTACT_FROM_EMAIL: "Portfolio <portfolio@example.com>",
      }),
    ).toEqual(config);
  });

  it("is null when any variable is missing or blank", () => {
    expect(getContactConfig({})).toBeNull();
    expect(
      getContactConfig({
        RESEND_API_KEY: "re_test",
        CONTACT_TO_EMAIL: "  ",
        CONTACT_FROM_EMAIL: "Portfolio <portfolio@example.com>",
      }),
    ).toBeNull();
  });
});

describe("sendContactEmail", () => {
  it("sends from the verified sender to the owner, replying to the visitor", async () => {
    send.mockResolvedValue({ data: { id: "1" }, error: null });

    await expect(sendContactEmail(config, submission)).resolves.toEqual({
      sent: true,
    });

    expect(Resend).toHaveBeenCalledWith("re_test");
    expect(send).toHaveBeenCalledTimes(1);
    const options = send.mock.calls[0][0];
    expect(options).toMatchObject({
      from: "Portfolio <portfolio@example.com>",
      to: "owner@example.com",
      replyTo: "visitor@example.com",
      subject: "[Portfolio Contact] Hello",
    });
    expect(options.from).not.toContain("visitor@example.com");
    expect(options.text).toContain("A message long enough.");
    expect(options.html).toContain("A message long enough.");
    expect(options).not.toHaveProperty("headers");
    expect(options).not.toHaveProperty("cc");
    expect(options).not.toHaveProperty("bcc");
  });

  it("reports a Resend error by its code only", async () => {
    send.mockResolvedValue({
      data: null,
      error: {
        name: "validation_error",
        message: "Detailed provider message",
        statusCode: 422,
      },
    });

    await expect(sendContactEmail(config, submission)).resolves.toEqual({
      sent: false,
      reason: "validation_error",
    });
  });
});
