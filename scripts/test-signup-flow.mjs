// End-to-end signup flow rehearsal against the LIVE prod deployment.
//
// Now that magic links use the token_hash flow, the test path is
// straightforward — no PKCE state to fake:
//
//   1. Create a synthetic auth user via admin
//   2. Get a fresh token_hash via admin.generateLink
//   3. Hit /auth/callback?token_hash=...&type=email — captures session
//      cookies set by the server-side verifyOtp
//   4. Exercise /api/profile + /api/onboarding + /api/parse-text +
//      /api/stats with those cookies to confirm Claude-Haiku target
//      derivation works AND data is isolated to the new user
//   5. Delete the test user
//
//   cd ~/Dev/Personal/eats && node scripts/test-signup-flow.mjs

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
const TEST_EMAIL = `test+${Date.now()}@dsgmcosta.dev`;

const supaAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function logStep(n, msg) {
  console.log(`\n[${n}] ${msg}`);
}
function ok(msg) {
  console.log(`  ✓ ${msg}`);
}
function fail(msg) {
  console.error(`  ✗ ${msg}`);
  process.exitCode = 1;
}

function makeJar() {
  const cookies = new Map();
  return {
    addFromHeaders(headers) {
      const setCookies = headers.getSetCookie?.() ?? [];
      for (const sc of setCookies) {
        const pair = sc.split(";")[0];
        const eq = pair.indexOf("=");
        if (eq <= 0) continue;
        const name = pair.slice(0, eq).trim();
        const value = pair.slice(eq + 1).trim();
        if (value === "" || value === "deleted") cookies.delete(name);
        else cookies.set(name, value);
      }
    },
    header() {
      return Array.from(cookies.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");
    },
    size() {
      return cookies.size;
    },
    names() {
      return [...cookies.keys()];
    },
  };
}

async function fetchFollow(url, opts = {}, jar) {
  let current = url;
  let resp;
  for (let i = 0; i < 6; i++) {
    resp = await fetch(current, {
      ...opts,
      headers: {
        ...(opts.headers ?? {}),
        ...(jar.size() ? { cookie: jar.header() } : {}),
      },
      redirect: "manual",
    });
    jar.addFromHeaders(resp.headers);
    const loc = resp.headers.get("location");
    if (resp.status >= 300 && resp.status < 400 && loc) {
      current = new URL(loc, current).toString();
      continue;
    }
    break;
  }
  return { resp, finalUrl: current };
}

async function main() {
  const jar = makeJar();
  let userId = null;

  try {
    logStep(1, `Create synthetic auth user for ${TEST_EMAIL}`);
    const { data: created, error: cErr } = await supaAdmin.auth.admin.createUser({
      email: TEST_EMAIL,
      email_confirm: true,
    });
    if (cErr) throw new Error(`createUser failed: ${cErr.message}`);
    userId = created.user.id;
    ok(`auth.users id ${userId}`);

    logStep(2, "Generate a magic-link token_hash (admin)");
    const { data: link, error: lErr } = await supaAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: TEST_EMAIL,
    });
    if (lErr) throw new Error(`generateLink failed: ${lErr.message}`);
    const tokenHash = link.properties.hashed_token;
    if (!tokenHash) throw new Error("no token_hash returned");
    ok(`token_hash obtained (${tokenHash.slice(0, 12)}…)`);

    logStep(3, "Hit /auth/callback?token_hash=…&type=email — server verifies");
    const callbackUrl = `${SITE}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=email`;
    const { resp: cbResp, finalUrl } = await fetchFollow(callbackUrl, {}, jar);
    if (cbResp.status >= 400) {
      const body = await cbResp.text();
      throw new Error(`callback hop failed: HTTP ${cbResp.status} ${body.slice(0, 200)}`);
    }
    ok(`landed on ${finalUrl} (status ${cbResp.status}, ${jar.size()} cookies: ${jar.names().join(", ")})`);
    if (finalUrl.includes("/login")) throw new Error("ended on /login — session not set");

    logStep(4, "GET /api/profile — should auto-create stub row for new user");
    const profResp = await fetch(`${SITE}/api/profile`, {
      headers: { cookie: jar.header() },
    });
    const profJson = await profResp.json();
    if (profResp.status !== 200)
      throw new Error(`profile GET: ${profResp.status} ${JSON.stringify(profJson)}`);
    ok(
      `stub created (sat_fat=${profJson.profile.sat_fat_g}, fiber=${profJson.profile.soluble_fiber_g}, cal=${profJson.profile.calories}, pro=${profJson.profile.protein_g})`
    );
    if (profJson.profile.onboarded_at != null) fail("onboarded_at should still be null at stub");

    logStep(5, "POST /api/onboarding — Claude-Haiku derives starter targets");
    const onbResp = await fetch(`${SITE}/api/onboarding`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: jar.header() },
      body: JSON.stringify({
        sex: "F",
        age: 32,
        weight_kg: 60,
        notes: "vegetarian; trying to keep LDL low; no strength training yet",
      }),
    });
    const onbJson = await onbResp.json();
    if (onbResp.status !== 200)
      throw new Error(`onboarding: ${onbResp.status} ${JSON.stringify(onbJson)}`);
    ok(
      `derived: cal=${onbJson.profile.calories}, pro=${onbJson.profile.protein_g}, sat=${onbJson.profile.sat_fat_g}, fib=${onbJson.profile.soluble_fiber_g}`
    );
    ok(`rationale: "${onbJson.rationale}"`);
    if (onbJson.profile.onboarded_at == null) fail("onboarded_at should be set now");

    logStep(6, "POST /api/parse-text — log a sanity meal as test user");
    const parseResp = await fetch(`${SITE}/api/parse-text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: jar.header() },
      body: JSON.stringify({ text: "a small bowl of oats with banana and chia" }),
    });
    const parseJson = await parseResp.json();
    if (parseResp.status !== 200)
      throw new Error(`parse-text: ${parseResp.status} ${JSON.stringify(parseJson)}`);
    ok(`meal logged, ${parseJson.meal.calories} kcal, ${parseJson.meal.plant_pct}% plant`);

    logStep(7, "GET /api/stats?days=7 — verify the meal appears under THIS user");
    const statsResp = await fetch(`${SITE}/api/stats?days=7`, {
      headers: { cookie: jar.header() },
    });
    const statsJson = await statsResp.json();
    const today = statsJson.aggregates[statsJson.aggregates.length - 1];
    if (today.meal_count !== 1)
      fail(`expected meal_count=1 today, got ${today.meal_count}`);
    else ok(`today: ${today.meal_count} meal, ${today.calories} kcal — isolated from Diogo's data`);

    logStep(8, "Cross-user isolation: /api/meals as test user shouldn't see Diogo's 115 meals");
    const mealsResp = await fetch(
      `${SITE}/api/meals?day=${new Date().toISOString().slice(0, 10)}`,
      { headers: { cookie: jar.header() } }
    );
    const mealsJson = await mealsResp.json();
    const mealCount = mealsJson.meals.length;
    if (mealCount === 1) ok("only the one test meal visible — isolation working");
    else fail(`expected 1 meal today, saw ${mealCount}`);

    console.log(
      process.exitCode === 0
        ? "\n=== SIGNUP FLOW GREEN — Mariana's onboarding will work ==="
        : "\n=== SOME STEPS FAILED — see above ==="
    );
  } catch (err) {
    console.error(`\nFATAL: ${err.message}`);
    process.exit(1);
  } finally {
    if (userId) {
      console.log("\nCleanup: delete test user + cascade rows");
      const { error } = await supaAdmin.auth.admin.deleteUser(userId);
      if (error) console.error(`  ✗ deleteUser failed: ${error.message}`);
      else console.log("  ✓ done");
    }
  }
}

main();
