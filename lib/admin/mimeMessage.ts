import {
  hasControlCharacters,
  isHeaderSafeEmail,
} from "@/lib/admin/validation";

/*
 * Builds the RFC 5322 / MIME message that Gmail's `users.messages.send`
 * takes as `raw`. Plain text only. Header values are never concatenated
 * from unchecked input: both addresses must be header-safe (no spaces,
 * commas, brackets, or line breaks), the subject must hold no control
 * characters and is RFC 2047 encoded unless it is plain printable ASCII,
 * and the body is base64 encoded, so nothing a user types can start a new
 * header or add a recipient.
 */

export type OutgoingMessage = {
  /** The approved sender identity's address, decided by the server. */
  from: string;
  /** Exactly one recipient. */
  to: string;
  subject: string;
  body: string;
  date: Date;
};

/** After personalization; well under the 998-character line limit. */
export const maxEncodedSubjectLength = 500;

export class InvalidMessageError extends Error {
  constructor(readonly field: "from" | "to" | "subject" | "body") {
    super(`Invalid message ${field}.`);
    this.name = "InvalidMessageError";
  }
}

const printableAscii = /^[\x20-\x7e]*$/;

/** UTF-8 B-encoded words of at most 75 characters, split on code points. */
function encodeWords(value: string) {
  const words: string[] = [];
  let chunk = "";
  for (const character of value) {
    if (Buffer.byteLength(chunk + character, "utf8") > 45) {
      words.push(chunk);
      chunk = "";
    }
    chunk += character;
  }
  if (chunk) words.push(chunk);
  return words
    .map(
      (word) => `=?UTF-8?B?${Buffer.from(word, "utf8").toString("base64")}?=`,
    )
    .join("\r\n ");
}

export function encodeSubject(subject: string) {
  if (
    hasControlCharacters(subject) ||
    subject.length === 0 ||
    subject.length > maxEncodedSubjectLength
  ) {
    throw new InvalidMessageError("subject");
  }
  return printableAscii.test(subject) &&
    !subject.includes("=?") &&
    subject.length <= 76
    ? subject
    : encodeWords(subject);
}

/** RFC 5322 date in UTC, e.g. `Tue, 06 Oct 2026 09:00:00 +0000`. */
export function formatMessageDate(date: Date) {
  return date.toUTCString().replace(/GMT$/, "+0000");
}

function encodeBody(body: string) {
  if (body.includes("\u0000")) throw new InvalidMessageError("body");
  const normalized = body.replace(/\r\n?/g, "\n").replace(/\n/g, "\r\n");
  const encoded = Buffer.from(normalized, "utf8").toString("base64");
  return encoded.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

export function buildMimeMessage(message: OutgoingMessage) {
  if (!isHeaderSafeEmail(message.from)) throw new InvalidMessageError("from");
  if (!isHeaderSafeEmail(message.to)) throw new InvalidMessageError("to");
  const headers = [
    `From: ${message.from}`,
    `To: ${message.to}`,
    `Subject: ${encodeSubject(message.subject)}`,
    `Date: ${formatMessageDate(message.date)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];
  return `${headers.join("\r\n")}\r\n\r\n${encodeBody(message.body)}\r\n`;
}

/** Gmail's `raw` field: the whole message, base64url encoded. */
export function encodeForGmail(mime: string) {
  return Buffer.from(mime, "utf8").toString("base64url");
}
