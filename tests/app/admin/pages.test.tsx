import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminLayout, { metadata as layoutMetadata } from "@/app/admin/layout";
import ApprovalsPage from "@/app/admin/approvals/page";
import ComposePage from "@/app/admin/compose/page";
import ContactsPage from "@/app/admin/contacts/page";
import InvitationPage from "@/app/admin/invite/[token]/page";
import LoginPage from "@/app/admin/login/page";
import DashboardPage from "@/app/admin/page";
import SendersPage from "@/app/admin/senders/page";
import SetupPage from "@/app/admin/setup/page";
import TemplatesPage from "@/app/admin/templates/page";
import UsersPage from "@/app/admin/users/page";
import { createContact } from "@/lib/admin/contacts";
import { createInvitation } from "@/lib/admin/invitations";
import { createMemoryStore } from "@/lib/admin/memoryStore";
import type { GmailConnection } from "@/lib/admin/model";
import { requestSenderIdentity } from "@/lib/admin/senderIdentities";
import { defaultUserSettings, updateUserSettings } from "@/lib/admin/settings";
import type { AdminStore } from "@/lib/admin/store";
import { createTemplate } from "@/lib/admin/templates";
import { createLocalTokenCipher } from "@/lib/admin/tokenCipher";
import { now, seedOwner, seedUser, setupToken } from "@/tests/helpers/admin";
import { seedApprovedIdentity } from "@/tests/helpers/gmail";
import { seedConnectedSender } from "@/tests/helpers/mail";
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

