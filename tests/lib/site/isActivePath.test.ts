import { describe, expect, it } from "vitest";
import { isActivePath } from "@/lib/site/isActivePath";

describe("isActivePath", () => {
  it.each([
    ["/", "/", true],
    ["/work", "/", false],
    ["/work", "/work", true],
    ["/work/billsync", "/work", true],
    ["/engineering/node-event-loop", "/engineering", true],
    ["/engineering", "/work", false],
    ["/workshop", "/work", false],
    ["/about", "/contact", false],
    ["/experience", "/experience", true],
    ["/experiences", "/experience", false],
    ["/experience", "/about", false],
    ["/about", "/experience", false],
  ] as const)("pathname %s with href %s is %s", (pathname, href, expected) => {
    expect(isActivePath(pathname, href)).toBe(expected);
  });
});
