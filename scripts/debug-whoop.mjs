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

const { data: conn } = await supa
  .from("whoop_connections")
  .select("*")
  .eq("user_id", DIOGO_USER_ID)
  .maybeSingle();

if (!conn) { console.error("no connection"); process.exit(1); }
console.log("scopes:", conn.scopes);
console.log("last_sync_status:", conn.last_sync_status);
console.log("last_sync_error:", conn.last_sync_error);

const token = conn.access_token;
const since = new Date(Date.now() - 7 * 86400_000).toISOString();
const base = "https://api.prod.whoop.com/developer/v2";

for (const path of [
  "/user/profile/basic",
  `/cycle?start=${encodeURIComponent(since)}&limit=10`,
  `/recovery?start=${encodeURIComponent(since)}&limit=10`,
  `/activity/workout?start=${encodeURIComponent(since)}&limit=10`,
]) {
  const r = await fetch(`${base}${path}`, { headers: { authorization: `Bearer ${token}` } });
  const body = await r.text();
  console.log(`\n=== GET ${path} → ${r.status} ===`);
  try {
    const parsed = JSON.parse(body);
    console.log(JSON.stringify(parsed, null, 2).slice(0, 800));
  } catch {
    console.log(body.slice(0, 400));
  }
}
