// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  delete (globalThis as { adminMemoryStore?: unknown }).adminMemoryStore;
});

async function load() {
  return (await import("@/lib/admin/getAdminStore")).getAdminStore;
}

describe("getAdminStore", () => {
  it("fails closed in production without a table", async () => {
    const getAdminStore = await load();
    expect(() => getAdminStore({ NODE_ENV: "production" })).toThrow(
      "ADMIN_TABLE_NAME is not set.",
    );
  });

  it("uses DynamoDB whenever a table is configured", async () => {
    const createDynamoStore = vi.fn(() => ({ kind: "dynamo" }));
    vi.doMock("@/lib/admin/dynamoStore", () => ({ createDynamoStore }));
    const getAdminStore = await load();

    expect(
      getAdminStore({
        NODE_ENV: "production",
        ADMIN_TABLE_NAME: " portfolio-admin ",
      }),
    ).toEqual({ kind: "dynamo" });
    expect(createDynamoStore).toHaveBeenCalledWith("portfolio-admin");
  });

  it("falls back to a shared in-memory store in development", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const getAdminStore = await load();
    const store = getAdminStore({ NODE_ENV: "development" });

    expect(await store.ownerExists()).toBe(false);
    expect(getAdminStore({ NODE_ENV: "development" })).toBe(store);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
