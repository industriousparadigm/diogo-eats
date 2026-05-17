// One-shot: change Diogo's auth.users.email from the okrasolar address
// to his personal gmail, and sync the email column on his user_profiles
// row. Idempotent: re-running finds him by id and skips if the email
// already matches.

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

const supa = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DIOGO_USER_ID = "47053402-614f-4a7d-bf36-54b9f3337bbe";
const NEW_EMAIL = "dsgmcosta@gmail.com";

async function main() {
  const { data: existing } = await supa.auth.admin.getUserById(DIOGO_USER_ID);
  if (!existing?.user) throw new Error("Diogo's auth user not found");
  console.log(`Current email: ${existing.user.email}`);
  if (existing.user.email?.toLowerCase() === NEW_EMAIL.toLowerCase()) {
    console.log("✓ Already on the new email; nothing to do.");
    return;
  }

  const { data, error } = await supa.auth.admin.updateUserById(DIOGO_USER_ID, {
    email: NEW_EMAIL,
    email_confirm: true, // skip re-confirmation
  });
  if (error) throw new Error(`updateUserById failed: ${error.message}`);
  console.log(`✓ Auth user email updated to ${data.user.email}`);

  const { error: pErr } = await supa
    .from("user_profiles")
    .update({ email: NEW_EMAIL, updated_at: Date.now() })
    .eq("user_id", DIOGO_USER_ID);
  if (pErr) throw new Error(`profile email update failed: ${pErr.message}`);
  console.log("✓ user_profiles.email synced");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
