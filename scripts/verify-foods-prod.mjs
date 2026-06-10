// End-to-end verification of the foods library against the LIVE prod
// deployment. Read-only for Diogo's existing foods; the write paths are
// exercised on synthetic entries (clearly prefixed) that are deleted at
// the end and proven gone.
//
//   1. GET /api/foods without auth                 → 401
//   2. Mint Diogo token; GET /api/foods → his real library, provenance
//      present, search by q works
//   3. POST manual add → user_corrected; PATCH nutrition → stays
//      user_corrected; bad per_100g → 400
//   4. Merge: two dupes → times_seen summed, one row removed
//   5. from-label: synthetic Chocapic panel → label_verified entry with
//      transcribed numbers; a non-label image → 422
//   6. Delete every synthetic entry, prove the library is back to its
//      starting count
//
//   cd ~/Dev/Personal/eats && node scripts/verify-foods-prod.mjs

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
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
const PREFIX = "ZZ-Verify";

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

async function labelImage() {
  const svg = `<svg width="800" height="1000" xmlns="http://www.w3.org/2000/svg"><rect width="800" height="1000" fill="white"/><text x="40" y="70" font-size="44" font-family="Arial" font-weight="bold">${PREFIX} Cereal</text><text x="40" y="130" font-size="30" font-family="Arial">Nutrition / per 100g</text><text x="40" y="220" font-size="34" font-family="Arial">Energy: 384 kcal</text><text x="40" y="290" font-size="34" font-family="Arial">Fat: 6.0 g</text><text x="80" y="350" font-size="30" font-family="Arial">of which saturates: 1.5 g</text><text x="40" y="420" font-size="34" font-family="Arial">Carbohydrate: 74 g</text><text x="80" y="480" font-size="30" font-family="Arial">of which sugars: 25 g</text><text x="40" y="550" font-size="34" font-family="Arial">Fibre: 6.0 g</text><text x="40" y="620" font-size="34" font-family="Arial">Protein: 8.0 g</text><text x="40" y="690" font-size="34" font-family="Arial">Salt: 0.40 g</text><text x="40" y="800" font-size="26" font-family="Arial">Ingredients: wheat, sugar, cocoa.</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

async function main() {
  console.log(`target: ${SITE}\n`);

  // ---- 1. auth gate ----
  console.log("[1] auth gate");
  const noAuth = await api("/api/foods", null);
  check(noAuth.status === 401, `GET /api/foods without token → ${noAuth.status}`, noAuth.body);

  // ---- 2. read Diogo's library ----
  console.log("\n[2] Diogo's library");
  const diogo = await mintToken(DIOGO_EMAIL);
  check(diogo.userId === DIOGO_USER_ID, "token belongs to Diogo");
  const { count: startCount } = await admin
    .from("food_memory")
    .select("name_key", { count: "exact", head: true })
    .eq("user_id", DIOGO_USER_ID);
  console.log(`  starting library size: ${startCount}`);
  const list = await api("/api/foods?limit=5", diogo.token);
  check(list.status === 200, `GET /api/foods → ${list.status}`);
  check(Array.isArray(list.body?.foods) && list.body.foods.length > 0, "library is non-empty");
  check(list.body.foods.every((f) => typeof f.provenance === "string"), "every row carries provenance");
  const search = await api("/api/foods?q=coffee&limit=10", diogo.token);
  check(
    search.body?.foods?.every((f) => f.display_name.toLowerCase().includes("coffee")),
    "search q=coffee returns only matches",
    search.body?.foods?.map((f) => f.display_name)
  );

  const synthKeys = [];

  // ---- 3. manual add + patch + validation ----
  console.log("\n[3] manual add / patch / validation");
  const add = await api("/api/foods", diogo.token, {
    json: { display_name: `${PREFIX} Tofu`, is_plant: true, per_100g: { sat_fat_g: 1, soluble_fiber_g: 0.3, calories: 120, protein_g: 12 } },
  });
  check(add.status === 200, `POST add → ${add.status}`, add.body);
  const tofuKey = add.body?.food?.name_key;
  if (tofuKey) synthKeys.push(tofuKey);
  check(add.body?.food?.provenance === "user_corrected", "manual add → user_corrected", add.body?.food?.provenance);

  const patch = await api(`/api/foods/${encodeURIComponent(tofuKey)}`, diogo.token, {
    method: "PATCH",
    json: { per_100g: { sat_fat_g: 1.2, soluble_fiber_g: 0.4, calories: 130, protein_g: 13 } },
  });
  const patched = JSON.parse(patch.body?.food?.per_100g_json ?? "{}");
  check(patch.status === 200 && patched.calories === 130, "PATCH nutrition applied", patched);
  check(patch.body?.food?.provenance === "user_corrected", "edit keeps user_corrected");

  const badAdd = await api("/api/foods", diogo.token, {
    json: { display_name: "x", is_plant: true, per_100g: { calories: 5 } },
  });
  check(badAdd.status === 400, `bad per_100g → ${badAdd.status}`);

  // ---- 4. merge ----
  console.log("\n[4] merge");
  const a = await api("/api/foods", diogo.token, { json: { display_name: `${PREFIX} Keep`, is_plant: true, per_100g: { sat_fat_g: 0, soluble_fiber_g: 0, calories: 10, protein_g: 0 } } });
  const b = await api("/api/foods", diogo.token, { json: { display_name: `${PREFIX} Dupe`, is_plant: true, per_100g: { sat_fat_g: 0, soluble_fiber_g: 0, calories: 10, protein_g: 0 } } });
  const keepKey = a.body?.food?.name_key;
  const dupeKey = b.body?.food?.name_key;
  if (keepKey) synthKeys.push(keepKey);
  const merge = await api("/api/foods/merge", diogo.token, { json: { keep_id: keepKey, merge_ids: [dupeKey] } });
  check(merge.status === 200 && merge.body?.food?.times_seen === 2, "merge sums times_seen (1+1=2)", merge.body?.food?.times_seen);
  const { count: dupeGone } = await admin.from("food_memory").select("name_key", { count: "exact", head: true }).eq("user_id", DIOGO_USER_ID).eq("name_key", dupeKey);
  check(dupeGone === 0, "merged dupe row removed", { dupeGone });

  // ---- 5. from-label ----
  console.log("\n[5] from-label (real Vision read)");
  const img = await labelImage();
  const fd = new FormData();
  fd.append("photo", new Blob([img], { type: "image/jpeg" }), "label.jpg");
  const label = await api("/api/foods/from-label", diogo.token, { body: fd });
  check(label.status === 200, `from-label → ${label.status}`, label.body);
  const lf = label.body?.food;
  if (lf) {
    synthKeys.push(lf.name_key);
    const lp = JSON.parse(lf.per_100g_json);
    check(lf.provenance === "label_verified", "label read → label_verified", lf.provenance);
    check(Math.abs(lp.calories - 384) <= 2, "transcribed kcal ~384", lp.calories);
    check(Math.abs(lp.sat_fat_g - 1.5) <= 0.3, "transcribed sat_fat ~1.5", lp.sat_fat_g);
    check(Math.abs(lp.salt_g - 0.4) <= 0.1, "transcribed salt ~0.40", lp.salt_g);
    console.log(`  label entry: "${lf.display_name}" ${lf.per_100g_json}`);
  }
  // non-label → 422 (a 1x1 solid image has no panel)
  const blank = await sharp({ create: { width: 200, height: 200, channels: 3, background: { r: 30, g: 30, b: 30 } } }).jpeg().toBuffer();
  const fd2 = new FormData();
  fd2.append("photo", new Blob([blank], { type: "image/jpeg" }), "blank.jpg");
  const nonLabel = await api("/api/foods/from-label", diogo.token, { body: fd2 });
  check(nonLabel.status === 422, `non-label image → ${nonLabel.status}`, nonLabel.body);

  // ---- 6. cleanup ----
  console.log("\n[6] cleanup");
  for (const key of synthKeys) {
    await api(`/api/foods/${encodeURIComponent(key)}`, diogo.token, { method: "DELETE" });
  }
  const { count: endCount } = await admin
    .from("food_memory")
    .select("name_key", { count: "exact", head: true })
    .eq("user_id", DIOGO_USER_ID);
  check(endCount === startCount, "library back to its starting size", { startCount, endCount });
  // belt-and-braces: no ZZ-Verify rows remain
  const { count: leftovers } = await admin
    .from("food_memory")
    .select("name_key", { count: "exact", head: true })
    .eq("user_id", DIOGO_USER_ID)
    .ilike("display_name", `${PREFIX}%`);
  check(leftovers === 0, "no synthetic rows left behind", { leftovers });

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
