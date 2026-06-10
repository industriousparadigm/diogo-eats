// Build the Expo web app and stage it for same-origin hosting under /app.
//
// What this does, reproducibly:
//   1. Runs `expo export --platform web` inside mobile/ (single-output
//      SPA, baseUrl "/app" — both set in mobile/app.json).
//   2. Cleans the previous export out of public/app/ at the repo root.
//   3. Copies the fresh export into public/app/.
//
// The export output is COMMITTED (Vercel's Next build does not build the
// Expo app — see README). Re-run `npm run build:webapp` after any change
// to mobile/, then commit public/app/.
//
// Hard rules this honours: it NEVER runs `eas update`. It only does a
// local static export, which has nothing to do with EAS / OTA channels.

import { execSync } from "node:child_process";
import {
  rmSync,
  mkdirSync,
  cpSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const mobileDir = join(repoRoot, "mobile");
const exportDir = join(mobileDir, "dist-web"); // staging dir inside mobile/ (gitignored)
const publicAppDir = join(repoRoot, "public", "app");

function run(cmd, cwd) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit" });
}

// 1. Export the web bundle. --clear drops the stale staging dir first so
//    a removed file in mobile/ never lingers in the export.
run(`npx expo export --platform web --output-dir dist-web --clear`, mobileDir);

if (!existsSync(join(exportDir, "index.html"))) {
  throw new Error(
    `Export did not produce index.html in ${exportDir} — aborting before touching public/app.`
  );
}

// 2. Clean the previously-staged copy under public/app.
rmSync(publicAppDir, { recursive: true, force: true });
mkdirSync(publicAppDir, { recursive: true });

// 3. Copy the export into public/app.
cpSync(exportDir, publicAppDir, { recursive: true });

// Drop the staging dir — public/app/ is the committed artifact.
rmSync(exportDir, { recursive: true, force: true });

const top = readdirSync(publicAppDir).sort().join(", ");
console.log(`\nStaged Expo web export to public/app/`);
console.log(`Top-level entries: ${top}`);
