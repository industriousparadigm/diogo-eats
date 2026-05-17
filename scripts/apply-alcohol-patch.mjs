// One-shot historical alcohol backfill. Reasoning behind every patch
// entry — taken from a manual sweep of meals-backup-2026-05-17:
//
// 1. f2dcb7ba7561f3e0 — 110g white Alvarinho ~11.7% ABV → 9.2g/100g × 110g = 10.1g alcohol
// 2. a722644f7d0ff196 — 160g homemade limoncello ~32% ABV → 25.2g/100g × 160g = 40.3g alcohol (the "too much" tier)
// 3. 1193e289c526a852 — 330g Super Bock Black ~6% ABV → 4.7g/100g × 330g = 15.5g
// 4. f839bfad816de408 — 800g (80cl) Super Bock lager ~5% ABV → 3.9g/100g × 800g = 31.6g
// 5. 750988b346a3af79 — 400g (40cl) Super Bock lager ~5% ABV → 3.9g/100g × 400g = 15.8g
// 6. 1b2b149ea5855210 — 120g daiquiri ~25% ABV in glass → 19.7g/100g × 120g = 23.6g
// 7. 6028d966387ad100 — 100g Manhattan ~35% ABV → 27.6g/100g × 100g = 27.6g
// 8. 91585372e6aae560 — 120g white Alvarinho ~12% ABV → 9.5g/100g × 120g = 11.4g
// 9. 3d6760e1845917af — 80g limoncello ~32% ABV → 25.2g/100g × 80g = 20.2g
//
// Density of ethanol: 0.789 g/mL. Alcohol % ABV is volume; multiplying by
// density gives mass per 100g of drink (drinks are ~99% water density).
// Numbers conservative-leaning where ABV uncertain.

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

const supa = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Per-item alcohol attributions. `item_idx_or_name` identifies which item
// in the meal's items_json to update; `alcohol_per_100g` is set on that
// item's per_100g; `meal_alcohol_g` overrides meals.alcohol_g.
const PATCHES = [
  { id: "f2dcb7ba7561f3e0", match: /wine/i, alcohol_per_100g: 9.2, meal_alcohol_g: 10.1 },
  { id: "a722644f7d0ff196", match: /limoncello/i, alcohol_per_100g: 25.2, meal_alcohol_g: 40.3 },
  { id: "1193e289c526a852", match: /beer|bock/i, alcohol_per_100g: 4.7, meal_alcohol_g: 15.5 },
  { id: "f839bfad816de408", match: /beer|bock/i, alcohol_per_100g: 3.9, meal_alcohol_g: 31.6 },
  { id: "750988b346a3af79", match: /beer|bock/i, alcohol_per_100g: 3.9, meal_alcohol_g: 15.8 },
  { id: "1b2b149ea5855210", match: /daiquiri|cocktail/i, alcohol_per_100g: 19.7, meal_alcohol_g: 23.6 },
  { id: "6028d966387ad100", match: /manhattan|cocktail/i, alcohol_per_100g: 27.6, meal_alcohol_g: 27.6 },
  { id: "91585372e6aae560", match: /wine|alvarinho/i, alcohol_per_100g: 9.5, meal_alcohol_g: 11.4 },
  { id: "3d6760e1845917af", match: /limoncello/i, alcohol_per_100g: 25.2, meal_alcohol_g: 20.2 },
];

const DRY_RUN = process.argv.includes("--apply") ? false : true;

async function main() {
  if (DRY_RUN) {
    console.log("DRY RUN — re-run with --apply to commit changes.\n");
  }
  let updated = 0;
  let unchanged = 0;
  let failed = 0;
  for (const p of PATCHES) {
    const { data: meal, error } = await supa
      .from("meals")
      .select("id, items_json, alcohol_g, caption")
      .eq("id", p.id)
      .maybeSingle();
    if (error || !meal) {
      console.error(`✗ ${p.id} — fetch failed: ${error?.message ?? "not found"}`);
      failed += 1;
      continue;
    }
    let items;
    try {
      items = JSON.parse(meal.items_json);
    } catch {
      console.error(`✗ ${p.id} — items_json parse failed`);
      failed += 1;
      continue;
    }
    if (!Array.isArray(items)) {
      console.error(`✗ ${p.id} — items not an array`);
      failed += 1;
      continue;
    }
    let touched = false;
    for (const it of items) {
      if (it && typeof it.name === "string" && p.match.test(it.name)) {
        it.per_100g = { ...(it.per_100g ?? {}), alcohol_g: p.alcohol_per_100g };
        touched = true;
      }
    }
    if (!touched) {
      console.warn(`⚠ ${p.id} — no item matched ${p.match}; skipping`);
      unchanged += 1;
      continue;
    }
    const caption = meal.caption ? ` "${meal.caption.slice(0, 60)}…"` : "";
    console.log(
      `  ${p.id} → ${p.meal_alcohol_g}g alcohol${caption}`
    );
    if (!DRY_RUN) {
      const { error: uerr } = await supa
        .from("meals")
        .update({
          items_json: JSON.stringify(items),
          alcohol_g: p.meal_alcohol_g,
        })
        .eq("id", p.id);
      if (uerr) {
        console.error(`  ✗ update failed: ${uerr.message}`);
        failed += 1;
      } else {
        updated += 1;
      }
    }
  }
  console.log(
    `\n${DRY_RUN ? "dry-run" : "applied"}: ${PATCHES.length - failed - unchanged} ok, ${unchanged} skipped, ${failed} failed.`
  );
  if (DRY_RUN) console.log("re-run with --apply to commit.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
