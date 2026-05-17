// Call deriveTargets() directly in a Node process with the same env
// the prod route uses, so we can see the real Claude error if any.

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");
for (const line of fs
  .readFileSync(path.join(ROOT, ".env"), "utf-8")
  .split("\n")
  .filter((l) => l && !l.startsWith("#") && l.includes("="))) {
  const [k, ...rest] = line.split("=");
  process.env[k.trim()] = rest.join("=").trim().replace(/^"(.*)"$/, "$1");
}

// Lazy import so env is set before Anthropic SDK initialises.
const { deriveTargets } = await import("../lib/onboarding.ts");

try {
  const out = await deriveTargets({
    sex: "F",
    age: 32,
    weight_kg: 60,
    notes: "vegetarian; trying to keep LDL low; no strength training yet",
  });
  console.log("OK", JSON.stringify(out, null, 2));
} catch (err) {
  console.error("ERR", err.message);
  console.error(err);
}
