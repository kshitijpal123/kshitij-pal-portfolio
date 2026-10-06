import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComposeState } from "@/lib/admin/formState";

const { sendEmailAction } = vi.hoisted(() => ({
  sendEmailAction:
    vi.fn<(state: ComposeState, data: FormData) => Promise<ComposeState>>(),
}));

vi.mock("@/lib/admin/actions", () => ({ sendEmailAction }));

const { ComposeForm } = await import("@/components/admin/ComposeForm");

const operationId = "1791277200000.AAAAAAAAAAAAAAAAAAAAAA";

function renderForm() {
  render(
    <ComposeForm
      operationId={operationId}
      senders={[{ id: "s1", email: "alice@gmail.com" }]}
      contacts={[
        {
          id: "c1",
          name: "Rahul",
          email: "rahul@example.com",
          company: "Acme",
        },
        { id: "c2", name: "Priya", email: "priya@example.com", company: null },
      ]}
      templates={[
        {
          id: "t1",
          name: "Intro",
          subject: "Hi {{name}}",
          body: "Hello {{name}} at {{company}}",
        },
      ]}
      bulkEnabled
      maxRecipients={10}
    />,
  );
}

function preview() {
  return screen.getByRole("region", { name: /Preview/ });
}

describe("ComposeForm", () => {
  it("previews a template personalized for the first selected contact", () => {
    renderForm();
    fireEvent.change(screen.getByLabelText("Template (optional)"), {
      target: { value: "t1" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /Rahul/ }));

    expect(preview()).toHaveTextContent("Preview for rahul@example.com");
    expect(within(preview()).getByText("Hi Rahul")).toBeInTheDocument();
    expect(
      within(preview()).getByText("Hello Rahul at Acme"),
    ).toBeInTheDocument();
  });

  it("explains a placeholder the recipient cannot fill", () => {
    renderForm();
    fireEvent.change(screen.getByLabelText("Template (optional)"), {
      target: { value: "t1" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /Priya/ }));
    expect(preview()).toHaveTextContent(/company/);
    expect(within(preview()).queryByText(/Hello Priya at/)).toBeNull();
  });

  it("counts unique recipients across contacts and typed addresses", () => {
    renderForm();
    fireEvent.click(screen.getByRole("checkbox", { name: /Rahul/ }));
    fireEvent.change(screen.getByLabelText("Other addresses (optional)"), {
      target: { value: "RAHUL@example.com, new@example.com" },
    });
    expect(screen.getByText("2 recipients selected.")).toBeInTheDocument();
  });

  it("submits IDs and text only, and keeps the draft after a refusal", async () => {
    sendEmailAction.mockResolvedValue({
      status: "error",
      operationId,
      message: "The daily limit is reached. Nothing was sent.",
    });
    renderForm();
    fireEvent.click(screen.getByRole("checkbox", { name: /Rahul/ }));
    fireEvent.change(screen.getByLabelText("Subject"), {
      target: { value: "Hello" },
    });
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Hi there" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
    });

    const data = sendEmailAction.mock.calls[0][1];
    expect(data.get("operationId")).toBe(operationId);
    expect(data.get("senderIdentityId")).toBe("s1");
    expect(data.getAll("contactId")).toEqual(["c1"]);
    expect(data.has("userId")).toBe(false);
    expect(screen.getByRole("alert")).toHaveTextContent("daily limit");
    expect(screen.getByLabelText("Subject")).toHaveValue("Hello");
    expect(screen.getByRole("checkbox", { name: /Rahul/ })).toBeChecked();
  });

  it("clears the draft after everything was sent", async () => {
    sendEmailAction.mockResolvedValue({
      status: "success",
      operationId: "1791277200001.BBBBBBBBBBBBBBBBBBBBBB",
      message: "Sent 1 email.",
      results: [
        { email: "rahul@example.com", status: "SENT", message: "Sent." },
      ],
    });
    renderForm();
    fireEvent.click(screen.getByRole("checkbox", { name: /Rahul/ }));
    fireEvent.change(screen.getByLabelText("Subject"), {
      target: { value: "Hello" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
    });

    expect(screen.getByRole("status")).toHaveTextContent("Sent 1 email.");
    expect(screen.getByLabelText("Subject")).toHaveValue("");
    expect(screen.getByRole("checkbox", { name: /Rahul/ })).not.toBeChecked();
  });
});
