import { describe, expect, it } from "vitest";
import { findTemplateProblem, personalize } from "@/lib/admin/personalization";

const rahul = {
  name: "Rahul",
  email: "rahul@example.com",
  company: "Acme",
};

describe("personalize", () => {
  it("fills name, email, and company", () => {
    expect(
      personalize(
        "Hello {{name}},\n\nI wanted to follow up with you regarding our discussion.",
        rahul,
      ),
    ).toEqual({
      ok: true,
      text: "Hello Rahul,\n\nI wanted to follow up with you regarding our discussion.",
    });
    expect(personalize("{{ email }} at {{company}}", rahul)).toEqual({
      ok: true,
      text: "rahul@example.com at Acme",
    });
  });

  it("leaves text without placeholders unchanged", () => {
    expect(personalize("Just text.", rahul)).toEqual({
      ok: true,
      text: "Just text.",
    });
  });

  it("refuses a placeholder without a value instead of dropping it", () => {
    expect(
      personalize("Hi {{name}} from {{company}}", { ...rahul, company: null }),
    ).toEqual({
      ok: false,
      problem: {
        kind: "missing",
        placeholder: "{{company}}",
        recipient: "rahul@example.com",
      },
    });
  });

  it("refuses unknown and malformed placeholders", () => {
    expect(personalize("Hi {{first_name}}", rahul)).toEqual({
      ok: false,
      problem: { kind: "unknown", placeholder: "{{first_name}}" },
    });
    expect(personalize("Hi {{name}", rahul)).toMatchObject({
      ok: false,
      problem: { kind: "malformed" },
    });
    expect(personalize("Hi name}}", rahul)).toMatchObject({
      ok: false,
      problem: { kind: "malformed" },
    });
    expect(personalize("{{NAME}}", rahul)).toMatchObject({
      ok: false,
      problem: { kind: "unknown" },
    });
  });

  it("inserts values literally, without expanding placeholders inside them", () => {
    expect(
      personalize("Hi {{name}}", {
        ...rahul,
        name: "{{company}} $& $1",
      }),
    ).toEqual({ ok: true, text: "Hi {{company}} $& $1" });
  });

  it("shortens long unknown placeholders in problems", () => {
    const result = findTemplateProblem(`{{${"x".repeat(100)}}}`);
    expect(result?.kind).toBe("unknown");
    expect(result?.placeholder.length).toBeLessThanOrEqual(40);
  });
});
