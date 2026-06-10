// End-to-end verification of the strength backend against the LIVE
// prod deployment. Read-only for Diogo's data; the write path is
// exercised on a synthetic user that is deleted at the end (FK
// cascade removes its sessions/sets).
//
//   1. GET /api/strength/overview without auth        → 401
//   2. Mint a real access token for Diogo (admin.generateLink
//      magiclink → verifyOtp token_hash, passwordless app) and GET
//      the overview → 5 exercises, day-1 session, baseline prefills,
//      beats_count 0
//   3. POST an invalid payload with a valid token      → 400, no write
//   4. Synthetic user: empty overview (isolation), POST session 1
//      (first-session highlight), POST session 2 with a raised weight
//      (beat detected by prod), GET round-trip, then delete the user
//      and confirm zero rows remain
//
//   cd ~/Dev/Personal/eats && node scripts/verify-strength-prod.mjs

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
const SEED_SESSION_ID = "d1ba5e11-2026-4610-8a30-000000000001";

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
// a magic link server-side and verifying its token_hash directly.
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
  const noAuth = await api("/api/strength/overview", null);
  check(noAuth.status === 401, `GET /api/strength/overview without token → ${noAuth.status}`, noAuth.body);

  // ---- 2. Diogo's overview (read-only) ----
  console.log("\n[2] Diogo's overview");
  const diogo = await mintToken(DIOGO_EMAIL);
  check(diogo.userId === DIOGO_USER_ID, `minted token belongs to ${DIOGO_USER_ID}`, diogo.userId);

  const ov = await api("/api/strength/overview", diogo.token);
  check(ov.status === 200, `GET overview → ${ov.status}`);
  const o = ov.body ?? {};
  check(o.exercises?.length === 5, `5 exercises in catalog`, o.exercises?.map((e) => e.id));
  check(
    JSON.stringify(o.picker_order) ===
      JSON.stringify(["leg-press", "back-extension", "chest-press", "seated-row", "farmers-carry"]),
    "picker order = day-1 logged order",
    o.picker_order
  );

  const baseline = {
    "leg-press": [{ weight_kg: 32, reps: 12 }, { weight_kg: 39, reps: 12 }],
    "back-extension": [{ weight_kg: null, reps: 12 }, { weight_kg: null, reps: 12 }],
    "chest-press": [{ weight_kg: 32, reps: 12 }, { weight_kg: 32, reps: 12 }],
    "seated-row": [{ weight_kg: 25, reps: 12 }, { weight_kg: 32, reps: 12 }],
    "farmers-carry": [{ weight_kg: 16, reps: 60 }, { weight_kg: 16, reps: 60 }],
  };
  for (const [id, series] of Object.entries(baseline)) {
    const st = (o.states ?? []).find((s) => s.exercise_id === id);
    check(
      st && !st.prefill.never_done && JSON.stringify(st.prefill.series) === JSON.stringify(series),
      `prefill[${id}] matches baseline`,
      st?.prefill
    );
  }
  const seed = (o.sessions ?? []).find((s) => s.id === SEED_SESSION_ID);
  check(!!seed, "day-1 seed session in history", o.sessions?.map((s) => s.id));
  check(seed?.beats_count === 0, "day-1 beats_count = 0 (first ever)", seed);
  check(seed?.exercise_ids?.length === 5, "day-1 touched all 5 exercises", seed?.exercise_ids);
  console.log(`  day-1 summary: ${JSON.stringify(seed)}`);

  // ---- 3. validation gate (rejects before any write) ----
  console.log("\n[3] validation rejects");
  const bad = await api("/api/strength/sessions", diogo.token, {
    method: "POST",
    body: JSON.stringify({ started_at: Date.now(), completed_at: Date.now(), sets: [] }),
  });
  check(bad.status === 400, `POST empty sets → ${bad.status}`, bad.body);
  const malformed = await api("/api/strength/sessions", diogo.token, {
    method: "POST",
    body: "not json",
  });
  check(malformed.status === 400, `POST non-JSON body → ${malformed.status}`, malformed.body);

  // ---- 4. write path on a synthetic user ----
  console.log("\n[4] synthetic-user round trip");
  const email = `strength-verify+${Date.now()}@dsgmcosta.dev`;
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (cErr) throw new Error(`createUser: ${cErr.message}`);
  const tempId = created.user.id;
  console.log(`  synthetic user ${email} (${tempId})`);

  try {
    const temp = await mintToken(email);

    const empty = await api("/api/strength/overview", temp.token);
    check(empty.body?.sessions?.length === 0, "fresh user sees 0 sessions (isolation)", empty.body?.sessions);
    check(
      empty.body?.states?.every((s) => s.prefill.never_done && s.prefill.series.length === 2 && s.prefill.series[0].reps === 10),
      "fresh user gets never-done prefills (2 series, reps 10, no weight)"
    );

    const now = Date.now();
    const post1 = await api("/api/strength/sessions", temp.token, {
      method: "POST",
      body: JSON.stringify({
        started_at: now - 30 * 60 * 1000,
        completed_at: now - 20 * 60 * 1000,
        note: "verify run",
        sets: [{ exercise_id: "leg-press", series_index: 1, weight_kg: 32, reps: 10 }],
      }),
    });
    check(post1.status === 200, `POST session 1 → ${post1.status}`, post1.body);
    check(
      post1.body?.highlights?.[0]?.id === "beats" && post1.body.highlights[0].beats.length === 0,
      "session 1: beats line first, zero beats (first ever)",
      post1.body?.highlights?.[0]
    );
    console.log(`  session 1 highlights: ${JSON.stringify(post1.body?.highlights?.map((h) => h.line))}`);

    const post2 = await api("/api/strength/sessions", temp.token, {
      method: "POST",
      body: JSON.stringify({
        started_at: now - 10 * 60 * 1000,
        completed_at: now,
        sets: [{ exercise_id: "leg-press", series_index: 1, weight_kg: 34, reps: 10 }],
      }),
    });
    check(post2.status === 200, `POST session 2 → ${post2.status}`, post2.body);
    const beat = post2.body?.highlights?.[0]?.beats?.[0];
    check(
      beat?.kind === "weight" && beat.from === 32 && beat.to === 34,
      "session 2: prod engine detects the 32→34 weight beat",
      post2.body?.highlights?.[0]
    );
    console.log(`  session 2 highlights: ${JSON.stringify(post2.body?.highlights?.map((h) => h.line))}`);

    const list = await api("/api/strength/sessions", temp.token);
    check(list.body?.sessions?.length === 2, "GET sessions returns both, round-tripped", list.body?.sessions?.length);
    const stored = list.body?.sessions?.find((s) => s.id === post2.body.session.id);
    check(
      JSON.stringify(stored?.sets) ===
        JSON.stringify([{ exercise_id: "leg-press", series_index: 1, weight_kg: 34, reps: 10 }]),
      "set values persisted exactly",
      stored?.sets
    );
  } finally {
    const { error: dErr } = await admin.auth.admin.deleteUser(tempId);
    if (dErr) {
      failures++;
      console.error(`  FAIL deleteUser: ${dErr.message} — clean up ${tempId} manually`);
    } else {
      const { count: sc } = await admin
        .from("strength_sessions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", tempId);
      const { count: xc } = await admin
        .from("strength_sets")
        .select("id", { count: "exact", head: true })
        .eq("user_id", tempId);
      check(sc === 0 && xc === 0, "synthetic user deleted, cascade removed all rows", { sessions: sc, sets: xc });
    }
  }

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
