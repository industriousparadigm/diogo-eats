// End-to-end verification of the composer lane against the LIVE prod
// deployment. To avoid permanently inflating a real food's times_seen,
// the write path runs on SYNTHETIC library foods created up front and
// deleted at the end. The composed meal is also deleted and proven gone.
//
//   1. POST /api/meals/compose without auth        → 401
//   2. Mint Diogo token; seed two synthetic library foods
//   3. Compose a meal from them → items confidence high, photo/notes
//      null, rule-based vibe, totals correct
//   4. times_seen bumped on each used food
//   5. validation: unknown food → 400, grams 0 → 400, empty → 400
//   6. delete the meal + synthetic foods, prove all gone
//
//   cd ~/Dev/Personal/eats && node scripts/verify-compose-prod.mjs

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

const SITE = "https://diogo-eats.vercel.app";
const DIOGO_EMAIL = "dsgmcosta@gmail.com";
const DIOGO_USER_ID = "47053402-614f-4a7d-bf36-54b9f3337bbe";
const PREFIX = "ZZ-Compose";

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon = createClient(env.SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failures = 0;
function check(cond, msg, detail) {
  if (cond) console.log(`  ok   ${msg}`);
  else {
    failures++;
    console.error(`  FAIL ${msg}${detail ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
}

async function mintToken(email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error(`generateLink: ${error.message}`);
  const { data: v, error: vErr } = await anon.auth.verifyOtp({ type: "email", token_hash: data.properties.hashed_token });
  if (vErr || !v.session) throw new Error(`verifyOtp: ${vErr?.message ?? "no session"}`);
  return { token: v.session.access_token, userId: v.user.id };
}

async function api(pathname, token, init = {}) {
  const hasBody = init.json !== undefined || init.body !== undefined;
  const method = init.method ?? (hasBody ? "POST" : "GET");
  const res = await fetch(`${SITE}${pathname}`, {
    method,
    headers: {
      ...(init.json !== undefined ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
  let body = null;
  try {
    body = await res.json();
  } catch {}
  return { status: res.status, body };
}

async function main() {
  console.log(`target: ${SITE}\n`);

  // ---- 1. auth gate ----
  console.log("[1] auth gate");
  const noAuth = await api("/api/meals/compose", null, { json: { items: [] } });
  check(noAuth.status === 401, `POST compose without token → ${noAuth.status}`, noAuth.body);

  // ---- 2. token + seed synthetic foods ----
  console.log("\n[2] seed synthetic library foods");
  const diogo = await mintToken(DIOGO_EMAIL);
  check(diogo.userId === DIOGO_USER_ID, "token belongs to Diogo");

  const oats = await api("/api/foods", diogo.token, {
    json: { display_name: `${PREFIX} Oats`, is_plant: true, per_100g: { sat_fat_g: 1.2, soluble_fiber_g: 4, calories: 380, protein_g: 13 } },
  });
  const butter = await api("/api/foods", diogo.token, {
    json: { display_name: `${PREFIX} Butter`, is_plant: false, per_100g: { sat_fat_g: 51, soluble_fiber_g: 0, calories: 717, protein_g: 1 } },
  });
  const oatsKey = oats.body?.food?.name_key;
  const butterKey = butter.body?.food?.name_key;
  check(!!oatsKey && !!butterKey, "two synthetic foods created", { oatsKey, butterKey });
  const oatsSeen0 = oats.body?.food?.times_seen;

  // ---- 3. compose ----
  console.log("\n[3] compose a meal");
  const comp = await api("/api/meals/compose", diogo.token, {
    json: { items: [{ food_id: oatsKey, grams: 80 }, { food_id: butterKey, grams: 10 }] },
  });
  check(comp.status === 200, `POST compose → ${comp.status}`, comp.body);
  const meal = comp.body?.meal;
  let mealId = null;
  if (meal) {
    mealId = meal.id;
    const items = JSON.parse(meal.items_json);
    check(items.length === 2, "two items composed", items.length);
    check(items.every((i) => i.confidence === "high"), "every item confidence 'high'");
    check(meal.photo_filename === null, "photo null", meal.photo_filename);
    check(meal.notes === null, "notes null", meal.notes);
    check(typeof meal.meal_vibe === "string" && meal.meal_vibe.length > 0, "rule-based vibe present", meal.meal_vibe);
    // 80g oats (304 kcal) + 10g butter (71.7 kcal) = ~376; plant 80g/90g = 89%.
    check(Math.abs(meal.calories - Math.round(380 * 0.8 + 717 * 0.1)) <= 1, "totals computed correctly", meal.calories);
    check(meal.plant_pct === 89, "plant_pct mass-weighted (80/90 = 89%)", meal.plant_pct);
    console.log(`  composed: ${meal.calories} kcal, ${meal.plant_pct}% plant, vibe "${meal.meal_vibe}"`);
  }

  // ---- 4. times_seen bump ----
  console.log("\n[4] times_seen bump");
  const { data: oatsRow } = await admin
    .from("food_memory")
    .select("times_seen")
    .eq("user_id", DIOGO_USER_ID)
    .eq("name_key", oatsKey)
    .maybeSingle();
  check(oatsRow?.times_seen === oatsSeen0 + 1, "oats times_seen +1 after compose", { before: oatsSeen0, after: oatsRow?.times_seen });

  // ---- 5. validation ----
  console.log("\n[5] validation");
  const unknown = await api("/api/meals/compose", diogo.token, { json: { items: [{ food_id: "zzz-no-such-food", grams: 50 }] } });
  check(unknown.status === 400, `unknown food → ${unknown.status}`, unknown.body);
  const badGrams = await api("/api/meals/compose", diogo.token, { json: { items: [{ food_id: oatsKey, grams: 0 }] } });
  check(badGrams.status === 400, `grams 0 → ${badGrams.status}`);
  const empty = await api("/api/meals/compose", diogo.token, { json: { items: [] } });
  check(empty.status === 400, `empty items → ${empty.status}`);

  // ---- 6. cleanup ----
  console.log("\n[6] cleanup");
  if (mealId) {
    await api("/api/meals", diogo.token, { method: "DELETE", json: { id: mealId } });
    const { count } = await admin.from("meals").select("id", { count: "exact", head: true }).eq("id", mealId);
    check(count === 0, "composed meal deleted", { count });
  }
  for (const key of [oatsKey, butterKey]) {
    if (key) await api(`/api/foods/${encodeURIComponent(key)}`, diogo.token, { method: "DELETE" });
  }
  const { count: leftovers } = await admin
    .from("food_memory")
    .select("name_key", { count: "exact", head: true })
    .eq("user_id", DIOGO_USER_ID)
    .ilike("display_name", `${PREFIX}%`);
  check(leftovers === 0, "synthetic foods removed", { leftovers });

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
