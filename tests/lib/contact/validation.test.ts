import { describe, expect, it } from "vitest";
import {
  validateContact,
  validateContactField,
} from "@/lib/contact/validation";

const valid = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  subject: "Backend role",
  message: "Hello, I would like to talk about a backend role.",
};

describe("validateContact", () => {
  it("accepts a valid submission and trims it", () => {
    const result = validateContact({
      name: "  Ada Lovelace ",
      email: " ada@example.com ",
      subject: " Backend role\r\nBcc: someone@example.com ",
      message: "\n  Hello, I would like to talk.\nThanks.  \n",
    });

    expect(result).toEqual({
      success: true,
      data: {
        name: "Ada Lovelace",
        email: "ada@example.com",
        subject: "Backend role Bcc: someone@example.com",
        message: "Hello, I would like to talk.\nThanks.",
      },
    });
  });

  it("drops unknown keys", () => {
    const result = validateContact({ ...valid, to: "attacker@example.com" });

    expect(result.success && Object.keys(result.data)).toEqual([
      "name",
      "email",
      "subject",
      "message",
    ]);
  });

  it("requires every field", () => {
    expect(validateContact({})).toEqual({
      success: false,
      errors: {
        name: "Name is required.",
        email: "Email is required.",
        subject: "Subject is required.",
        message: "Message is required.",
      },
    });
  });

  it("treats whitespace-only and non-string values as missing", () => {
    const result = validateContact({
      name: "   ",
      email: 42,
      subject: null,
      message: ["hello there, friend"],
    });

    expect(result.success).toBe(false);
    expect(!result.success && Object.keys(result.errors)).toHaveLength(4);
  });

  it("rejects payloads that are not objects", () => {
    for (const input of [null, "text", 1, []]) {
      expect(validateContact(input).success).toBe(false);
    }
  });

  it.each(["ada", "ada@", "@example.com", "ada@example", "a da@example.com"])(
    "rejects the email %s",
    (email) => {
      expect(validateContactField("email", email)).toBe(
        "Enter a valid email address.",
      );
    },
  );

  it("enforces length limits", () => {
    expect(validateContactField("name", "a".repeat(100))).toBeUndefined();
    expect(validateContactField("name", "a".repeat(101))).toBe(
      "Name must be at most 100 characters.",
    );
    expect(
      validateContactField("email", `${"a".repeat(242)}@example.com`),
    ).toBeUndefined();
    expect(
      validateContactField("email", `${"a".repeat(243)}@example.com`),
    ).toBe("Enter a valid email address.");
    expect(validateContactField("subject", "a".repeat(201))).toBe(
      "Subject must be at most 200 characters.",
    );
    expect(validateContactField("message", "a".repeat(9))).toBe(
      "Message must be at least 10 characters.",
    );
    expect(validateContactField("message", "a".repeat(10))).toBeUndefined();
    expect(validateContactField("message", "a".repeat(5000))).toBeUndefined();
    expect(validateContactField("message", "a".repeat(5001))).toBe(
      "Message must be at most 5,000 characters.",
    );
  });

  it("measures length after trimming", () => {
    expect(validateContactField("message", "  short   ")).toBe(
      "Message must be at least 10 characters.",
    );
  });
});
