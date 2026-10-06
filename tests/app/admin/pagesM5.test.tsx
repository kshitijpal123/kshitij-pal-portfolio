import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuditPage from "@/app/admin/audit/page";
import OperationPage from "@/app/admin/history/[operationId]/page";
import HistoryPage from "@/app/admin/history/page";
import DashboardPage from "@/app/admin/page";
import SettingsPage from "@/app/admin/settings/page";
import { recordAudit, systemAuditSubject } from "@/lib/admin/audit";
import type { GmailSendResult } from "@/lib/admin/gmailApi";
import { newOperationId, sendEmail } from "@/lib/admin/sending";
import type { AdminStore } from "@/lib/admin/store";
import { createLocalTokenCipher } from "@/lib/admin/tokenCipher";
import { now, seedOwner, seedUser } from "@/tests/helpers/admin";
import { createFakeGoogle } from "@/tests/helpers/gmail";
import { createFakeGmail, seedConnectedSender } from "@/tests/helpers/mail";
import { NavigationSignal } from "@/tests/helpers/nextRequest";

const next = await vi.hoisted(async () => {
  const { createNextRequestMocks } =
    await import("@/tests/helpers/nextRequest");
  return {
    mocks: createNextRequestMocks(),
    store: undefined as AdminStore | undefined,
  };
});

vi.mock("next/headers", () => next.mocks.headers);
vi.mock("next/navigation", () => next.mocks.navigation);
vi.mock("next/cache", () => next.mocks.cache);
vi.mock("next/server", () => next.mocks.server);
vi.mock("@/lib/admin/getAdminStore", () => ({
  getAdminStore: () => next.store,
}));

function signIn(token: string) {
  next.mocks.jar.set("admin_session", { value: token });
}

async function navigation(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(NavigationSignal);
  return (error as NavigationSignal).to;
}

function props(query: Record<string, string> = {}) {
  return { params: Promise.resolve({}), searchParams: Promise.resolve(query) };
}

function operationProps(
  operationId: string,
  query: Record<string, string> = {},
) {
  return {
    params: Promise.resolve({ operationId }),
    searchParams: Promise.resolve(query),
  };
}

beforeEach(() => {
  next.mocks.jar.clear();
});

async function setup(results: GmailSendResult[] = []) {
  const { store, owner, ownerToken } = await seedOwner();
  const alice = await seedUser(store, owner, "alice@example.com", "Alice");
  const bob = await seedUser(store, owner, "bob@example.com", "Bob");
  const cipher = createLocalTokenCipher();
  const { identity } = await seedConnectedSender(
    store,
    cipher,
    owner,
    alice.user,
    "alice@gmail.com",
  );
  const gmail = createFakeGmail(
    ({ index }) => results[index] ?? { ok: true, messageId: `m${index}` },
  );
  const deps = {
    store,
    google: createFakeGoogle().client,
    cipher,
    gmail: gmail.client,
  };
  const send = async (emails: string[], subject = "Hello there") => {
    const operationId = newOperationId(new Date());
    await sendEmail(
      deps,
      alice.user,
      {
        operationId,
        senderIdentityId: identity.id,
        contactIds: [],
        emails,
        templateId: null,
        subject,
        body: "Body",
      },
      new Date(),
    );
    return operationId;
  };
  next.store = store;
  return { store, owner, ownerToken, alice, bob, send };
}

describe("dashboard (M5)", () => {
  it("shows a USER their own usage, switches, attention items, and recent sends", async () => {
    const context = await setup([
      { ok: true, messageId: "m0" },
      { ok: false, kind: "rejected" },
    ]);
    await context.send(["a@example.com"], "First");
    await context.send(["b@example.com"], "Second");
    signIn(context.alice.token);
    render(await DashboardPage(props()));

    const today = within(screen.getByRole("region", { name: "Today" }));
    expect(today.getByText("Emails sent today").nextSibling).toHaveTextContent(
      "1 / 50",
    );
    expect(today.getByText("Scheduling").nextSibling).toHaveTextContent("On");
    const attention = within(
      screen.getByRole("region", { name: "Needs attention" }),
    );
    expect(attention.getByText("b@example.com")).toBeInTheDocument();
    const recent = within(screen.getByRole("region", { name: "Recent sends" }));
    expect(recent.getByText("First")).toBeInTheDocument();
    expect(recent.getByText("Second")).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Accounts overview" }),
    ).not.toBeInTheDocument();
  });

  it("gives the OWNER an accounts overview without anyone's mail content", async () => {
    const context = await setup();
    await context.send(["secret@example.com"], "Confidential");
    signIn(context.ownerToken);
    render(await DashboardPage(props()));

    const overview = within(
      screen.getByRole("region", { name: "Accounts overview" }),
    );
    const aliceRow = overview.getByRole("row", { name: /Alice/ });
    expect(within(aliceRow).getByText("1 of 50")).toBeInTheDocument();
    expect(screen.queryByText("secret@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("Confidential")).not.toBeInTheDocument();
  });
});

describe("settings page", () => {
  it("shows a USER their own settings read-only", async () => {
    const context = await setup();
    signIn(context.alice.token);
    render(await SettingsPage());
    const own = within(screen.getByRole("region", { name: "Your settings" }));
    expect(own.getByText("Emails per day").nextSibling).toHaveTextContent("50");
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Account configuration" }),
    ).not.toBeInTheDocument();
  });

  it("gives the OWNER every switch, including scheduling, for each account", async () => {
    const context = await setup();
    signIn(context.ownerToken);
    render(await SettingsPage());
    const aliceForm = within(
      screen.getByRole("form", { name: "Sending settings for Alice" }),
    );
    for (const label of [
      "Sending",
      "Bulk sending",
      "Contacts",
      "Templates",
      "Scheduling",
      "Repeating schedules",
    ]) {
      expect(aliceForm.getByLabelText(`${label} for Alice`)).toBeChecked();
    }
    expect(
      screen.getByRole("button", { name: "Disable account Alice" }),
    ).toBeInTheDocument();
  });
});

