/*
 * Bundles the scheduled-send function (lib/admin/scheduleHandler.ts) into a
 * single ES module with its dependencies. It does not include the site, and
 * it does not need `next build`. Run it after package-server, which clears
 * `.aws-build`.
 *
 * Usage: node infra/package-scheduler.mts
 */
import { rmSync } from "node:fs";
import { build } from "esbuild";

const outDir = ".aws-build/scheduler";

rmSync(outDir, { recursive: true, force: true });
await build({
  entryPoints: ["lib/admin/scheduleHandler.ts"],
  outfile: `${outDir}/index.mjs`,
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  tsconfig: "tsconfig.json",
  minify: true,
  legalComments: "none",
  // CommonJS dependencies call require() for Node built-ins.
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  logLevel: "warning",
});

console.log(`Scheduler package assembled in ${outDir}`);
