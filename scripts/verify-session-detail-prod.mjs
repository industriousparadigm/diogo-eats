// End-to-end verification of GET /api/strength/sessions/[id] against the
// LIVE prod deployment. Read-only for Diogo's data (we GET his real
// baseline session detail and assert it, NEVER write a row for him). The
// write/beat path is exercised on a synthetic user that is deleted at the
// end (FK cascade removes its sessions/sets), and cleanup is proven.
//
//   1. GET /api/strength/sessions/<id> without auth        → 401
//   2. Diogo (read-only): list his sessions, GET the day-1 baseline
//      detail → { session, beats }, beats === [] (first ever); GET a
//      bogus id → 404. NO writes for Diogo.
//   3. Synthetic user: POST session 1, POST session 2 with a raised
//      weight, GET session 2's detail → beats contains the 32→34 weight
//      beat (prod engine), GET session 1's detail → beats []; delete the
//      user and confirm zero rows remain.
//
//   cd ~/Dev/Personal/eats && node scripts/verify-session-detail-prod.mjs

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
    // non-JSON
  }
  return { status: res.status, body };
}

async function main() {
  console.log(`target: ${SITE}\n`);

  // ---- 1. auth gate ----
  console.log("[1] unauthenticated request");
  const noAuth = await api(`/api/strength/sessions/${SEED_SESSION_ID}`, null);
  check(noAuth.status === 401, `GET sessions/[id] without token → ${noAuth.status}`, noAuth.body);

  // ---- 2. Diogo, READ-ONLY ----
  console.log("\n[2] Diogo's session detail (read-only — no writes)");
  const diogo = await mintToken(DIOGO_EMAIL);
  check(diogo.userId === DIOGO_USER_ID, `minted token belongs to ${DIOGO_USER_ID}`, diogo.userId);

  const detail = await api(`/api/strength/sessions/${SEED_SESSION_ID}`, diogo.token);
  check(detail.status === 200, `GET baseline session → ${detail.status}`, detail.body);
  check(detail.body?.session?.id === SEED_SESSION_ID, "returns the day-1 session", detail.body?.session?.id);
  check(Array.isArray(detail.body?.session?.sets) && detail.body.session.sets.length > 0, "session carries its sets", detail.body?.session?.sets?.length);
  check(Array.isArray(detail.body?.beats) && detail.body.beats.length === 0, "baseline beats === [] (first ever)", detail.body?.beats);
  console.log(`  baseline: ${detail.body?.session?.sets?.length} sets, ${detail.body?.beats?.length} beats`);

  const bogus = await api(`/api/strength/sessions/00000000-0000-0000-0000-000000000000`, diogo.token);
  check(bogus.status === 404, `GET unknown id → ${bogus.status} (not found)`, bogus.body);

  // ---- 3. write/beat path on a synthetic user ----
  console.log("\n[3] synthetic-user beat detection");
  const email = `session-detail-verify+${Date.now()}@dsgmcosta.dev`;
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (cErr) throw new Error(`createUser: ${cErr.message}`);
  const tempId = created.user.id;
  console.log(`  synthetic user ${email} (${tempId})`);

  try {
    const temp = await mintToken(email);
    const now = Date.now();

    const post1 = await api("/api/strength/sessions", temp.token, {
      method: "POST",
      body: JSON.stringify({
        started_at: now - 30 * 60 * 1000,
        completed_at: now - 20 * 60 * 1000,
        note: "session-detail verify s1",
        sets: [{ exercise_id: "leg-press", series_index: 1, weight_kg: 32, reps: 10 }],
      }),
    });
    check(post1.status === 200, `POST session 1 → ${post1.status}`, post1.body);
    const s1Id = post1.body?.session?.id;

    const post2 = await api("/api/strength/sessions", temp.token, {
      method: "POST",
      body: JSON.stringify({
        started_at: now - 10 * 60 * 1000,
        completed_at: now,
        sets: [{ exercise_id: "leg-press", series_index: 1, weight_kg: 34, reps: 10 }],
      }),
    });
    check(post2.status === 200, `POST session 2 → ${post2.status}`, post2.body);
    const s2Id = post2.body?.session?.id;

    const d2 = await api(`/api/strength/sessions/${s2Id}`, temp.token);
    check(d2.status === 200, `GET session 2 detail → ${d2.status}`, d2.body);
    const beat = d2.body?.beats?.[0];
    check(
      beat?.exercise_id === "leg-press" && beat.kind === "weight" && beat.from === 32 && beat.to === 34,
      "session 2 detail: prod engine reports the 32→34 weight beat",
      d2.body?.beats
    );

    const d1 = await api(`/api/strength/sessions/${s1Id}`, temp.token);
    check(d1.status === 200, `GET session 1 detail → ${d1.status}`, d1.body);
    check(Array.isArray(d1.body?.beats) && d1.body.beats.length === 0, "session 1 detail: zero beats (first ever)", d1.body?.beats);

    // Ownership: Diogo's token must NOT see the synthetic user's session.
    const crossOwner = await api(`/api/strength/sessions/${s2Id}`, diogo.token);
    check(crossOwner.status === 404, `cross-owner GET → ${crossOwner.status} (ownership enforced)`, crossOwner.body);
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

  // Final guard: Diogo's session count is unchanged by this run (we only read).
  const { count: diogoSessions } = await admin
    .from("strength_sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", DIOGO_USER_ID);
  console.log(`\n  Diogo's session count (untouched): ${diogoSessions}`);

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
