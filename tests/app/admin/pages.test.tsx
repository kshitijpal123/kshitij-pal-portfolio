import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminLayout, { metadata as layoutMetadata } from "@/app/admin/layout";
import ApprovalsPage from "@/app/admin/approvals/page";
import InvitationPage from "@/app/admin/invite/[token]/page";
import LoginPage from "@/app/admin/login/page";
import DashboardPage from "@/app/admin/page";
import SendersPage from "@/app/admin/senders/page";
import SetupPage from "@/app/admin/setup/page";
import UsersPage from "@/app/admin/users/page";
import { createInvitation } from "@/lib/admin/invitations";
import { createMemoryStore } from "@/lib/admin/memoryStore";
import { requestSenderIdentity } from "@/lib/admin/senderIdentities";
import type { AdminStore } from "@/lib/admin/store";
import { now, seedOwner, seedUser, setupToken } from "@/tests/helpers/admin";
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

function tokenParams(token: string) {
  return {
    params: Promise.resolve({ token }),
    searchParams: Promise.resolve({}),
  };
}

beforeEach(() => {
  next.mocks.jar.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("admin layout", () => {
  it("keeps every console page out of search engines", () => {
    expect(layoutMetadata.robots).toEqual({ index: false, follow: false });
    expect(AdminLayout({ children: "page" })).toBe("page");
  });
});

describe("access control", () => {
  it("sends signed-out visitors to the login page", async () => {
    next.store = (await seedOwner()).store;
    for (const page of [DashboardPage, UsersPage, SendersPage, ApprovalsPage]) {
      expect(await navigation(page())).toBe("/admin/login");
    }
  });

  it("sends a USER away from OWNER pages", async () => {
    const { store, owner } = await seedOwner();
    const { token } = await seedUser(store, owner, "friend@example.com");
    next.store = store;
    signIn(token);

    expect(await navigation(UsersPage())).toBe("/admin");
    expect(await navigation(ApprovalsPage())).toBe("/admin");
  });

  it("sends a signed-in user from the login page to the console", async () => {
    const { store, ownerToken } = await seedOwner();
    next.store = store;
    signIn(ownerToken);
    expect(await navigation(LoginPage())).toBe("/admin");
  });
});

describe("login page", () => {
  it("renders a labelled sign-in form", async () => {
    next.store = createMemoryStore();
    render(await LoginPage());

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Sign in",
    );
    expect(screen.getByLabelText("Email")).toHaveAttribute(
      "autocomplete",
      "username",
    );
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "type",
      "password",
    );
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });
});

