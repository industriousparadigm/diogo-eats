// End-to-end verification of the user-exercises + alternatives backend
// against LIVE prod. Diogo's data is READ-ONLY: his catalog (5 seeded
// exercises) and sessions are never mutated. The ONE write — a clearly
// synthetic test exercise — is created via the live API as Diogo, then
// deleted via the service role at the end, and the catalog is proven back
// to its 5-row baseline.
//
//   1. Auth gate: POST both new endpoints without a token → 401
//   2. Baseline: Diogo's overview has exactly 5 exercises (all created_by
//      null — the seeded catalog)
//   3. Create: POST a synthetic exercise → { exercise } with a slugged id,
//      created_by = Diogo, image_key null. Overview now shows 6, and the
//      new one carries never_done prefill defaults (flows through
//      buildOverview untouched).
//   4. Dedupe: re-POST the same name → 409 + the existing exercise echoed.
//   5. Validation: bad measurement_type → 400 (no write).
//   6. Alternatives (LIVE Sonnet call): POST { exercise_id: "seated-row" }
//      → ranked catalog subs, every id real + not the blocked one, every
//      reason non-empty. 404 for an unknown exercise id.
//   7. Cleanup: service-role delete of the synthetic row → catalog back to
//      the 5-row baseline, all created_by null.
//
//   cd ~/Dev/Personal/eats && node scripts/verify-strength-exercises-prod.mjs

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
// A real row substitute, so that when we block seated-row the catalog
// genuinely contains a strong same-pattern sub the model should rank —
// this exercises the catalog-ranking path end-to-end, not just the
// honest-empty branch the tiny seeded catalog otherwise forces.
const SYNTHETIC_NAME = `ZZ Verify Chest-Supported Row ${Date.now()}`;

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
    // non-JSON — leave null
  }
  return { status: res.status, body };
}