function dashboardProps(query: Record<string, string> = {}) {
  return { params: Promise.resolve({}), searchParams: Promise.resolve(query) };
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
    for (const page of [
      () => DashboardPage(dashboardProps()),
      UsersPage,
      SendersPage,
      ApprovalsPage,
    ]) {
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
    render(await DashboardPage(dashboardProps()));

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
    render(await DashboardPage(dashboardProps()));

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

describe("dashboard Gmail accounts", () => {
  async function setupAlice() {
    const { store, owner } = await seedOwner();
    const alice = await seedUser(store, owner, "alice@example.com", "Alice");
    const bob = await seedUser(store, owner, "bob@example.com", "Bob");
    const identity = await seedApprovedIdentity(
      store,
      owner,
      alice.user,
      "alice@gmail.com",
    );
    next.store = store;
    signIn(alice.token);
    return { store, owner, alice, bob, identity };
  }

  function connection(
    userId: string,
    senderIdentityId: string,
    email: string,
    status: GmailConnection["status"] = "CONNECTED",
  ): GmailConnection {
    return {
      id: `g-${senderIdentityId}`,
      userId,
      senderIdentityId,
      provider: "GMAIL",
      email,
      providerAccountId: "sub",
      status,
      credentials:
        status === "CONNECTED"
          ? {
              version: 1,
              scheme: "kms",
              encryptedDataKey: "ENCRYPTED-DATA-KEY",
              iv: "IV-VALUE",
              ciphertext: "CIPHERTEXT-VALUE",
              authTag: "AUTH-TAG",
            }
          : null,
      scopes: ["https://www.googleapis.com/auth/gmail.send"],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      connectedAt: now.toISOString(),
      lastValidatedAt: now.toISOString(),
      disconnectedAt: null,
    };
  }

  it("shows an approved but unconnected address with a Connect action", async () => {
    await setupAlice();
    render(await DashboardPage(dashboardProps()));

    const section = within(
      screen.getByRole("region", { name: "Gmail accounts" }),
    );
    expect(
      section.getByText("alice@gmail.com", { selector: "p" }),
    ).toBeInTheDocument();
    expect(section.getByText("APPROVED")).toBeInTheDocument();
    expect(section.getByText("NOT CONNECTED")).toBeInTheDocument();
    expect(
      section.getByText(
        "Not usable yet: approved, but Gmail is not connected.",
      ),
    ).toBeInTheDocument();
    expect(
      section.getByRole("button", { name: "Connect Gmail alice@gmail.com" }),
    ).toBeInTheDocument();
    expect(
      section.queryByRole("button", { name: /^Disconnect/ }),
    ).not.toBeInTheDocument();
  });

  it("shows a connected address without any credential material", async () => {
    const { store, alice, bob, owner, identity } = await setupAlice();
    const bobIdentity = await seedApprovedIdentity(
      store,
      owner,
      bob.user,
      "bob@gmail.com",
    );
    await store.saveGmailConnection(
      connection(alice.user.id, identity.id, "alice@gmail.com"),
    );
    await store.saveGmailConnection(
      connection(bob.user.id, bobIdentity.id, "bob@gmail.com"),
    );
    render(await DashboardPage(dashboardProps()));

    const section = within(
      screen.getByRole("region", { name: "Gmail accounts" }),
    );
    expect(section.getByText("CONNECTED")).toBeInTheDocument();
    expect(
      section.getByText("Approved by the owner and authorized by Google."),
    ).toBeInTheDocument();
    expect(
      section.getByRole("button", { name: "Check connection alice@gmail.com" }),
    ).toBeInTheDocument();
    expect(
      section.getByRole("button", { name: "Disconnect alice@gmail.com" }),
    ).toBeInTheDocument();
    expect(
      section.queryByRole("button", { name: /^Connect Gmail/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("bob@gmail.com")).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toMatch(
      /ENCRYPTED-DATA-KEY|CIPHERTEXT-VALUE|AUTH-TAG|IV-VALUE|credentials/,
    );
  });

  it("asks to reconnect when Google revoked access", async () => {
    const { store, alice, identity } = await setupAlice();
    await store.saveGmailConnection(
      connection(
        alice.user.id,
        identity.id,
        "alice@gmail.com",
        "REAUTH_REQUIRED",
      ),
    );
    render(await DashboardPage(dashboardProps()));

    expect(screen.getByText("REAUTH REQUIRED")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reconnect alice@gmail.com" }),
    ).toBeInTheDocument();
  });

  it("shows only fixed messages for result codes", async () => {
    await setupAlice();
    render(await DashboardPage(dashboardProps({ gmail: "email-mismatch" })));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The Google account you chose is not the approved address.",
    );
  });

  it("ignores unknown result codes", async () => {
    await setupAlice();
    render(await DashboardPage(dashboardProps({ gmail: "<b>injected</b>" })));
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
    expect(document.body.innerHTML).not.toContain("injected");
  });

  it("explains that approval comes first", async () => {
    const { store, owner } = await seedOwner();
    const { token } = await seedUser(store, owner, "new@example.com");
    next.store = store;
    signIn(token);
    render(await DashboardPage(dashboardProps()));
    expect(
      screen.getByText(/No approved sender identities yet/),
    ).toBeInTheDocument();
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

describe("mail pages", () => {
  async function mailSetup() {
    const { store, owner, ownerToken } = await seedOwner();
    const alice = await seedUser(store, owner, "alice@example.com", "Alice");
    const bob = await seedUser(store, owner, "bob@example.com", "Bob");
    await createContact(
      store,
      alice.user,
      { name: "Rahul", email: "rahul@example.com", company: null, notes: null },
      now,
    );
    await createContact(
      store,
      bob.user,
      { name: "Priya", email: "priya@example.com", company: null, notes: null },
      now,
    );
    await createTemplate(
      store,
      alice.user,
      { name: "Alice intro", subject: "Hi {{name}}", body: "Hello" },
      now,
    );
    await createTemplate(
      store,
      bob.user,
      { name: "Bob intro", subject: "Hi", body: "Hello" },
      now,
    );
    next.store = store;
    return { store, owner, ownerToken, alice, bob };
  }

  const contactsProps = (query: Record<string, string> = {}) => ({
    params: Promise.resolve({}),
    searchParams: Promise.resolve(query),
  });

  it("requires a session", async () => {
    await mailSetup();
    for (const page of [
      () => ContactsPage(contactsProps()),
      () => TemplatesPage(contactsProps()),
      ComposePage,
    ]) {
      expect(await navigation(page())).toBe("/admin/login");
    }
  });

  it("lists only the signed-in user's own contacts", async () => {
    const { alice } = await mailSetup();
    signIn(alice.token);
    render(await ContactsPage(contactsProps()));
    expect(screen.getByText("rahul@example.com")).toBeInTheDocument();
    expect(screen.queryByText("priya@example.com")).not.toBeInTheDocument();
  });

  it("does not open another user's contact for editing", async () => {
    const { store, alice, bob } = await mailSetup();
    const [priya] = await store.listContacts(bob.user.id);
    signIn(alice.token);
    render(await ContactsPage(contactsProps({ edit: priya.id })));
    expect(
      screen.getByRole("heading", { name: "Add a contact" }),
    ).toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain("priya@example.com");
  });

  it("filters contacts by the search query", async () => {
    const { store, alice } = await mailSetup();
    await createContact(
      store,
      alice.user,
      { name: "Meera", email: "meera@example.com", company: null, notes: null },
      now,
    );
    signIn(alice.token);
    render(await ContactsPage(contactsProps({ q: "meera" })));
    expect(screen.getByText("meera@example.com")).toBeInTheDocument();
    expect(screen.queryByText("rahul@example.com")).not.toBeInTheDocument();
  });

  it("lists only the signed-in user's own templates", async () => {
    const { alice } = await mailSetup();
    signIn(alice.token);
    render(await TemplatesPage(contactsProps()));
    expect(screen.getAllByText("Alice intro").length).toBeGreaterThan(0);
    expect(screen.queryByText("Bob intro")).not.toBeInTheDocument();
  });

  it("explains disabled contacts and templates instead of showing them", async () => {
    const { store, owner, alice } = await mailSetup();
    await updateUserSettings(
      store,
      owner,
      alice.user.id,
      {
        ...defaultUserSettings,
        contactsEnabled: false,
        templatesEnabled: false,
      },
      now,
    );
    signIn(alice.token);
    render(await ContactsPage(contactsProps()));
    expect(
      screen.getByText(
        "Contacts are turned off for your account by the owner.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("rahul@example.com")).not.toBeInTheDocument();

    render(await TemplatesPage(contactsProps()));
    expect(
      screen.getByText(
        "Templates are turned off for your account by the owner.",
      ),
    ).toBeInTheDocument();
  });

  it("asks for a connected sender before offering the compose form", async () => {
    const { alice } = await mailSetup();
    signIn(alice.token);
    render(await ComposePage());
    expect(screen.queryByLabelText("From")).not.toBeInTheDocument();
    expect(
      screen.getByText(/You need an approved sender identity/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Google applies its own Gmail limits/),
    ).toBeInTheDocument();
  });

  it("offers only the user's own connected senders, contacts, and templates", async () => {
    const { store, owner, alice, bob } = await mailSetup();
    const cipher = createLocalTokenCipher();
    await seedConnectedSender(
      store,
      cipher,
      owner,
      alice.user,
      "alice@gmail.com",
    );
    await seedConnectedSender(store, cipher, owner, bob.user, "bob@gmail.com");
    await seedApprovedIdentity(
      store,
      owner,
      alice.user,
      "unconnected@gmail.com",
    );
    signIn(alice.token);
    render(await ComposePage());

    const from = screen.getByLabelText("From");
    expect(
      within(from)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["alice@gmail.com"]);
    expect(screen.getByText("rahul@example.com")).toBeInTheDocument();
    expect(screen.queryByText("priya@example.com")).not.toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Alice intro" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Bob intro")).not.toBeInTheDocument();
    expect(screen.getByText("0 / 50")).toBeInTheDocument();
    expect(document.body.innerHTML).not.toMatch(
      /ciphertext|encryptedDataKey|refresh/i,
    );
  });

  it("explains that sending is turned off", async () => {
    const { store, owner, alice } = await mailSetup();
    await seedConnectedSender(
      store,
      createLocalTokenCipher(),
      owner,
      alice.user,
      "alice@gmail.com",
    );
    await updateUserSettings(
      store,
      owner,
      alice.user.id,
      { ...defaultUserSettings, sendingEnabled: false },
      now,
    );
    signIn(alice.token);
    render(await ComposePage());
    expect(
      screen.getByText("Sending is turned off for your account by the owner."),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("From")).not.toBeInTheDocument();
  });

  it("gives the OWNER sending settings for each user", async () => {
    const { ownerToken } = await mailSetup();
    signIn(ownerToken);
    render(await UsersPage());
    expect(
      screen.getByRole("form", { name: "Sending settings for Alice" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("form", { name: "Sending settings for Bob" }),
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
