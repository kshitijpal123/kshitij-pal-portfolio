// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildMimeMessage,
  encodeForGmail,
  encodeSubject,
  formatMessageDate,
  InvalidMessageError,
} from "@/lib/admin/mimeMessage";
import { now } from "@/tests/helpers/admin";
import { decodeHeader, decodeRaw } from "@/tests/helpers/mail";

const message = {
  from: "alice@gmail.com",
  to: "rahul@example.com",
  subject: "Following up",
  body: "Hello Rahul,\n\nThanks.",
  date: now,
};

describe("buildMimeMessage", () => {
  it("builds a plain-text MIME message with CRLF line endings", () => {
    const mime = buildMimeMessage(message);
    expect(mime).toBe(
      [
        "From: alice@gmail.com",
        "To: rahul@example.com",
        "Subject: Following up",
        "Date: Tue, 06 Oct 2026 09:00:00 +0000",
        "MIME-Version: 1.0",
        'Content-Type: text/plain; charset="UTF-8"',
        "Content-Transfer-Encoding: base64",
        "",
        Buffer.from("Hello Rahul,\r\n\r\nThanks.").toString("base64"),
        "",
      ].join("\r\n"),
    );
  });

  it("encodes the whole message as base64url for Gmail's raw field", () => {
    const raw = encodeForGmail(buildMimeMessage(message));
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    const decoded = decodeRaw(raw);
    expect(decoded.headers.To).toBe("rahul@example.com");
    expect(decoded.body).toBe("Hello Rahul,\r\n\r\nThanks.");
  });

  it("RFC 2047-encodes non-ASCII and long subjects on code point boundaries", () => {
    const subject = "Namaste 🙏 — फॉलो-अप ".repeat(4).trim();
    const encoded = encodeSubject(subject);
    for (const line of encoded.split("\r\n")) {
      expect(line.trim().length).toBeLessThanOrEqual(75);
    }
    expect(decodeHeader(encoded.replace(/\r\n /g, " "))).toBe(subject);
    expect(encodeSubject("Looks =?like?= a word")).toMatch(/^=\?UTF-8\?B\?/);
  });

  it("refuses header injection through the subject or addresses", () => {
    for (const subject of [
      "Hi\r\nBcc: evil@example.com",
      "Hi\nBcc: evil@example.com",
      "Hi\rX",
      "Tab\there",
      "",
    ]) {
      expect(() => buildMimeMessage({ ...message, subject })).toThrow(
        InvalidMessageError,
      );
    }
    for (const to of [
      "rahul@example.com\r\nBcc: evil@example.com",
      "rahul@example.com, evil@example.com",
      "a,b@example.com",
      "Rahul <rahul@example.com>",
      '"x"@example.com',
    ]) {
      expect(() => buildMimeMessage({ ...message, to })).toThrow(
        InvalidMessageError,
      );
    }
    expect(() =>
      buildMimeMessage({ ...message, from: "a@b.co\r\nReply-To: x@y.co" }),
    ).toThrow(InvalidMessageError);
  });

  it("keeps header-like text in the body inside the encoded body", () => {
    const mime = buildMimeMessage({
      ...message,
      body: "Hi\r\nBcc: evil@example.com\r\n\r\nTo: other@example.com",
    });
    const [head] = mime.split("\r\n\r\n");
    expect(head).not.toContain("evil@example.com");
    expect(head.match(/^To:/gm)).toHaveLength(1);
  });

  it("formats dates per RFC 5322", () => {
    expect(formatMessageDate(new Date("2026-01-02T03:04:05Z"))).toBe(
      "Fri, 02 Jan 2026 03:04:05 +0000",
    );
  });
});
