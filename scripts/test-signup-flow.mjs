// End-to-end signup flow rehearsal. Creates a synthetic auth user,
// generates their magic link, walks through /auth/callback to get a
// session cookie, then exercises every signup-adjacent endpoint:
//   - /api/profile (auto-create stub)
//   - /api/onboarding (Claude-Haiku target derivation)
//   - /api/parse-text (sanity meal log under the new user)
//   - /api/stats (verify the meal aggregates only for them)
// Finally deletes the test user + their data so prod stays pristine.
//
// Runs against the LIVE prod deployment so it exercises Vercel
// middleware + the actual deployed routes. ~30 seconds total.
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

// CookieJar: keep all Set-Cookie name=value pairs across redirects.
function makeJar() {
  const cookies = new Map();
  return {
    addFromHeaders(headers) {
      // node-fetch's Headers has getSetCookie() in recent versions
      const setCookies = headers.getSetCookie?.() ?? [];
      for (const sc of setCookies) {
        const pair = sc.split(";")[0];
        const eq = pair.indexOf("=");
        if (eq <= 0) continue;
        const name = pair.slice(0, eq).trim();
        const value = pair.slice(eq + 1).trim();
        if (value === "" || value === "deleted") {
          cookies.delete(name);
        } else {
          cookies.set(name, value);
        }
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

    logStep(2, "Generate a magic link (admin) — no email sent");
    const { data: link, error: lErr } = await supaAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: TEST_EMAIL,
      options: { redirectTo: `${SITE}/auth/callback` },
    });
    if (lErr) throw new Error(`generateLink failed: ${lErr.message}`);
    const actionLink = link.properties.action_link;
    if (!actionLink) throw new Error("no action_link returned");
    ok("magic-link URL obtained");

    logStep(3, "Walk the magic link through /auth/callback to acquire session cookie");
    const { resp: cbResp, finalUrl } = await fetchFollow(actionLink, {}, jar);
    if (cbResp.status >= 400) {
      const body = await cbResp.text();
      throw new Error(`callback hop failed: HTTP ${cbResp.status} ${body.slice(0, 200)}`);
    }
    ok(`landed on ${finalUrl} (status ${cbResp.status}, ${jar.size()} cookies)`);

    logStep(4, "GET /api/profile — should auto-create stub row for new user");
    const profResp = await fetch(`${SITE}/api/profile`, {
      headers: { cookie: jar.header() },
    });
    const profJson = await profResp.json();
    if (profResp.status !== 200) throw new Error(`profile GET: ${profResp.status} ${JSON.stringify(profJson)}`);
    ok(`stub created (sat_fat=${profJson.profile.sat_fat_g}, fiber=${profJson.profile.soluble_fiber_g}, cal=${profJson.profile.calories}, pro=${profJson.profile.protein_g})`);
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
      `derived targets: cal=${onbJson.profile.calories}, pro=${onbJson.profile.protein_g}, sat=${onbJson.profile.sat_fat_g}, fib=${onbJson.profile.soluble_fiber_g}`
    );
    ok(`rationale: "${onbJson.rationale}"`);
    if (onbJson.profile.onboarded_at == null) fail("onboarded_at should be set now");
    if (onbJson.profile.notes?.toLowerCase().includes("vegetarian")) ok("notes round-tripped");

    logStep(6, "POST /api/parse-text — log a sanity meal as test user");
    const parseResp = await fetch(`${SITE}/api/parse-text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: jar.header() },
      body: JSON.stringify({ text: "a small bowl of oats with banana and chia" }),
    });
    const parseJson = await parseResp.json();
    if (parseResp.status !== 200)
      throw new Error(`parse-text: ${parseResp.status} ${JSON.stringify(parseJson)}`);
    ok(`meal logged, id ${parseJson.meal.id}, ${parseJson.meal.calories} kcal`);

    logStep(7, "GET /api/stats?days=7 — verify the meal appears under THIS user");
    const statsResp = await fetch(`${SITE}/api/stats?days=7`, {
      headers: { cookie: jar.header() },
    });
    const statsJson = await statsResp.json();
    if (statsResp.status !== 200)
      throw new Error(`stats: ${statsResp.status} ${JSON.stringify(statsJson)}`);
    const today = statsJson.aggregates[statsJson.aggregates.length - 1];
    if (today.meal_count !== 1)
      fail(`expected meal_count=1 today, got ${today.meal_count}`);
    else ok(`today: ${today.meal_count} meal, ${today.calories} kcal — isolated from Diogo's data`);

    logStep(8, "Cross-user isolation check: /api/meals as test user shouldn't see Diogo's 115 meals");
    const mealsResp = await fetch(
      `${SITE}/api/meals?day=${new Date().toISOString().slice(0, 10)}`,
      { headers: { cookie: jar.header() } }
    );
    const mealsJson = await mealsResp.json();
    if (mealsResp.status !== 200) throw new Error(`meals: ${mealsResp.status}`);
    const mealCount = mealsJson.meals.length;
    if (mealCount === 1) ok("only the one test meal visible — RLS / user_id filter working");
    else fail(`expected 1 meal today, saw ${mealCount}`);

    logStep(9, "Cleanup: delete test user + cascade their meals/profile");
    if (userId) {
      const { error: dErr } = await supaAdmin.auth.admin.deleteUser(userId);
      if (dErr) fail(`deleteUser failed: ${dErr.message}`);
      else ok("test user + cascade rows deleted");
    }

    console.log(
      process.exitCode === 0
        ? "\n=== SIGNUP FLOW GREEN — Mariana's onboarding will work ==="
        : "\n=== SOME STEPS FAILED — see above ==="
    );
  } catch (err) {
    console.error(`\nFATAL: ${err.message}`);
    if (userId) {
      console.error("Attempting cleanup…");
      await supaAdmin.auth.admin.deleteUser(userId).catch(() => {});
    }
    process.exit(1);
  }
}

main();
