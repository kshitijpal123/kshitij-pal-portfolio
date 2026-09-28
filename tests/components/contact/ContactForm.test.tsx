import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContactForm } from "@/components/contact/ContactForm";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const valid = {
  Name: "Ada Lovelace",
  Email: "ada@example.com",
  Subject: "Backend role",
  Message: "Hello, I would like to talk about a backend role.",
};

function field(label: string) {
  return screen.getByLabelText(label);
}

function fill(values: Partial<typeof valid> = valid) {
  for (const [label, value] of Object.entries(values)) {
    fireEvent.change(field(label), { target: { value } });
  }
}

function submitButton() {
  return screen.getByRole("button", { name: /send message|sending/i });
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ContactForm", () => {
  it("renders four labelled, required fields", () => {
    render(<ContactForm />);

    expect(
      screen.getByRole("form", { name: "Send a message" }),
    ).toBeInTheDocument();
    expect(field("Name")).toHaveAttribute("type", "text");
    expect(field("Email")).toHaveAttribute("type", "email");
    expect(field("Subject")).toHaveAttribute("type", "text");
    expect(field("Message").tagName).toBe("TEXTAREA");
    for (const label of Object.keys(valid)) {
      expect(field(label)).toBeRequired();
      expect(field(label)).not.toHaveAttribute("aria-invalid");
      expect(field(label)).not.toHaveAttribute("placeholder");
    }
    expect(submitButton()).toHaveTextContent("Send message");
    expect(submitButton()).toHaveAttribute("type", "submit");
  });

  it("hides the honeypot from people and assistive technology", () => {
    const { container } = render(<ContactForm />);

    const honeypot = container.querySelector('input[name="website"]');
    expect(honeypot).toHaveAttribute("tabindex", "-1");
    expect(honeypot?.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it("shows required errors on submit, linked to their fields", () => {
    render(<ContactForm />);

    fireEvent.click(submitButton());

    const expected = {
      Name: "Name is required.",
      Email: "Email is required.",
      Subject: "Subject is required.",
      Message: "Message is required.",
    };
    for (const [label, message] of Object.entries(expected)) {
      expect(field(label)).toHaveAttribute("aria-invalid", "true");
      expect(field(label)).toHaveAccessibleDescription(message);
    }
    expect(field("Name")).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("validates email format and message length", () => {
    render(<ContactForm />);

    fill({ ...valid, Email: "ada@", Message: "Too short" });
    fireEvent.click(submitButton());

    expect(field("Email")).toHaveAccessibleDescription(
      "Enter a valid email address.",
    );
    expect(field("Message")).toHaveAccessibleDescription(
      "Message must be at least 10 characters.",
    );
    expect(field("Name")).not.toHaveAttribute("aria-invalid");
    expect(field("Email")).toHaveFocus();
  });

  it("validates a field on blur once it has a value", () => {
    render(<ContactForm />);

    fireEvent.blur(field("Email"));
    expect(field("Email")).not.toHaveAttribute("aria-invalid");

    fill({ Email: "nope" });
    fireEvent.blur(field("Email"));
    expect(field("Email")).toHaveAccessibleDescription(
      "Enter a valid email address.",
    );
  });

  it("clears a field error as it is corrected", () => {
    render(<ContactForm />);

    fireEvent.click(submitButton());
    fill({ Name: "Ada" });

    expect(field("Name")).not.toHaveAttribute("aria-invalid");
    expect(field("Name")).not.toHaveAttribute("aria-describedby");
  });

  it("posts the trimmed values as JSON", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true }));
    render(<ContactForm />);

    fill({ ...valid, Name: "  Ada Lovelace  " });
    fireEvent.click(submitButton());
    await screen.findByText("Thanks — your message has been sent.");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/contact");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({
      name: "Ada Lovelace",
      email: "ada@example.com",
      subject: "Backend role",
      message: "Hello, I would like to talk about a backend role.",
      website: "",
    });
  });

  it("shows a sending state and ignores repeat submissions", async () => {
    let resolve: (response: Response) => void = () => {};
    fetchMock.mockReturnValue(
      new Promise<Response>((done) => {
        resolve = done;
      }),
    );
    render(<ContactForm />);

    fill();
    fireEvent.click(submitButton());

    expect(submitButton()).toHaveTextContent("Sending…");
    expect(submitButton()).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(submitButton());
    fireEvent.submit(screen.getByRole("form"));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolve(jsonResponse(200, { success: true }));
    await screen.findByText("Thanks — your message has been sent.");
    expect(submitButton()).toHaveTextContent("Send message");
    expect(submitButton()).not.toHaveAttribute("aria-disabled");
  });

  it("announces success in a status region and clears the form", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { success: true }));
    render(<ContactForm />);

    fill();
    fireEvent.click(submitButton());

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Thanks — your message has been sent.",
    );
    for (const label of Object.keys(valid)) {
      expect(field(label)).toHaveValue("");
    }
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  });

  it("announces a failure as an alert and keeps the values", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(500, {
        success: false,
        error: "Something went wrong while sending your message.",
      }),
    );
    render(<ContactForm />);

    fill();
    fireEvent.click(submitButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong while sending your message. Please try again or use one of the direct contact links.",
    );
    for (const [label, value] of Object.entries(valid)) {
      expect(field(label)).toHaveValue(value);
    }
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(submitButton()).toHaveTextContent("Send message");
  });

  it("shows the same generic error on a network failure", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    render(<ContactForm />);

    fill();
    fireEvent.click(submitButton());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Something went wrong/);
    expect(alert).not.toHaveTextContent(/Failed to fetch/);
  });

  it("explains a rate limit", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(429, { success: false, error: "Too many messages." }),
    );
    render(<ContactForm />);

    fill();
    fireEvent.click(submitButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /sent several messages recently/,
    );
  });

  it("shows field errors returned by the server", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, {
        success: false,
        error: "Please check the form fields.",
        fieldErrors: { email: "Enter a valid email address." },
      }),
    );
    render(<ContactForm />);

    fill();
    fireEvent.click(submitButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Please check the highlighted fields and try again.",
    );
    expect(field("Email")).toHaveAccessibleDescription(
      "Enter a valid email address.",
    );
    expect(field("Email")).toHaveValue(valid.Email);
  });
});
