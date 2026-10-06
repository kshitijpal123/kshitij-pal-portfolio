import { vi } from "vitest";

/** Thrown by the mocked `redirect()` / `notFound()`, like Next.js does. */
export class NavigationSignal extends Error {
  constructor(readonly to: string) {
    super(`NAVIGATE ${to}`);
  }
}

export type StoredCookie = {
  value: string;
  options?: Record<string, unknown>;
};

/**
 * Stand-ins for the Next.js request APIs, for `vi.mock` factories. The
 * cookie jar is shared so a test can sign in by setting a cookie.
 */
export function createNextRequestMocks() {
  const jar = new Map<string, StoredCookie>();
  return {
    jar,
    headers: {
      cookies: async () => ({
        get: (name: string) =>
          jar.has(name) ? { name, value: jar.get(name)?.value } : undefined,
        set: (
          name: string,
          value: string,
          options?: Record<string, unknown>,
        ) => {
          jar.set(name, { value, options });
        },
      }),
    },
    navigation: {
      redirect: (to: string) => {
        throw new NavigationSignal(to);
      },
      notFound: () => {
        throw new NavigationSignal("404");
      },
    },
    cache: { revalidatePath: vi.fn() },
    server: { connection: async () => {} },
  };
}
