// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createMemoryStore } from "@/lib/admin/memoryStore";
import { consumeRateLimit, rateLimits } from "@/lib/admin/rateLimit";
import type { AdminStore } from "@/lib/admin/store";
import { now } from "@/tests/helpers/admin";

describe("rate limits", () => {
  it("allows each user up to the limit per window, then refuses", async () => {
    const store = createMemoryStore();
    const { limit } = rateLimits.retry;
    for (let used = 0; used < limit; used += 1) {
      expect(await consumeRateLimit(store, "retry", "alice", now)).toBe(true);
    }
    expect(await consumeRateLimit(store, "retry", "alice", now)).toBe(false);
    expect(await consumeRateLimit(store, "retry", "alice", now)).toBe(false);
  });

  it("counts users and actions separately", async () => {
    const store = createMemoryStore();
    for (let used = 0; used < rateLimits["gmail-connect"].limit; used += 1) {
      await consumeRateLimit(store, "gmail-connect", "alice", now);
    }
    expect(await consumeRateLimit(store, "gmail-connect", "alice", now)).toBe(
      false,
    );
    expect(await consumeRateLimit(store, "gmail-connect", "bob", now)).toBe(
      true,
    );
    expect(await consumeRateLimit(store, "gmail-manage", "alice", now)).toBe(
      true,
    );
  });

  it("starts again in the next window", async () => {
    const store = createMemoryStore();
    const { limit, windowMs } = rateLimits["bulk-send"];
    for (let used = 0; used < limit; used += 1) {
      await consumeRateLimit(store, "bulk-send", "alice", now);
    }
    expect(await consumeRateLimit(store, "bulk-send", "alice", now)).toBe(
      false,
    );
    const next = new Date(now.getTime() + windowMs);
    expect(await consumeRateLimit(store, "bulk-send", "alice", next)).toBe(
      true,
    );
  });

  it("keys on the user ID and passes store failures on, so callers fail closed", async () => {
    const keys: string[] = [];
    const recording = {
      ...createMemoryStore(),
      consumeRateLimit: async (key: string) => {
        keys.push(key);
        return true;
      },
    } satisfies AdminStore;
    await consumeRateLimit(recording, "send", "user-1", now);
    expect(keys).toEqual(["send:user-1"]);

    const failing = {
      ...createMemoryStore(),
      consumeRateLimit: async () => {
        throw new Error("ProvisionedThroughputExceededException");
      },
    } satisfies AdminStore;
    await expect(
      consumeRateLimit(failing, "send", "user-1", now),
    ).rejects.toThrow();
  });

  it("are generous enough for a five-person console but bounded", () => {
    for (const { limit, windowMs } of Object.values(rateLimits)) {
      expect(limit).toBeGreaterThan(0);
      expect(windowMs).toBeGreaterThanOrEqual(60_000);
    }
  });
});
