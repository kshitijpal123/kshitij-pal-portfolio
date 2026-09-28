import { describe, expect, it } from "vitest";
import { createRateLimiter, getClientIp } from "@/lib/contact/rateLimit";

describe("createRateLimiter", () => {
  it("allows up to the limit within the window, per key", () => {
    const limiter = createRateLimiter({
      limit: 3,
      windowMs: 1000,
      now: () => 0,
    });

    expect([1, 2, 3, 4].map(() => limiter.consume("a"))).toEqual([
      true,
      true,
      true,
      false,
    ]);
    expect(limiter.consume("b")).toBe(true);
  });

  it("allows again once earlier attempts leave the window", () => {
    let time = 0;
    const limiter = createRateLimiter({
      limit: 2,
      windowMs: 1000,
      now: () => time,
    });

    limiter.consume("a");
    time = 500;
    limiter.consume("a");
    expect(limiter.consume("a")).toBe(false);

    time = 1001;
    expect(limiter.consume("a")).toBe(true);
    expect(limiter.consume("a")).toBe(false);
  });
});

describe("getClientIp", () => {
  it("uses the first x-forwarded-for address", () => {
    expect(
      getClientIp(
        new Headers({ "x-forwarded-for": "203.0.113.7, 198.51.100.2" }),
      ),
    ).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip, then a shared key", () => {
    expect(getClientIp(new Headers({ "x-real-ip": "203.0.113.9" }))).toBe(
      "203.0.113.9",
    );
    expect(getClientIp(new Headers())).toBe("unknown");
  });
});
