// @vitest-environment node
import { describe, expect, it } from "vitest";
import { defaultUserSettings, updateUserSettings } from "@/lib/admin/settings";
import {
  createTemplate,
  deleteTemplate,
  getOwnTemplate,
  listOwnTemplates,
  updateTemplate,
} from "@/lib/admin/templates";
import { validateTemplate } from "@/lib/admin/validation";
import { later, now, seedOwner, seedUser } from "@/tests/helpers/admin";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
}

const followUp = {
  name: "Follow-up",
  subject: "Following up, {{name}}",
  body: "Hello {{name}},\n\nI wanted to follow up with you regarding our discussion.",
};

async function setup() {
  const { store, owner } = await seedOwner();
  const alice = (await seedUser(store, owner, "alice@example.com")).user;
  const bob = (await seedUser(store, owner, "bob@example.com")).user;
  return { store, owner, alice, bob };
}

describe("validateTemplate", () => {
  it("accepts the supported placeholders and normalizes line breaks", () => {
    expect(
      validateTemplate(
        form({ ...followUp, body: "Hello {{name}},\r\n\r\n{{company}}" }),
      ),
    ).toEqual({
      success: true,
      data: { ...followUp, body: "Hello {{name}},\n\n{{company}}" },
    });
  });

  it("rejects unknown and malformed placeholders and multi-line subjects", () => {
    expect(
      validateTemplate(form({ ...followUp, body: "Hi {{first}}" })),
    ).toMatchObject({
      success: false,
      errors: {
        body: "{{first}} is not a supported placeholder. Use {{name}}, {{email}}, or {{company}}.",
      },
    });
    expect(
      validateTemplate(form({ ...followUp, subject: "Hi {{name" })),
    ).toMatchObject({
      success: false,
      errors: { subject: expect.any(String) },
    });
    expect(
      validateTemplate(form({ ...followUp, subject: "Hi\r\nBcc: x@y.co" })),
    ).toMatchObject({
      success: false,
      errors: { subject: "Subject must be a single line." },
    });
    expect(validateTemplate(form({ name: "", subject: "", body: "" }))).toEqual(
      {
        success: false,
        errors: {
          name: "Name is required.",
          subject: "Subject is required.",
          body: "Message is required.",
        },
      },
    );
  });
});

describe("templates", () => {
  it("creates, lists, updates, and deletes the user's own templates", async () => {
    const { store, alice } = await setup();
    expect(await createTemplate(store, alice, followUp, now)).toBe("saved");
    const [template] = await listOwnTemplates(store, alice);
    expect(template).toMatchObject({ userId: alice.id, ...followUp });

    expect(
      await updateTemplate(
        store,
        alice,
        template.id,
        { ...followUp, subject: "Checking in" },
        later(1000),
      ),
    ).toBe("saved");
    expect(await getOwnTemplate(store, alice, template.id)).toMatchObject({
      subject: "Checking in",
      createdAt: now.toISOString(),
      updatedAt: later(1000).toISOString(),
    });

    expect(await deleteTemplate(store, alice, template.id)).toBe("deleted");
    expect(await listOwnTemplates(store, alice)).toEqual([]);
    expect(await deleteTemplate(store, alice, template.id)).toBe("not-found");
  });

  it("never lets another user read, update, or delete a template", async () => {
    const { store, alice, bob } = await setup();
    await createTemplate(store, alice, followUp, now);
    const [template] = await listOwnTemplates(store, alice);

    expect(await listOwnTemplates(store, bob)).toEqual([]);
    expect(await getOwnTemplate(store, bob, template.id)).toBeNull();
    expect(
      await updateTemplate(
        store,
        bob,
        template.id,
        { ...followUp, body: "Hijacked" },
        now,
      ),
    ).toBe("not-found");
    expect(await deleteTemplate(store, bob, template.id)).toBe("not-found");
    expect(await getOwnTemplate(store, alice, template.id)).toMatchObject(
      followUp,
    );
  });

  it("refuses every operation while templates are turned off", async () => {
    const { store, owner, alice } = await setup();
    await createTemplate(store, alice, followUp, now);
    const [template] = await listOwnTemplates(store, alice);
    await updateUserSettings(
      store,
      owner,
      alice.id,
      { ...defaultUserSettings, templatesEnabled: false },
      now,
    );
    expect(await createTemplate(store, alice, followUp, now)).toBe("disabled");
    expect(await updateTemplate(store, alice, template.id, followUp, now)).toBe(
      "disabled",
    );
    expect(await deleteTemplate(store, alice, template.id)).toBe("disabled");
  });
});
