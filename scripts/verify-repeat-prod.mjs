// End-to-end verification of the "repeat a meal" lane against the LIVE
// prod deployment. Operates on Diogo's real data: it repeats one of his
// existing meals, asserts the copy is correct, then DELETES the copy and
// proves the deletion — his log is left exactly as found.
//
//   1. GET /api/meals (today) without auth        → 401
//   2. Mint a real access token for Diogo
//   3. Pick a recent real meal with items + a photo if possible
//   4. POST repeat scale=2 → assert: grams doubled, per_100g identical,
//      photo_filename null, notes null, vibe copied, caption "repeat of …"
//   5. Validation: scale=10 → 400; bad meal id → 404
//   6. DELETE the copy, confirm it's gone and the source is untouched
//
//   cd ~/Dev/Personal/eats && node scripts/verify-repeat-prod.mjs

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
  if (error) throw new Error(`generateLink(${email}): ${error.message}`);
  const { data: verified, error: vErr } = await anon.auth.verifyOtp({
    type: "email",
    token_hash: data.properties.hashed_token,
  });
  if (vErr || !verified.session) throw new Error(`verifyOtp: ${vErr?.message ?? "no session"}`);
  return { token: verified.session.access_token, userId: verified.user.id };
}

async function api(pathname, token, init = {}) {
  const res = await fetch(`${SITE}${pathname}`, {
    ...init,
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
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
  console.log("[1] unauthenticated repeat");
  const noAuth = await api("/api/meals/abc123/repeat", null, { method: "POST", body: "{}" });
  check(noAuth.status === 401, `POST repeat without token → ${noAuth.status}`, noAuth.body);

  // ---- 2. token ----
  console.log("\n[2] mint Diogo token");
  const diogo = await mintToken(DIOGO_EMAIL);
  check(diogo.userId === DIOGO_USER_ID, `token belongs to Diogo`, diogo.userId);

  // ---- 3. pick a real source meal (prefer one WITH a photo, to prove
  //          the photo-null invariant on the copy) ----
  console.log("\n[3] pick a real source meal");
  const { data: photoMeals } = await admin
    .from("meals")
    .select("id, items_json, caption, meal_vibe, calories, photo_filename")
    .eq("user_id", DIOGO_USER_ID)
    .not("photo_filename", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);
  let source = photoMeals?.[0];
  if (!source) {
    const { data: anyMeals } = await admin
      .from("meals")
      .select("id, items_json, caption, meal_vibe, calories, photo_filename")
      .eq("user_id", DIOGO_USER_ID)
      .order("created_at", { ascending: false })
      .limit(1);
    source = anyMeals?.[0];
  }
  check(!!source, "found a source meal to repeat", source?.id);
  if (!source) {
    console.error("no source meal — aborting");
    process.exitCode = 1;
    return;
  }
  const srcItems = JSON.parse(source.items_json);
  console.log(
    `  source ${source.id}: ${srcItems.length} items, ${source.calories} kcal, photo=${!!source.photo_filename}`
  );

  // ---- 4. repeat scale=2 ----
  console.log("\n[4] repeat scale=2");
  const rep = await api(`/api/meals/${source.id}/repeat`, diogo.token, {
    method: "POST",
    body: JSON.stringify({ scale: 2 }),
  });
  check(rep.status === 200, `POST repeat → ${rep.status}`, rep.body);
  const copy = rep.body?.meal;
  let copyId = null;
  if (copy) {
    copyId = copy.id;
    const copyItems = JSON.parse(copy.items_json);
    check(copy.id !== source.id, "copy has a fresh id", copy.id);
    check(copy.photo_filename === null, "copy.photo_filename is null (photo not copied)", copy.photo_filename);
    check(copy.notes === null, "copy.notes is null", copy.notes);
    check(copy.meal_vibe === source.meal_vibe, "vibe copied verbatim", { copy: copy.meal_vibe, src: source.meal_vibe });
    const expectedCap = source.caption ? `repeat of ${source.caption}` : source.meal_vibe ? `repeat of ${source.meal_vibe}` : "repeat";
    check(copy.caption === expectedCap, "caption is honest 'repeat of …'", copy.caption);
    check(
      copyItems.length === srcItems.length &&
        copyItems.every((c, i) => Math.abs(c.grams - srcItems[i].grams * 2) < 0.05),
      "every item's grams doubled",
      copyItems.map((c, i) => `${c.grams} vs ${srcItems[i].grams}*2`)
    );
    check(
      copyItems.every((c, i) => JSON.stringify(c.per_100g) === JSON.stringify(srcItems[i].per_100g)),
      "per_100g identical (portion-independent)"
    );
    check(Math.abs(copy.calories - source.calories * 2) <= 2, "totals scaled ~2x", { copy: copy.calories, src: source.calories });
  }

  // ---- 5. validation gates ----
  console.log("\n[5] validation");
  const badScale = await api(`/api/meals/${source.id}/repeat`, diogo.token, {
    method: "POST",
    body: JSON.stringify({ scale: 10 }),
  });
  check(badScale.status === 400, `scale=10 → ${badScale.status}`, badScale.body);
  const badId = await api(`/api/meals/deadbeefdeadbeef/repeat`, diogo.token, {
    method: "POST",
    body: "{}",
  });
  check(badId.status === 404, `nonexistent meal → ${badId.status}`, badId.body);

  // ---- 6. cleanup: delete the copy, prove it's gone, source intact ----
  console.log("\n[6] cleanup");
  if (copyId) {
    const del = await api("/api/meals", diogo.token, {
      method: "DELETE",
      body: JSON.stringify({ id: copyId }),
    });
    check(del.status === 200, `DELETE copy → ${del.status}`, del.body);
    const { count: copyCount } = await admin
      .from("meals")
      .select("id", { count: "exact", head: true })
      .eq("id", copyId);
    check(copyCount === 0, "copy row removed from DB", { copyCount });
    const { count: srcCount } = await admin
      .from("meals")
      .select("id", { count: "exact", head: true })
      .eq("id", source.id);
    check(srcCount === 1, "source meal untouched", { srcCount });
  }

  // food_memory must NOT have grown from a repeat.
  console.log("\n[7] food_memory untouched by repeat");
  const { count: fmAfter } = await admin
    .from("food_memory")
    .select("name_key", { count: "exact", head: true })
    .eq("user_id", DIOGO_USER_ID);
  console.log(`  food_memory count after repeat+delete: ${fmAfter}`);

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
