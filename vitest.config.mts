import { compile } from "@mdx-js/mdx";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

/** Compiles `.mdx` the way `@next/mdx` does, including `mdx-components.tsx`. */
const mdx: Plugin = {
  name: "mdx",
  enforce: "pre",
  async transform(value, id) {
    if (!id.endsWith(".mdx")) {
      return null;
    }
    const file = await compile(
      { value, path: id },
      {
        providerImportSource: fileURLToPath(
          new URL("./mdx-components.tsx", import.meta.url),
        ),
      },
    );
    return { code: String(file.value), map: null };
  },
};

export default defineConfig({
  plugins: [mdx, react()],
  resolve: {
    tsconfigPaths: true,
    // `tsconfigPaths` only covers files tsconfig includes, which excludes MDX.
    alias: [
      {
        find: /^@\//,
        replacement: fileURLToPath(new URL("./", import.meta.url)),
      },
    ],
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/setup.ts"],
    // Tests that need a site URL stub it; the host environment never leaks in.
    env: { SITE_URL: "" },
  },
});