describe("dashboard", () => {
  it("shows a USER their own account and no administration", async () => {
    const { store, owner } = await seedOwner();
    const { token } = await seedUser(
      store,
      owner,
      "friend@example.com",
      "Friend",
    );
    next.store = store;
    signIn(token);
    render(await DashboardPage());

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Welcome, Friend",
    );
    expect(screen.getAllByText("friend@example.com").length).toBeGreaterThan(0);
    expect(screen.getByText("USER")).toBeInTheDocument();
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Administration" }),
    ).not.toBeInTheDocument();

    const nav = within(screen.getByRole("navigation", { name: "Console" }));
    expect(nav.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(nav.queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
    expect(
      nav.queryByRole("link", { name: "Approvals" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sign out" }),
    ).toBeInTheDocument();
  });

  it("shows the OWNER capacity, invitations, and sender requests", async () => {
    const { store, owner, ownerToken } = await seedOwner();
    const { user } = await seedUser(store, owner, "friend@example.com");
    await createInvitation(store, owner, "next@example.com", now);
    await requestSenderIdentity(store, user, "friend@gmail.com", now);
    next.store = store;
    signIn(ownerToken);
    render(await DashboardPage());

    const overview = within(
      screen.getByRole("region", { name: "Administration" }),
    );
    expect(overview.getByText("2 / 5")).toBeInTheDocument();
    expect(
      overview.getByText("Pending invitations").nextSibling,
    ).toHaveTextContent("1");
    expect(
      overview.getByText("Sender requests awaiting review").nextSibling,
    ).toHaveTextContent("1");

    const nav = within(screen.getByRole("navigation", { name: "Console" }));
    expect(nav.getByRole("link", { name: "Users" })).toHaveAttribute(
      "href",
      "/admin/users",
    );
  });
});

describe("users page", () => {
  it("shows users X / 5, the invite form, and USER-only actions", async () => {
    const { store, owner, ownerToken } = await seedOwner();
    await seedUser(store, owner, "friend@example.com", "Friend");
    next.store = store;
    signIn(ownerToken);
    render(await UsersPage());

    expect(screen.getByText(/Current users:/)).toHaveTextContent(
      "Current users: 2 / 5.",
    );
    expect(screen.getByLabelText("Email to invite")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Disable Friend" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /^(Disable|Re-enable)/ }),
    ).toHaveLength(1);
    expect(document.body.innerHTML).not.toMatch(
      /argon2|passwordHash|tokenHash/,
    );
  });

  it("explains a full console instead of offering the invite form", async () => {
    const { store, owner, ownerToken } = await seedOwner();
    for (const name of ["a", "b", "c"]) {
      await seedUser(store, owner, `${name}@example.com`);
    }
    await createInvitation(store, owner, "d@example.com", now);
    next.store = store;
    signIn(ownerToken);
    render(await UsersPage());

    expect(screen.getByText(/Current users:/)).toHaveTextContent(
      "Current users: 4 / 5, plus 1 pending invitation.",
    );
    expect(screen.queryByLabelText("Email to invite")).not.toBeInTheDocument();
    expect(
      screen.getByText(/All 5 seats are in use, counting pending invitations/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Revoke invitation for d@example.com",
      }),
    ).toBeInTheDocument();
  });
});

describe("sender identity pages", () => {
  it("lists only the signed-in user's own identities", async () => {
    const { store, owner } = await seedOwner();
    const { user: alice, token } = await seedUser(
      store,
      owner,
      "alice@example.com",
    );
    const { user: bob } = await seedUser(store, owner, "bob@example.com");
    await requestSenderIdentity(store, alice, "alice@gmail.com", now);
    await requestSenderIdentity(store, bob, "bob@gmail.com", now);
    next.store = store;
    signIn(token);
    render(await SendersPage());

    expect(screen.getByText("alice@gmail.com")).toBeInTheDocument();
    expect(screen.queryByText("bob@gmail.com")).not.toBeInTheDocument();
    expect(screen.getByText(/it does not connect Gmail/)).toBeInTheDocument();
  });

  it("gives the OWNER approve and reject controls for requests", async () => {
    const { store, owner, ownerToken } = await seedOwner();
    const { user } = await seedUser(
      store,
      owner,
      "friend@example.com",
      "Friend",
    );
    await requestSenderIdentity(store, user, "friend@gmail.com", now);
    next.store = store;
    signIn(ownerToken);
    render(await ApprovalsPage());

    const queue = within(
      screen.getByRole("region", { name: "Awaiting review" }),
    );
    expect(
      queue.getByText(/Requested by Friend \(friend@example.com\)/),
    ).toBeInTheDocument();
    expect(
      queue.getByRole("button", { name: "Approve friend@gmail.com" }),
    ).toBeInTheDocument();
    expect(
      queue.getByRole("button", { name: "Reject friend@gmail.com" }),
    ).toBeInTheDocument();
    expect(queue.getByLabelText("Rejection reason (optional)")).toHaveAttribute(
      "maxlength",
      "500",
    );
    expect(
      screen.getByText(/Approval is not Gmail authorization/),
    ).toBeInTheDocument();
  });
});

describe("setup page", () => {
  it("does not exist without a setup token", async () => {
    next.store = createMemoryStore();
    expect(await navigation(SetupPage())).toBe("404");
  });

  it("offers owner setup only while no OWNER exists", async () => {
    vi.stubEnv("ADMIN_BOOTSTRAP_TOKEN", setupToken);
    next.store = createMemoryStore();
    render(await SetupPage());
    expect(screen.getByLabelText("Setup token")).toHaveAttribute(
      "type",
      "password",
    );

    next.store = (await seedOwner()).store;
    expect(await navigation(SetupPage())).toBe("404");
  });
});

describe("invitation page", () => {
  it("shows the invited email and an account form for an open invitation", async () => {
    const { store, owner } = await seedOwner();
    const invitation = await createInvitation(
      store,
      owner,
      "friend@example.com",
      new Date(),
    );
    if (!invitation.ok) throw new Error("setup");
    next.store = store;
    render(await InvitationPage(tokenParams(invitation.token)));

    expect(screen.getByText("friend@example.com")).toBeInTheDocument();
    expect(screen.getByLabelText("Your name")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm password")).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });

  it("explains an invalid invitation without details", async () => {
    next.store = (await seedOwner()).store;
    render(await InvitationPage(tokenParams("a".repeat(43))));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Invitation unavailable",
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