describe("history pages", () => {
  it("lists and filters only the signed-in user's sends", async () => {
    const context = await setup([
      { ok: true, messageId: "m0" },
      { ok: false, kind: "rate-limited" },
    ]);
    await context.send(["a@example.com"], "Sent one");
    await context.send(["b@example.com"], "Failed one");

    signIn(context.alice.token);
    render(await HistoryPage(props({ status: "FAILED" })));
    expect(screen.getByText("Failed one")).toBeInTheDocument();
    expect(screen.queryByText("Sent one")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Status")).toHaveValue("FAILED");
  });

  it("shows nothing of another user's sends", async () => {
    const context = await setup();
    await context.send(["a@example.com"], "Alice's");
    signIn(context.bob.token);
    render(await HistoryPage(props()));
    expect(screen.queryByText("Alice's")).not.toBeInTheDocument();
    expect(screen.getByText("No matching sends.")).toBeInTheDocument();
  });

  it("reports a reversed date range instead of searching", async () => {
    const context = await setup();
    signIn(context.alice.token);
    render(await HistoryPage(props({ from: "2026-10-06", to: "2026-10-01" })));
    expect(
      screen.getByText("The start date is after the end date."),
    ).toHaveAttribute("role", "alert");
  });

  it("offers a retry for a failed immediate send, asking for the message again", async () => {
    const context = await setup([{ ok: false, kind: "rate-limited" }]);
    const operationId = await context.send(["b@example.com"], "Retry me");
    signIn(context.alice.token);
    render(await OperationPage(operationProps(operationId)));

    const retry = within(
      screen.getByRole("form", { name: "Retry failed recipients" }),
    );
    expect(retry.getByLabelText("Subject")).toHaveValue("Retry me");
    expect(retry.getByLabelText("Message")).toHaveValue("");
    expect(
      retry.getByRole("button", { name: "Retry failed recipients" }),
    ).toBeInTheDocument();
  });

  it("explains why an uncertain send cannot be retried", async () => {
    const context = await setup([{ ok: false, kind: "uncertain" }]);
    const operationId = await context.send(["u@example.com"]);
    signIn(context.alice.token);
    render(
      await OperationPage(operationProps(operationId, { retry: "<b>x</b>" })),
    );
    expect(
      screen.queryByRole("form", { name: "Retry failed recipients" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/never retried/)).toBeInTheDocument();
  });

  it("is not found for another user's operation or a malformed ID", async () => {
    const context = await setup();
    const operationId = await context.send(["a@example.com"]);
    signIn(context.bob.token);
    expect(await navigation(OperationPage(operationProps(operationId)))).toBe(
      "404",
    );
    expect(await navigation(OperationPage(operationProps("../../x")))).toBe(
      "404",
    );
  });

  it("requires a session", async () => {
    await setup();
    expect(await navigation(HistoryPage(props()))).toBe("/admin/login");
    expect(await navigation(SettingsPage())).toBe("/admin/login");
    expect(await navigation(AuditPage(props()))).toBe("/admin/login");
  });
});

describe("audit page", () => {
  it("shows a USER only their own trail", async () => {
    const context = await setup();
    await recordAudit(
      context.store,
      {
        subject: context.owner.id,
        actorId: context.owner.id,
        action: "settings.update",
        outcome: "success",
      },
      now,
    );
    await recordAudit(
      context.store,
      {
        subject: context.alice.user.id,
        actorId: context.alice.user.id,
        action: "auth.login",
        outcome: "success",
      },
      now,
    );
    signIn(context.alice.token);
    render(await AuditPage(props()));
    expect(screen.getByText("Sign-in")).toBeInTheDocument();
    expect(screen.queryByText("Settings changed")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("form", { name: "Choose an audit trail" }),
    ).not.toBeInTheDocument();
  });

  it("refuses another user's trail for a USER", async () => {
    const context = await setup();
    signIn(context.alice.token);
    render(await AuditPage(props({ user: context.owner.id })));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "That audit trail is not available.",
    );
  });

  it("lets the OWNER choose any account's trail or the system trail", async () => {
    const context = await setup();
    await recordAudit(
      context.store,
      {
        subject: systemAuditSubject,
        actorId: null,
        action: "auth.login",
        outcome: "failure",
        detail: { reason: "unknown-account" },
      },
      now,
    );
    signIn(context.ownerToken);
    render(await AuditPage(props({ user: systemAuditSubject })));
    expect(screen.getByRole("heading", { name: "System" })).toBeInTheDocument();
    expect(screen.getByText("reason: unknown-account")).toBeInTheDocument();
    expect(
      screen.getByRole("form", { name: "Choose an audit trail" }),
    ).toBeInTheDocument();
  });
});
