// Trigger a magic-link email via Supabase. Uses the anon client +
// signInWithOtp so the new email template (token_hash flow) is the
// one that goes out.
//
//   node scripts/send-magic-link.mjs you@example.com

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");
const env = fs
  .readFileSync(path.join(ROOT, ".env"), "utf-8")
  .split("\n")
  .filter((l) => l && !l.startsWith("#") && l.includes("="))
  .reduce((acc, line) => {
    const [k, ...rest] = line.split("=");
    acc[k.trim()] = rest.join("=").trim().replace(/^"(.*)"$/, "$1");
    return acc;
  }, {});

const email = process.argv[2];
if (!email) {
  console.error("usage: node scripts/send-magic-link.mjs <email>");
  process.exit(1);
}

// Check allowlist locally so we don't waste a send.
const allowed = (env.ALLOWED_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
if (!allowed.includes(email.toLowerCase())) {
  console.error(
    `✗ ${email} is not on ALLOWED_EMAILS (${allowed.join(", ") || "empty"})`
  );
  process.exit(1);
}

const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const { error } = await supa.auth.signInWithOtp({
  email,
  options: {
    shouldCreateUser: true,
    emailRedirectTo: "https://diogo-eats.vercel.app/auth/callback",
  },
});
if (error) {
  console.error(`✗ ${email}: ${error.message}`);
  process.exit(1);
}
console.log(`✓ magic link sent to ${email}`);
