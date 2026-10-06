import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminField } from "@/components/admin/AdminField";

describe("AdminField", () => {
  it("labels the input and links its hint", () => {
    render(<AdminField name="email" label="Email" hint="Your address." />);
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("id", "admin-email");
    expect(input).toHaveAccessibleDescription("Your address.");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).toBeRequired();
  });

  it("marks an invalid field and links its error after the hint", () => {
    render(
      <AdminField
        name="password"
        type="password"
        label="Password"
        hint="At least 12 characters."
        error="Password is too short."
      />,
    );
    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute(
      "aria-describedby",
      "admin-password-hint admin-password-error",
    );
    expect(input).toHaveAccessibleDescription(
      "At least 12 characters. Password is too short.",
    );
  });
});
