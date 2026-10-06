// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  isApprovedSender,
  listOwnSenderIdentities,
  listSenderIdentitiesForReview,
  requestSenderIdentity,
  reviewSenderIdentity,
} from "@/lib/admin/senderIdentities";
import { later, now, seedOwner, seedUser } from "@/tests/helpers/admin";

async function setup() {
  const { store, owner } = await seedOwner();
  const { user: alice } = await seedUser(store, owner, "alice@example.com");
  const { user: bob } = await seedUser(store, owner, "bob@example.com");
  return { store, owner, alice, bob };
}

async function requestFor(
  context: Awaited<ReturnType<typeof setup>>,
  email: string,
) {
  expect(
    await requestSenderIdentity(context.store, context.alice, email, now),
  ).toBe(true);
  const [identity] = await listOwnSenderIdentities(
    context.store,
    context.alice,
  );
  return identity;
}

describe("sender identity requests", () => {
  it("records a REQUESTED Gmail identity owned by the requesting user", async () => {
    const context = await setup();
    const identity = await requestFor(context, "alice@gmail.com");
    expect(identity).toMatchObject({
      userId: context.alice.id,
      email: "alice@gmail.com",
      provider: "GMAIL",
      status: "REQUESTED",
      reviewedAt: null,
      reviewedBy: null,
      rejectionReason: null,
    });
  });

  it("shows the request to the OWNER with the requester", async () => {
    const context = await setup();
    await requestFor(context, "alice@gmail.com");
    const queue = await listSenderIdentitiesForReview(
      context.store,
      context.owner,
    );
    expect(queue).toEqual([
      expect.objectContaining({
        email: "alice@gmail.com",
        status: "REQUESTED",
        requester: { name: "alice", email: "alice@example.com" },
      }),
    ]);
    expect(JSON.stringify(queue)).not.toMatch(/passwordHash|argon2/);
  });

  it("hides the review queue from USERs", async () => {
    const context = await setup();
    expect(
      await listSenderIdentitiesForReview(context.store, context.alice),
    ).toBeNull();
  });

  it("refuses an address someone already requested or was approved for", async () => {
    const context = await setup();
    await requestFor(context, "shared@gmail.com");
    expect(
      await requestSenderIdentity(
        context.store,
        context.bob,
        "shared@gmail.com",
        now,
      ),
    ).toBe(false);
    expect(
      await requestSenderIdentity(
        context.store,
        context.alice,
        "shared@gmail.com",
        now,
      ),
    ).toBe(false);
  });
});

describe("sender identity review", () => {
  it("lets the OWNER approve, authorizing the address for that user only", async () => {
    const context = await setup();
    const identity = await requestFor(context, "alice@gmail.com");

    expect(
      await reviewSenderIdentity(
        context.store,
        context.owner,
        identity.id,
        "approve",
        "ignored for approvals",
        later(1000),
      ),
    ).toBe(true);
    expect(await context.store.getSenderIdentity(identity.id)).toMatchObject({
      status: "APPROVED",
      reviewedBy: context.owner.id,
      reviewedAt: later(1000).toISOString(),
      rejectionReason: null,
    });

    expect(
      await isApprovedSender(
        context.store,
        context.alice.id,
        "alice@gmail.com",
      ),
    ).toBe(true);
    expect(
      await isApprovedSender(context.store, context.bob.id, "alice@gmail.com"),
    ).toBe(false);
    expect(
      await isApprovedSender(
        context.store,
        context.owner.id,
        "alice@gmail.com",
      ),
    ).toBe(false);
  });

  it("lets the OWNER reject with a reason; a rejected address cannot be used", async () => {
    const context = await setup();
    const identity = await requestFor(context, "alice@gmail.com");

    expect(
      await reviewSenderIdentity(
        context.store,
        context.owner,
        identity.id,
        "reject",
        "Not your address",
        now,
      ),
    ).toBe(true);
    expect(await context.store.getSenderIdentity(identity.id)).toMatchObject({
      status: "REJECTED",
      rejectionReason: "Not your address",
    });
    expect(
      await isApprovedSender(
        context.store,
        context.alice.id,
        "alice@gmail.com",
      ),
    ).toBe(false);
    expect(
      await reviewSenderIdentity(
        context.store,
        context.owner,
        identity.id,
        "approve",
        null,
        now,
      ),
    ).toBe(false);
  });

  it("disables an approved address so it can no longer be used", async () => {
    const context = await setup();
    const identity = await requestFor(context, "alice@gmail.com");
    await reviewSenderIdentity(
      context.store,
      context.owner,
      identity.id,
      "approve",
      null,
      now,
    );

    expect(
      await reviewSenderIdentity(
        context.store,
        context.owner,
        identity.id,
        "disable",
        null,
        now,
      ),
    ).toBe(true);
    expect(
      await isApprovedSender(
        context.store,
        context.alice.id,
        "alice@gmail.com",
      ),
    ).toBe(false);
    expect(
      await reviewSenderIdentity(
        context.store,
        context.owner,
        identity.id,
        "approve",
        null,
        now,
      ),
    ).toBe(false);
  });

  it("releases a rejected address for a new request", async () => {
    const context = await setup();
    const identity = await requestFor(context, "alice@gmail.com");
    await reviewSenderIdentity(
      context.store,
      context.owner,
      identity.id,
      "reject",
      null,
      now,
    );
    expect(
      await requestSenderIdentity(
        context.store,
        context.alice,
        "alice@gmail.com",
        now,
      ),
    ).toBe(true);
  });

  it("does not let a USER approve, reject, or disable, even their own request", async () => {
    const context = await setup();
    const identity = await requestFor(context, "alice@gmail.com");

    for (const decision of ["approve", "reject", "disable"] as const) {
      expect(
        await reviewSenderIdentity(
          context.store,
          context.alice,
          identity.id,
          decision,
          null,
          now,
        ),
      ).toBe(false);
    }
    expect((await context.store.getSenderIdentity(identity.id))?.status).toBe(
      "REQUESTED",
    );
  });
});

describe("user isolation", () => {
  it("lists only the signed-in user's own identities", async () => {
    const context = await setup();
    await requestFor(context, "alice@gmail.com");
    await requestSenderIdentity(
      context.store,
      context.bob,
      "bob@gmail.com",
      now,
    );

    expect(
      (await listOwnSenderIdentities(context.store, context.alice)).map(
        (identity) => identity.email,
      ),
    ).toEqual(["alice@gmail.com"]);
    expect(
      (await listOwnSenderIdentities(context.store, context.bob)).map(
        (identity) => identity.email,
      ),
    ).toEqual(["bob@gmail.com"]);
  });
});
