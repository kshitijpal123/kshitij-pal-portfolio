/*
 * Assembles the Lambda code package from `next build` output:
 * `.next/standalone` (server.js and traced node_modules), `public/`, and the
 * handler script. `/_next/static` is not included; it is uploaded to S3.
 *
 * Usage: npm run build && node infra/package-server.mts
 */
import { chmodSync, cpSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const standalone = ".next/standalone";
const outDir = ".aws-build/server";

if (!existsSync(join(standalone, "server.js"))) {
  throw new Error(
    `${standalone}/server.js is missing. Run \`npm run build\` first.`,
  );
}

rmSync(".aws-build", { recursive: true, force: true });
cpSync(standalone, outDir, { recursive: true });

// Next.js copies local .env files into standalone output; secrets reach the
// function only through its Lambda configuration.
for (const entry of readdirSync(outDir)) {
  if (entry.startsWith(".env")) rmSync(join(outDir, entry), { force: true });
}

if (existsSync("public")) {
  cpSync("public", join(outDir, "public"), { recursive: true });
}

cpSync("infra/lambda/run.sh", join(outDir, "run.sh"));
chmodSync(join(outDir, "run.sh"), 0o755);

console.log(`Lambda package assembled in ${outDir}`);
