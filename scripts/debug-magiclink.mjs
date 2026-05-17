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

const TEST_EMAIL = `dbg+${Date.now()}@dsgmcosta.dev`;
const { data: created } = await supa.auth.admin.createUser({
  email: TEST_EMAIL,
  email_confirm: true,
});
const userId = created.user.id;

const { data: link } = await supa.auth.admin.generateLink({
  type: "magiclink",
  email: TEST_EMAIL,
  options: { redirectTo: "https://diogo-eats.vercel.app/auth/callback" },
});

console.log("\naction_link:");
console.log(link.properties.action_link);
console.log("\nproperties:");
console.log(JSON.stringify(link.properties, null, 2));

await supa.auth.admin.deleteUser(userId);
