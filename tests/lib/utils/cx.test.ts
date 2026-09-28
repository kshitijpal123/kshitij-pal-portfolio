import { describe, expect, it } from "vitest";
import { cx } from "@/lib/utils/cx";

describe("cx", () => {
  it("joins class names and skips falsy values", () => {
    expect(cx("a", false, "b", null, undefined, "", "c")).toBe("a b c");
  });
});
