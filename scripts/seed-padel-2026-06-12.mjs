// Seed Diogo's real padel activity for today (12 Jun 2026). The first
// general activity in the Movement tab — "how I moved" beyond the gym.
//
// Idempotent: the row uses a fixed UUID as its idempotency key, so
// re-running detects the existing row and exits without duplicating.
//
// NOTE ON THE HOUR: started_at is pinned to 11:00 Europe/Lisbon as a
// PLACEHOLDER. Diogo didn't record the exact start time; he can PATCH it
// later via PATCH /api/activities/[id] { started_at: <ms epoch> }. The
// date (12 Jun 2026) and everything else (padel, class, 90min, light) are
// real.
//
//   cd ~/Dev/Personal/eats && node scripts/seed-padel-2026-06-12.mjs

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

const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supa = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DIOGO_USER_ID = "47053402-614f-4a7d-bf36-54b9f3337bbe"; // lib/user.ts
const SEED_ACTIVITY_ID = "ac71d017-2026-4612-9ad0-000000000001"; // fixed = idempotency key

// 12 Jun 2026: Lisbon runs WEST (UTC+1 in June), so 11:00 Lisbon = 10:00 UTC.
// The hour is a PLACEHOLDER — see header.
const STARTED_AT = Date.UTC(2026, 5, 12, 10, 0); // 11:00 Lisbon

const ROW = {
  id: SEED_ACTIVITY_ID,
  user_id: DIOGO_USER_ID,
  type: "padel",
  label: "class",
  started_at: STARTED_AT,
  duration_min: 90,
  effort: "light",
  distance_km: null,
  note: null,
  source: "manual",
  external_id: null,
};

async function main() {
  // Already seeded?
  const { data: existing, error: exErr } = await supa
    .from("activities")
    .select("id, type, label, started_at, duration_min, effort, source")
    .eq("id", SEED_ACTIVITY_ID)
    .maybeSingle();
  if (exErr) throw new Error(`activity check failed: ${exErr.message}`);
  if (existing) {
    console.log(`padel activity already seeded (${SEED_ACTIVITY_ID}) — nothing to do.`);
    console.log(JSON.stringify(existing, null, 2));
    return;
  }

  const { data: inserted, error: insErr } = await supa
    .from("activities")
    .insert(ROW)
    .select(
      "id, type, label, started_at, duration_min, effort, distance_km, note, source, external_id, created_at"
    )
    .single();
  if (insErr) throw new Error(`insert failed: ${insErr.message}`);

  console.log(
    `seeded padel activity: ${inserted.id}`,
    `\n  type        ${inserted.type}`,
    `\n  label       ${inserted.label}`,
    `\n  started_at  ${new Date(inserted.started_at).toISOString()} (11:00 Lisbon, PLACEHOLDER hour)`,
    `\n  duration    ${inserted.duration_min} min`,
    `\n  effort      ${inserted.effort}`,
    `\n  source      ${inserted.source}`,
    `\n  created_at  ${new Date(inserted.created_at).toISOString()}`
  );
  console.log(`\nrow: ${JSON.stringify(inserted)}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
