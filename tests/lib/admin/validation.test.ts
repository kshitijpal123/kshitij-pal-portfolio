import { describe, expect, it } from "vitest";
import {
  normalizeEmail,
  readField,
  validateEmailField,
  validateLogin,
  validateNewAccount,
  validateOwnerSetup,
  validateRejectionReason,
} from "@/lib/admin/validation";

function form(values: Record<string, string | Blob>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
}

describe("admin validation", () => {
  it("normalizes emails to one canonical form", () => {
    expect(normalizeEmail("  Friend@GMail.COM ")).toBe("friend@gmail.com");
  });

  it("reads only string fields from untrusted form data", () => {
    const data = form({ name: "Ada", file: new Blob(["x"]) });
    expect(readField(data, "name")).toBe("Ada");
    expect(readField(data, "file")).toBe("");
    expect(readField(data, "missing")).toBe("");
  });

  it("requires an email and password to log in without revealing rules", () => {
    expect(validateLogin(form({}))).toEqual({
      success: false,
      errors: {
        email: "Enter your email address.",
        password: "Enter your password.",
      },
    });
    expect(validateLogin(form({ email: " A@B.co ", password: "x" }))).toEqual({
      success: true,
      data: { email: "a@b.co", password: "x" },
    });
    expect(
      validateLogin(form({ email: "a@b.co", password: "x".repeat(129) })),
    ).toMatchObject({ success: false });
  });

  it("requires a 12–128 character password that matches its confirmation", () => {
    const base = {
      name: "  Ada   Lovelace ",
      password: "short",
      confirmPassword: "short",
    };
    expect(validateNewAccount(form(base))).toEqual({
      success: false,
      errors: {
        name: undefined,
        password: "Password must be at least 12 characters.",
      },
    });
    expect(
      validateNewAccount(
        form({
          ...base,
          password: "long enough pass",
          confirmPassword: "other",
        }),
      ),
    ).toMatchObject({
      success: false,
      errors: { confirmPassword: "Passwords do not match." },
    });
    expect(
      validateNewAccount(
        form({
          ...base,
          password: "long enough pass",
          confirmPassword: "long enough pass",
        }),
      ),
    ).toEqual({
      success: true,
      data: { name: "Ada Lovelace", password: "long enough pass" },
    });
  });

  it("requires a setup token and a valid email for owner setup", () => {
    expect(
      validateOwnerSetup(
        form({
          name: "Owner",
          email: "not-an-email",
          password: "long enough pass",
          confirmPassword: "long enough pass",
        }),
      ),
    ).toMatchObject({
      success: false,
      errors: {
        email: "Enter a valid email address.",
        setupToken: "Setup token is required.",
      },
    });
  });

  it("validates a single email field", () => {
    expect(validateEmailField(form({ email: "Friend@Gmail.com" }))).toEqual({
      success: true,
      data: { email: "friend@gmail.com" },
    });
    expect(validateEmailField(form({ email: "nope" }))).toMatchObject({
      success: false,
    });
  });

  it("limits rejection reasons and treats blank as none", () => {
    expect(validateRejectionReason("  ")).toEqual({
      success: true,
      reason: null,
    });
    expect(validateRejectionReason(" Not\nyours ")).toEqual({
      success: true,
      reason: "Not yours",
    });
    expect(validateRejectionReason("x".repeat(501))).toMatchObject({
      success: false,
    });
  });
});
