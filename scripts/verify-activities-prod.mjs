// End-to-end verification of the activities backend against the LIVE
// prod deployment. The write path runs as Diogo (real token, minted via
// the passwordless magic-link flow), creating a SYNTHETIC activity that
// is PATCHed then DELETEd at the end — so Diogo's real data (the seeded
// padel class) is left untouched. The seeded padel is asserted present
// before and after, proving the cleanup removed only the synthetic row.
//
//   1. GET /api/activities without auth                 → 401
//   2. Mint a real token for Diogo; GET the 30-day window → 200, and the
//      seeded padel class (12 Jun) is in it
//   3. POST invalid payloads with a valid token         → 400, no write
//   4. POST a synthetic activity                        → 200 { activity }
//   5. GET window now contains BOTH the synthetic and the seeded padel
//   6. PATCH the synthetic (change duration + effort)   → 200, fields changed
//   7. PATCH/DELETE a non-existent id                   → 404
//   8. DELETE the synthetic                             → 200 { ok }
//   9. GET window: synthetic gone, seeded padel REMAINS (real data safe)
//
//   cd ~/Dev/Personal/eats && node scripts/verify-activities-prod.mjs

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
const SEED_PADEL_ID = "ac71d017-2026-4612-9ad0-000000000001";

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon = createClient(env.SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failures = 0;
function check(cond, msg, detail) {
  if (cond) {
    console.log(`  ok   ${msg}`);
  } else {
    failures++;
    console.error(`  FAIL ${msg}${detail ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
}

// Passwordless app: no signInWithPassword. Mint a session by generating
// a magic link server-side and verifying its token_hash directly (same
// pattern as verify-strength-prod.mjs).
async function mintToken(email) {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error) throw new Error(`generateLink(${email}): ${error.message}`);
  const tokenHash = data.properties.hashed_token;
  const { data: verified, error: vErr } = await anon.auth.verifyOtp({
    type: "email",
    token_hash: tokenHash,
  });
  if (vErr || !verified.session) {
    throw new Error(`verifyOtp(${email}): ${vErr?.message ?? "no session"}`);
  }
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
  } catch {
    // non-JSON response — leave body null
  }
  return { status: res.status, body };
}

async function main() {
  console.log(`target: ${SITE}\n`);

  // ---- 1. auth gate ----
  console.log("[1] unauthenticated request");
  const noAuth = await api("/api/activities", null);
  check(noAuth.status === 401, `GET /api/activities without token → ${noAuth.status}`, noAuth.body);

  // ---- 2. Diogo's window (read) ----
  console.log("\n[2] Diogo's 30-day window");
  const diogo = await mintToken(DIOGO_EMAIL);
  check(diogo.userId === DIOGO_USER_ID, `minted token belongs to ${DIOGO_USER_ID}`, diogo.userId);

  const win = await api("/api/activities", diogo.token);
  check(win.status === 200, `GET /api/activities → ${win.status}`);
  check(Array.isArray(win.body?.activities), "response has an activities array", win.body);
  const seededBefore = (win.body?.activities ?? []).find((a) => a.id === SEED_PADEL_ID);
  check(!!seededBefore, "seeded padel class is in the window", win.body?.activities?.map((a) => a.id));
  check(
    seededBefore?.type === "padel" &&
      seededBefore?.label === "class" &&
      seededBefore?.duration_min === 90 &&
      seededBefore?.effort === "light" &&
      seededBefore?.source === "manual",
    "seeded padel fields intact",
    seededBefore
  );

  // ---- 3. validation gate (rejects before any write) ----
  console.log("\n[3] validation rejects");
  const cases = [
    [{ type: "yoga", duration_min: 30 }, "unknown type"],
    [{ type: "run" }, "missing duration_min"],
    [{ type: "run", duration_min: 0 }, "duration_min 0"],
    [{ type: "run", duration_min: 1441 }, "duration_min > 1440"],
    [{ type: "run", duration_min: 30, effort: "max" }, "bad effort"],
    [{ type: "run", duration_min: 30, distance_km: -1 }, "negative distance"],
  ];
  for (const [body, label] of cases) {
    const r = await api("/api/activities", diogo.token, {
      method: "POST",
      body: JSON.stringify(body),
    });
    check(r.status === 400, `POST ${label} → ${r.status}`, r.body);
  }
  const malformed = await api("/api/activities", diogo.token, {
    method: "POST",
    body: "not json",
  });
  check(malformed.status === 400, `POST non-JSON body → ${malformed.status}`, malformed.body);

  // ---- 4. create a synthetic activity ----
  console.log("\n[4] create synthetic activity");
  const now = Date.now();
  const post = await api("/api/activities", diogo.token, {
    method: "POST",
    body: JSON.stringify({
      type: "run",
      label: "verify run",
      started_at: now - 40 * 60 * 1000,
      duration_min: 28,
      effort: "moderate",
      distance_km: 5.1,
      note: "synthetic — deleted at end",
    }),
  });
  check(post.status === 200, `POST run → ${post.status}`, post.body);
  const created = post.body?.activity;
  check(
    created?.type === "run" &&
      created?.duration_min === 28 &&
      created?.effort === "moderate" &&
      created?.distance_km === 5.1 &&
      created?.source === "manual" &&
      created?.external_id === null,
    "created row has the posted fields, source 'manual', external_id null",
    created
  );
  const syntheticId = created?.id;
  if (!syntheticId) {
    console.error("  FAIL no id returned from POST — aborting before cleanup is needed");
    failures++;
    console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
    process.exitCode = 1;
    return;
  }

  let cleanedUp = false;
  try {
    // ---- 5. window contains both ----
    console.log("\n[5] window contains synthetic + seeded");
    const both = await api("/api/activities?days=7", diogo.token);
    const ids = (both.body?.activities ?? []).map((a) => a.id);
    check(ids.includes(syntheticId), "synthetic in 7-day window", ids);
    check(ids.includes(SEED_PADEL_ID), "seeded padel in 7-day window", ids);
    // newest-first ordering: synthetic (started ~now) before padel (11:00)
    const idxSyn = ids.indexOf(syntheticId);
    const idxPad = ids.indexOf(SEED_PADEL_ID);
    check(idxSyn >= 0 && idxPad >= 0 && idxSyn < idxPad, "newest-first ordering", { idxSyn, idxPad });

    // ---- 6. patch the synthetic ----
    console.log("\n[6] patch synthetic");
    const patch = await api(`/api/activities/${syntheticId}`, diogo.token, {
      method: "PATCH",
      body: JSON.stringify({ duration_min: 35, effort: "hard", note: null }),
    });
    check(patch.status === 200, `PATCH → ${patch.status}`, patch.body);
    check(
      patch.body?.activity?.duration_min === 35 &&
        patch.body?.activity?.effort === "hard" &&
        patch.body?.activity?.note === null &&
        patch.body?.activity?.type === "run", // untouched field preserved
      "patched fields changed, untouched fields preserved",
      patch.body?.activity
    );
    const badPatch = await api(`/api/activities/${syntheticId}`, diogo.token, {
      method: "PATCH",
      body: JSON.stringify({ effort: "max" }),
    });
    check(badPatch.status === 400, `PATCH invalid effort → ${badPatch.status}`, badPatch.body);

    // ---- 7. 404s on a non-existent id ----
    console.log("\n[7] 404 on missing id");
    const ghost = "00000000-0000-4000-8000-000000000000";
    const patch404 = await api(`/api/activities/${ghost}`, diogo.token, {
      method: "PATCH",
      body: JSON.stringify({ duration_min: 10 }),
    });
    check(patch404.status === 404, `PATCH missing id → ${patch404.status}`, patch404.body);
    const del404 = await api(`/api/activities/${ghost}`, diogo.token, { method: "DELETE" });
    check(del404.status === 404, `DELETE missing id → ${del404.status}`, del404.body);

    // ---- 8. delete the synthetic ----
    console.log("\n[8] delete synthetic");
    const del = await api(`/api/activities/${syntheticId}`, diogo.token, { method: "DELETE" });
    check(del.status === 200 && del.body?.ok === true, `DELETE → ${del.status}`, del.body);
    cleanedUp = true;
  } finally {
    // Belt-and-braces: if anything above threw before the explicit DELETE,
    // remove the synthetic row directly so prod stays clean.
    if (!cleanedUp) {
      await admin.from("activities").delete().eq("id", syntheticId);
      console.log(`  (cleanup) removed synthetic ${syntheticId} via service role`);
    }
  }

  // ---- 9. synthetic gone, seeded padel remains ----
  console.log("\n[9] cleanup proven, real data safe");
  const after = await api("/api/activities", diogo.token);
  const afterIds = (after.body?.activities ?? []).map((a) => a.id);
  check(!afterIds.includes(syntheticId), "synthetic removed from window", afterIds);
  const seededAfter = (after.body?.activities ?? []).find((a) => a.id === SEED_PADEL_ID);
  check(!!seededAfter, "seeded padel class STILL present (real data untouched)", afterIds);
  check(
    seededAfter?.duration_min === 90 && seededAfter?.effort === "light",
    "seeded padel unchanged by the verify run",
    seededAfter
  );

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
