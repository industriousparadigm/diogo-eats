// One-time cleanup: strip legacy "repeat of " prefixes from meal captions.
// The repeat lane used to prepend "repeat of " (and compounded it on re-repeat:
// "repeat of repeat of organic india psyllium"). The fix stops creating those;
// this fixes the rows already in the DB so day views read the real food name.
// Idempotent. Dry-run by default; pass --apply to write.
//
//   cd ~/Dev/Personal/eats && node scripts/cleanup-repeat-captions.mjs           # plan
//   cd ~/Dev/Personal/eats && node scripts/cleanup-repeat-captions.mjs --apply   # write

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
const APPLY = process.argv.includes("--apply");
const DIOGO = "47053402-614f-4a7d-bf36-54b9f3337bbe";

function stripRepeatPrefix(s) {
  let out = (s ?? "").trim();
  while (/^repeat of\s+/i.test(out)) out = out.replace(/^repeat of\s+/i, "").trim();
  return out;
}

const { data: rows, error } = await supa
  .from("meals")
  .select("id, caption, created_at")
  .eq("user_id", DIOGO)
  .ilike("caption", "repeat of%")
  .order("created_at", { ascending: false });
if (error) {
  console.error(error.message);
  process.exit(1);
}

console.log(`\n${APPLY ? "APPLYING" : "DRY RUN (pass --apply to write)"} — ${rows.length} captions with a "repeat of" prefix\n`);
let changed = 0;
for (const r of rows) {
  const cleaned = stripRepeatPrefix(r.caption);
  const next = cleaned || null; // empty → null (the meal's vibe still shows)
  console.log(`  ${new Date(r.created_at).toISOString().slice(0, 10)}  "${r.caption}"  ->  ${next === null ? "(null)" : `"${next}"`}`);
  if (APPLY) {
    const { error: uErr } = await supa
      .from("meals")
      .update({ caption: next })
      .eq("id", r.id)
      .eq("user_id", DIOGO);
    if (uErr) {
      console.error(`  ! ${r.id}: ${uErr.message}`);
      continue;
    }
    changed += 1;
  }
}
console.log(`\n${APPLY ? `Updated ${changed} captions.` : "(dry run — nothing written)"}`);
