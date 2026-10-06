import { createDynamoStore } from "@/lib/admin/dynamoStore";
import { createMemoryStore } from "@/lib/admin/memoryStore";
import type { AdminStore } from "@/lib/admin/store";

let store: AdminStore | undefined;

/** Survives dev-server module reloads; never used in production. */
const devGlobal = globalThis as { adminMemoryStore?: AdminStore };

/**
 * DynamoDB whenever `ADMIN_TABLE_NAME` is set. Without it, production fails
 * closed, and development falls back to an in-process store that is lost on
 * restart.
 */
export function getAdminStore(
  env: Record<string, string | undefined> = process.env,
): AdminStore {
  if (store) return store;

  const tableName = env.ADMIN_TABLE_NAME?.trim();
  if (tableName) {
    store = createDynamoStore(tableName);
    return store;
  }

  if (env.NODE_ENV === "production") {
    throw new Error("ADMIN_TABLE_NAME is not set.");
  }

  if (!devGlobal.adminMemoryStore) {
    console.warn(
      "[admin] ADMIN_TABLE_NAME is not set; using a temporary in-memory store.",
    );
    devGlobal.adminMemoryStore = createMemoryStore();
  }
  store = devGlobal.adminMemoryStore;
  return store;
}
