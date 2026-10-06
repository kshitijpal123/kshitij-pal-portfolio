import { describe, expect, it } from "vitest";
import {
  countUsedSeats,
  effectiveInvitationStatus,
  type Invitation,
  toPublicInvitation,
  toPublicUser,
  type User,
} from "@/lib/admin/model";

const now = new Date("2026-10-06T09:00:00.000Z");

const user: User = {
  id: "u1",
  email: "a@example.com",
  name: "A",
  passwordHash: "$argon2id$secret",
  role: "USER",
  status: "DISABLED",
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
  lastLoginAt: null,
  sessionsValidAfter: now.toISOString(),
};

function invitation(overrides: Partial<Invitation>): Invitation {
  return {
    id: "i",
    email: "b@example.com",
    role: "USER",
    status: "PENDING",
    tokenHash: "hash",
    expiresAt: "2026-10-07T09:00:00.000Z",
    createdAt: now.toISOString(),
    acceptedAt: null,
    revokedAt: null,
    invitedBy: "owner",
    ...overrides,
  };
}

describe("admin model", () => {
  it("never copies the password hash or session state into a public user", () => {
    const publicUser = toPublicUser(user);
    expect(publicUser).not.toHaveProperty("passwordHash");
    expect(publicUser).not.toHaveProperty("sessionsValidAfter");
    expect(JSON.stringify(publicUser)).not.toContain("argon2");
  });

  it("never copies the token hash into a public invitation", () => {
    expect(toPublicInvitation(invitation({}), now)).not.toHaveProperty(
      "tokenHash",
    );
  });

  it("derives EXPIRED for a pending invitation past its expiry", () => {
    const pending = invitation({});
    expect(effectiveInvitationStatus(pending, now)).toBe("PENDING");
    expect(
      effectiveInvitationStatus(pending, new Date("2026-10-07T09:00:00.000Z")),
    ).toBe("EXPIRED");
    expect(
      effectiveInvitationStatus(
        invitation({ status: "ACCEPTED" }),
        new Date("2027-01-01"),
      ),
    ).toBe("ACCEPTED");
  });

  it("counts every account and every open invitation as a seat", () => {
    expect(
      countUsedSeats(
        [user, { ...user, id: "u2", status: "ACTIVE" }],
        [
          invitation({ id: "open" }),
          invitation({ id: "accepted", status: "ACCEPTED" }),
          invitation({ id: "revoked", status: "REVOKED" }),
          invitation({ id: "expired", expiresAt: now.toISOString() }),
        ],
        now,
      ),
    ).toBe(3);
  });
});
