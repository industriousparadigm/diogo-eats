// End-to-end verification of the "attach a photo to an existing meal" lane.
// Targets a configurable base URL (default the LOCAL dev server, since the
// new /api/meals/[id]/photo route isn't on prod yet):
//
//   BASE=http://127.0.0.1:3000 node scripts/verify-addphoto.mjs
//
// Owner's data is sacred. This creates ONE synthetic text meal (no photo),
// runs the full attach → replace → remove → delete-meal lifecycle on IT,
// and proves storage cleanup by listing the bucket before/after via the
// service role. Diogo's real meals are never touched.
//
//   1. auth gate (POST photo without token → 401)
//   2. mint Diogo token
//   3. insert a synthetic TEXT meal (photo_filename null)
//   4. snapshot bucket object count
//   5. attach a generated image → meal.photo_filename set, object uploaded
//   6. replace → filename CHANGES, old object gone, new object present
//   7. remove → photo_filename null, object gone (back to baseline count)
//   8. DELETE the meal → row gone, no orphaned storage objects
//
// Each API call uses the minted token (the verify-*-prod established
// pattern). The synthetic meal is inserted via admin only to avoid burning
// an LLM parse quota — the FEATURE under test (the photo endpoints) is
// always exercised through the authenticated live API.

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

const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const DIOGO_EMAIL = "dsgmcosta@gmail.com";
const DIOGO_USER_ID = "47053402-614f-4a7d-bf36-54b9f3337bbe";
const BUCKET = "photos";

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
    console.error(`  FAIL ${msg}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
}

async function mintToken(email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error(`generateLink(${email}): ${error.message}`);
  const { data: verified, error: vErr } = await anon.auth.verifyOtp({
    type: "email",
    token_hash: data.properties.hashed_token,
  });
  if (vErr || !verified.session) throw new Error(`verifyOtp: ${vErr?.message ?? "no session"}`);
  return { token: verified.session.access_token, userId: verified.user.id };
}

// List every object name in the bucket (paged) so we can diff before/after.
async function bucketObjects() {
  const names = new Set();
  let offset = 0;
  for (;;) {
    const { data, error } = await admin.storage.from(BUCKET).list("", { limit: 100, offset });
    if (error) throw new Error(`bucket list: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const o of data) names.add(o.name);
    if (data.length < 100) break;
    offset += 100;
  }
  return names;
}

async function bucketHas(name) {
  // list with a search on the exact name; exists iff returned.
  const { data, error } = await admin.storage.from(BUCKET).list("", { search: name, limit: 1 });
  if (error) throw new Error(`bucket has(${name}): ${error.message}`);
  return (data ?? []).some((o) => o.name === name);
}

async function genImage(label) {
  // A small distinct JPEG so each upload is real image bytes the route's
  // sharp-normalize will accept (and so the two attaches differ visually).
  const color = label === "first" ? { r: 30, g: 120, b: 60 } : { r: 150, g: 70, b: 30 };
  return sharp({ create: { width: 800, height: 600, channels: 3, background: color } })
    .jpeg()
    .toBuffer();
}

async function postPhoto(mealId, token, buf) {
  const form = new FormData();
  form.append("photo", new Blob([buf], { type: "image/jpeg" }), "test.jpg");
  const res = await fetch(`${BASE}/api/meals/${mealId}/photo`, {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: form,
  });
  let body = null;
  try {
    body = await res.json();
  } catch {}
  return { status: res.status, body };
}

