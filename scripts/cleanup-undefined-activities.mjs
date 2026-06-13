// One-off cleanup: remove imported "undefined" activities that don't clear
// the new 30-minute floor for Whoop's generic, unlabelled "activity" sport.
//
// The importer now drops a workout that maps to type 'other' with a NULL
// label (Whoop's generic "activity", NOT functional-fitness, which carries
// the "functional fitness" label) unless it's at least 30 min long. Rows of
// that shape that were imported under the OLD 20-min floor are now noise —
// Diogo asked to clear them out. There should be exactly one: a 21-min
// generic "activity" on 2026-05-09.
//
// Prints the matching rows first, then DELETEs them.
//
//   cd ~/Dev/Personal/eats && node scripts/cleanup-undefined-activities.mjs

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

const DIOGO = "47053402-614f-4a7d-bf36-54b9f3337bbe";
const UNDEFINED_FLOOR_MIN = 30; // mirrors MIN_UNDEFINED_MIN in the importer

const lisbon = (ts) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ts));

async function main() {
  // type 'other' + null label = Whoop's generic unlabelled "activity".
  // Under-floor ones are the noise to clear.
  const { data: rows, error } = await supa
    .from("activities")
    .select("id, type, label, started_at, duration_min, strain, source, external_id")
    .eq("user_id", DIOGO)
    .eq("type", "other")
    .is("label", null)
    .lt("duration_min", UNDEFINED_FLOOR_MIN)
    .order("started_at", { ascending: false });
  if (error) throw new Error(`load candidates: ${error.message}`);

  if (!rows || rows.length === 0) {
    console.log(
      `No undefined activities under the ${UNDEFINED_FLOOR_MIN}min floor — nothing to delete.`
    );
    return;
  }

  console.log(`\nWill DELETE ${rows.length} undefined activit${rows.length === 1 ? "y" : "ies"} (type 'other', no label, < ${UNDEFINED_FLOOR_MIN}min):\n`);
  for (const r of rows) {
    console.log(
      `  ${lisbon(r.started_at)}  ${String(r.duration_min).padStart(3)}min  ${r.id}  (strain=${r.strain}, source=${r.source})`
    );
  }

  const ids = rows.map((r) => r.id);
  const { data: deleted, error: delErr } = await supa
    .from("activities")
    .delete()
    .eq("user_id", DIOGO)
    .in("id", ids)
    .select("id, started_at, duration_min");
  if (delErr) throw new Error(`delete: ${delErr.message}`);

  console.log(`\nDELETED ${deleted.length} row(s):`);
  for (const r of deleted) {
    console.log(`  ${lisbon(r.started_at)}  ${r.duration_min}min  ${r.id}`);
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