async function main() {
  console.log(`target: ${SITE}\n`);
  let createdId = null;

  try {
    // ---- 1. auth gate ----
    console.log("[1] unauthenticated");
    const noAuthCreate = await api("/api/strength/exercises", null, {
      method: "POST",
      body: JSON.stringify({ name: "x", measurement_type: "weight_reps" }),
    });
    check(noAuthCreate.status === 401, `POST exercises without token → ${noAuthCreate.status}`);
    const noAuthAlt = await api("/api/strength/alternatives", null, {
      method: "POST",
      body: JSON.stringify({ exercise_id: "seated-row" }),
    });
    check(noAuthAlt.status === 401, `POST alternatives without token → ${noAuthAlt.status}`);

    const diogo = await mintToken(DIOGO_EMAIL);
    check(diogo.userId === DIOGO_USER_ID, `minted token belongs to Diogo`, diogo.userId);

    // ---- 2. baseline (read-only) ----
    console.log("\n[2] baseline catalog");
    const ov0 = await api("/api/strength/overview", diogo.token);
    const cat0 = ov0.body?.exercises ?? [];
    check(cat0.length === 5, `5 exercises at baseline`, cat0.map((e) => e.id));
    check(
      cat0.every((e) => e.created_by == null),
      "all seeded exercises have created_by null"
    );

    // ---- 3. create a synthetic exercise ----
    console.log("\n[3] create exercise");
    const created = await api("/api/strength/exercises", diogo.token, {
      method: "POST",
      body: JSON.stringify({
        name: SYNTHETIC_NAME,
        measurement_type: "weight_reps",
        description: "Chest on the pad, pull the handles to your ribs, squeeze the shoulder blades. Synthetic verify row — safe to delete.",
      }),
    });
    check(created.status === 200, `POST create → ${created.status}`, created.body);
    const ex = created.body?.exercise;
    createdId = ex?.id ?? null;
    check(!!createdId, "returned exercise has an id", ex);
    check(ex?.created_by === DIOGO_USER_ID, "created_by = Diogo", ex?.created_by);
    check(ex?.image_key == null, "image_key is null (no bundled asset)", ex?.image_key);
    check(ex?.sort_order > 5, "sort_order after the seeded five", ex?.sort_order);
    console.log(`  created: ${JSON.stringify({ id: ex?.id, name: ex?.name })}`);

    const ov1 = await api("/api/strength/overview", diogo.token);
    const cat1 = ov1.body?.exercises ?? [];
    check(cat1.length === 6, `overview now shows 6 exercises`, cat1.length);
    const state = (ov1.body?.states ?? []).find((s) => s.exercise_id === createdId);
    check(
      state && state.prefill.never_done && state.prefill.series.length === 2 && state.prefill.series[0].reps === 10,
      "new exercise flows through buildOverview with never_done prefill (2 series, reps 10)",
      state?.prefill
    );

    // ---- 4. dedupe (case-insensitive) ----
    console.log("\n[4] dedupe");
    const dup = await api("/api/strength/exercises", diogo.token, {
      method: "POST",
      body: JSON.stringify({
        name: SYNTHETIC_NAME.toUpperCase(),
        measurement_type: "weight_reps",
      }),
    });
    check(dup.status === 409, `case-insensitive duplicate → ${dup.status}`, dup.body?.error);
    check(dup.body?.exercise?.id === createdId, "409 echoes the existing exercise to reuse", dup.body?.exercise?.id);

    // ---- 5. validation ----
    console.log("\n[5] validation");
    const bad = await api("/api/strength/exercises", diogo.token, {
      method: "POST",
      body: JSON.stringify({ name: "Bad", measurement_type: "cardio" }),
    });
    check(bad.status === 400, `unknown measurement_type → ${bad.status}`, bad.body?.error);

    // ---- 6. alternatives (LIVE Sonnet call) ----
    console.log("\n[6] alternatives (live model call on seated-row)");
    const alt = await api("/api/strength/alternatives", diogo.token, {
      method: "POST",
      body: JSON.stringify({ exercise_id: "seated-row" }),
    });
    check(alt.status === 200, `POST alternatives → ${alt.status}`, alt.body?.error);
    const alts = alt.body?.alternatives ?? [];
    const sugg = alt.body?.suggestions ?? [];
    const catIds = new Set(cat1.map((e) => e.id));
    // The catalog now holds a genuine chest-supported row (the synthetic
    // exercise) — a strong same-pattern sub for the blocked seated row, so
    // the model SHOULD rank it. (Without it, the tiny seeded catalog has no
    // true row sub and the honest response is empty alternatives + new
    // suggestions; that branch is exercised by the unit tests + prompt.)
    check(alts.length >= 1, `ranked at least one catalog substitute`, alts);
    check(
      alts.some((a) => a.exercise_id === createdId),
      "ranked the chest-supported row (the genuine catalog sub)",
      alts.map((a) => a.exercise_id)
    );
    check(
      alts.every((a) => catIds.has(a.exercise_id) && a.exercise_id !== "seated-row"),
      "every catalog alternative is a real id and not the blocked exercise",
      alts.map((a) => a.exercise_id)
    );
    check(
      alts.every((a) => typeof a.reason === "string" && a.reason.trim().length > 0),
      "every alternative has a non-empty reason"
    );
    check(sugg.length <= 2, "at most 2 new suggestions", sugg.length);
    check(
      sugg.every(
        (s) =>
          typeof s.name === "string" && s.name.trim().length > 0 &&
          ["weight_reps", "bodyweight_reps", "carry"].includes(s.measurement_type) &&
          typeof s.description === "string" && s.description.trim().length > 0 &&
          typeof s.reason === "string" && s.reason.trim().length > 0
      ),
      "every suggestion is well-formed (name, valid type, description, reason)",
      sugg
    );
    console.log(`  alternatives: ${JSON.stringify(alts)}`);
    console.log(`  suggestions:  ${JSON.stringify(sugg.map((s) => ({ name: s.name, type: s.measurement_type })))}`);

    const altUnknown = await api("/api/strength/alternatives", diogo.token, {
      method: "POST",
      body: JSON.stringify({ exercise_id: "no-such-exercise" }),
    });
    check(altUnknown.status === 404, `unknown exercise → ${altUnknown.status}`, altUnknown.body?.error);
  } finally {
    // ---- 7. cleanup: delete the synthetic row via service role ----
    console.log("\n[7] cleanup");
    if (createdId) {
      const { error: dErr } = await admin
        .from("strength_exercises")
        .delete()
        .eq("id", createdId)
        .eq("created_by", DIOGO_USER_ID); // safety: only ever the synthetic row
      if (dErr) {
        failures++;
        console.error(`  FAIL delete ${createdId}: ${dErr.message} — remove manually`);
      } else {
        console.log(`  deleted ${createdId}`);
      }
    }
    // Prove the catalog is back to the 5-row seeded baseline.
    const { data: rows, error: cErr } = await admin
      .from("strength_exercises")
      .select("id, created_by");
    if (cErr) {
      failures++;
      console.error(`  FAIL re-read catalog: ${cErr.message}`);
    } else {
      check(rows.length === 5, "catalog back to 5-row baseline", rows.map((r) => r.id));
      check(
        rows.every((r) => r.created_by == null),
        "no user-created rows remain (all created_by null)"
      );
    }
  }

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