async function deletePhoto(mealId, token) {
  const res = await fetch(`${BASE}/api/meals/${mealId}/photo`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` },
  });
  let body = null;
  try {
    body = await res.json();
  } catch {}
  return { status: res.status, body };
}

async function main() {
  console.log(`target: ${BASE}\n`);

  // ---- 1. auth gate ----
  console.log("[1] unauthenticated attach");
  const noAuth = await postPhoto("deadbeefdeadbeef", null, await genImage("first"));
  check(noAuth.status === 401, `POST photo without token → ${noAuth.status}`, noAuth.body);

  // ---- 2. token ----
  console.log("\n[2] mint Diogo token");
  const diogo = await mintToken(DIOGO_EMAIL);
  check(diogo.userId === DIOGO_USER_ID, "token belongs to Diogo", diogo.userId);

  // ---- 3. synthetic text meal ----
  console.log("\n[3] insert synthetic text meal (no photo)");
  const mealId = `addphototest${Math.random().toString(16).slice(2, 6).padEnd(4, "0")}`.slice(0, 16);
  const items = [
    {
      name: "verification oats",
      grams: 100,
      confidence: "high",
      is_plant: true,
      per_100g: { sat_fat_g: 1, soluble_fiber_g: 4, calories: 380, protein_g: 13 },
    },
  ];
  const { error: insErr } = await admin.from("meals").insert({
    id: mealId,
    user_id: DIOGO_USER_ID,
    created_at: Date.now(),
    photo_filename: null,
    items_json: JSON.stringify(items),
    sat_fat_g: 1,
    soluble_fiber_g: 4,
    calories: 380,
    protein_g: 13,
    plant_pct: 100,
    fat_g: 0,
    carbs_g: 0,
    sugar_g: 0,
    salt_g: 0,
    alcohol_g: 0,
    notes: null,
    caption: "ADDPHOTO VERIFICATION — synthetic, auto-deleted",
    meal_vibe: "verification meal",
  });
  check(!insErr, "synthetic meal inserted", insErr?.message);

  // ---- 4. bucket baseline ----
  console.log("\n[4] bucket baseline");
  const baseline = await bucketObjects();
  console.log(`  baseline object count: ${baseline.size}`);

  // ---- 5. attach ----
  console.log("\n[5] attach a generated photo");
  const attach = await postPhoto(mealId, diogo.token, await genImage("first"));
  check(attach.status === 200, `POST photo → ${attach.status}`, attach.body);
  const firstName = attach.body?.meal?.photo_filename;
  check(!!firstName, "meal.photo_filename set", firstName);
  check(/^[a-f0-9]{16}\.jpg$/.test(firstName ?? ""), "filename is a 16-hex .jpg", firstName);
  check(await bucketHas(firstName), "first object exists in bucket", firstName);

  // ---- 6. replace ----
  console.log("\n[6] replace the photo");
  const replace = await postPhoto(mealId, diogo.token, await genImage("second"));
  check(replace.status === 200, `POST photo (replace) → ${replace.status}`, replace.body);
  const secondName = replace.body?.meal?.photo_filename;
  check(!!secondName && secondName !== firstName, "filename CHANGED on replace", { firstName, secondName });
  check(await bucketHas(secondName), "new object exists in bucket", secondName);
  check(!(await bucketHas(firstName)), "OLD object deleted on replace (no orphan)", firstName);

  // ---- 7. remove ----
  console.log("\n[7] remove the photo");
  const remove = await deletePhoto(mealId, diogo.token);
  check(remove.status === 200, `DELETE photo → ${remove.status}`, remove.body);
  check(remove.body?.meal?.photo_filename === null, "photo_filename nulled", remove.body?.meal?.photo_filename);
  check(!(await bucketHas(secondName)), "removed object deleted from bucket", secondName);
  const afterRemove = await bucketObjects();
  check(afterRemove.size === baseline.size, "bucket back to baseline count after remove", {
    baseline: baseline.size,
    afterRemove: afterRemove.size,
  });

  // ---- 8. bad-request + ownership gates ----
  console.log("\n[8] validation gates");
  const noFile = await fetch(`${BASE}/api/meals/${mealId}/photo`, {
    method: "POST",
    headers: { authorization: `Bearer ${diogo.token}`, "content-type": "multipart/form-data; boundary=x" },
    body: "--x--\r\n",
  });
  check(noFile.status === 400, `POST with no file → ${noFile.status}`);
  const badId = await postPhoto("ffffffffffffffff", diogo.token, await genImage("first"));
  check(badId.status === 404, `attach to nonexistent meal → ${badId.status}`, badId.body);

  // ---- 9. delete the meal, prove full cleanup ----
  console.log("\n[9] delete the synthetic meal");
  const delMeal = await fetch(`${BASE}/api/meals`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${diogo.token}`, "content-type": "application/json" },
    body: JSON.stringify({ id: mealId }),
  });
  check(delMeal.status === 200, `DELETE meal → ${delMeal.status}`);
  const { count } = await admin
    .from("meals")
    .select("id", { count: "exact", head: true })
    .eq("id", mealId);
  check(count === 0, "synthetic meal row removed", { count });
  const finalObjects = await bucketObjects();
  check(finalObjects.size === baseline.size, "no orphaned storage objects (final == baseline)", {
    baseline: baseline.size,
    final: finalObjects.size,
  });

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
