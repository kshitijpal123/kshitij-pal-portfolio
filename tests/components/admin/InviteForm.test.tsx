import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FormState } from "@/lib/admin/formState";

const { createInvitationAction } = vi.hoisted(() => ({
  createInvitationAction:
    vi.fn<(state: FormState, data: FormData) => Promise<FormState>>(),
}));

vi.mock("@/lib/admin/actions", () => ({ createInvitationAction }));

const { InviteForm } = await import("@/components/admin/InviteForm");

async function submit(email: string) {
  fireEvent.change(screen.getByLabelText("Email to invite"), {
    target: { value: email },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Create invitation" }));
  });
}

describe("InviteForm", () => {
  it("shows the invitation link once after the owner creates it", async () => {
    createInvitationAction.mockResolvedValue({
      status: "success",
      message: "Invitation created for friend@example.com.",
      invitationPath: "/admin/invite/token123",
    });
    render(<InviteForm />);
    await submit("friend@example.com");

    expect(createInvitationAction.mock.calls[0][1].get("email")).toBe(
      "friend@example.com",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Invitation created for friend@example.com.",
    );
    expect(screen.getByLabelText("Invitation link")).toHaveValue(
      `${window.location.origin}/admin/invite/token123`,
    );
    expect(
      screen.getByLabelText("Invitation link"),
    ).toHaveAccessibleDescription(/Shown only once/);
  });

  it("announces a rejected invitation and shows no link", async () => {
    createInvitationAction.mockResolvedValue({
      status: "error",
      message: "All 5 seats are in use, counting pending invitations.",
      values: { email: "friend@example.com" },
    });
    render(<InviteForm />);
    await submit("friend@example.com");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "All 5 seats are in use",
    );
    expect(screen.queryByLabelText("Invitation link")).not.toBeInTheDocument();
  });
});
