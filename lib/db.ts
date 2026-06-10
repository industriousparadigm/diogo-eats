import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { addDaysYmd, todayYmd, tzDayStart, tzYmd } from "./tz";

// Server-side admin client. Service role key bypasses RLS, which is what
// we want — all reads/writes go through Next.js API routes that already
// gate access. The anon key never touches data tables.
//
// Lazy singleton: env vars are read on first call, NOT at module-import
// time. Lets tests + tools import this file (for types, helpers) without
// having to set env vars or stub them out.
let _client: SupabaseClient | null = null;
export function getSupabase(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

// Test-only: drop the cached client so a re-import-style test can re-init
// with different env vars. No production caller should use this.
export function _resetSupabaseForTests() {
  _client = null;
}

export type Meal = {
  id: string;
  created_at: number;
  photo_filename: string | null;
  items_json: string;
  sat_fat_g: number;
  soluble_fiber_g: number;
  calories: number;
  protein_g: number;
  plant_pct: number;
  // Silent-capture nutrients (added 2026-05-08). Stored, not yet surfaced.
  fat_g: number;
  carbs_g: number;
  sugar_g: number;
  salt_g: number;
  // Pure ethanol grams (added 2026-05-17). Default 0 in the DB for
  // pre-existing rows; backfill script populates from items where
  // applicable.
  alcohol_g: number;
  notes: string | null;
  caption: string | null;
  meal_vibe: string | null;
};

export async function insertMeal(m: Meal) {
  const { error } = await getSupabase().from("meals").insert(m);
  if (error) throw new Error(`insertMeal: ${error.message}`);
}

export async function deleteMeal(id: string) {
  // Best-effort photo cleanup. Fetch the row first to know the filename,
  // then drop the storage object alongside the DB row. Failures on the
  // storage side don't block the DB delete — orphan files are easy to
  // garbage-collect later.
  const { data: row } = await getSupabase()
    .from("meals")
    .select("photo_filename")
    .eq("id", id)
    .maybeSingle();
  if (row?.photo_filename) {
    await getSupabase().storage.from("photos").remove([row.photo_filename]).catch(() => {});
  }
  const { error } = await getSupabase().from("meals").delete().eq("id", id);
  if (error) throw new Error(`deleteMeal: ${error.message}`);
}

export async function getMeal(id: string): Promise<Meal | null> {
  const { data, error } = await getSupabase()
    .from("meals")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getMeal: ${error.message}`);
  return (data as Meal) ?? null;
}

export async function getMealsBetween(
  userId: string,
  startMs: number,
  endMs: number
): Promise<Meal[]> {
  const { data, error } = await getSupabase()
    .from("meals")
    .select("*")
    .eq("user_id", userId)
    .gte("created_at", startMs)
    .lt("created_at", endMs)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`getMealsBetween: ${error.message}`);
  return (data as Meal[]) ?? [];
}

export type MealTotals = {
  sat_fat_g: number;
  soluble_fiber_g: number;
  calories: number;
  protein_g: number;
  plant_pct: number;
  fat_g: number;
  carbs_g: number;
  sugar_g: number;
  salt_g: number;
  alcohol_g: number;
};

export async function updateMealItems(
  id: string,
  itemsJson: string,
  totals: MealTotals
) {
  const { error } = await getSupabase()
    .from("meals")
    .update({ items_json: itemsJson, ...totals })
    .eq("id", id);
  if (error) throw new Error(`updateMealItems: ${error.message}`);
}

export async function updateMealCreatedAt(id: string, createdAt: number) {
  const { error } = await getSupabase()
    .from("meals")
    .update({ created_at: createdAt })
    .eq("id", id);
  if (error) throw new Error(`updateMealCreatedAt: ${error.message}`);
}

// ---- food memory ----

export type Provenance = "label_verified" | "user_corrected" | "ai_inferred";

export type PortionPreset = { label: string; grams: number };

export type FoodMemory = {
  name_key: string;
  display_name: string;
  is_plant: number;
  per_100g_json: string;
  times_seen: number;
  last_seen: number;
  // Added 2026-06-10 (foods library). provenance ranks data authority;
  // portion_presets is reserved for a later quick-portion surface.
  provenance: Provenance;
  portion_presets: PortionPreset[] | null;
};

export function normalizeFoodName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

type UpsertableItem = {
  name: string;
  is_plant: boolean;
  per_100g: { sat_fat_g: number; soluble_fiber_g: number; calories: number; protein_g: number };
};

export async function upsertFoodMemory(userId: string, items: UpsertableItem[]) {
  const now = Date.now();
  // Loop one RPC per item — fine at single-user scale (≤ ~10 items per meal).
  // Errors are swallowed individually so one bad row can't kill a save.
  await Promise.all(
    items
      .filter((i) => i && i.per_100g && i.name?.trim())
      .map((i) =>
        getSupabase()
          .rpc("upsert_food_memory_v2", {
            p_user_id: userId,
            p_name_key: normalizeFoodName(i.name),
            p_display_name: i.name.trim(),
            p_is_plant: i.is_plant ? 1 : 0,
            p_per_100g_json: JSON.stringify(i.per_100g),
            p_last_seen: now,
          })
          .then(({ error }) => {
            if (error) console.error("upsertFoodMemory item failed:", error.message);
          })
      )
  );
}

// Foods injected into parse prompts. Provenance-ranked: label_verified
// and user_corrected entries (authoritative — the user vouched for them)
// come before ai_inferred, then by times_seen so the user's staples lead.
// Bounded by `limit` to keep the prompt block size in check.
//
// PostgREST can't order by a CASE expression, so we rank in JS after
// pulling a generous candidate set (user-scale food_memory is small —
// hundreds of rows, not millions).
export async function topFoodMemory(
  userId: string,
  limit: number = 30
): Promise<FoodMemory[]> {
  const { data, error } = await getSupabase()
    .from("food_memory")
    .select("*")
    .eq("user_id", userId)
    .order("times_seen", { ascending: false })
    .order("last_seen", { ascending: false })
    .limit(500);
  if (error) throw new Error(`topFoodMemory: ${error.message}`);
  const rows = (data as FoodMemory[]) ?? [];
  return rankFoodsForPrompt(rows).slice(0, limit);
}

// Pure ranker (exported for tests): authority tier first, then times_seen
// desc, then last_seen desc as the final tiebreak.
const PROVENANCE_RANK: Record<Provenance, number> = {
  label_verified: 0,
  user_corrected: 1,
  ai_inferred: 2,
};
export function rankFoodsForPrompt(rows: FoodMemory[]): FoodMemory[] {
  return [...rows].sort((a, b) => {
    const ra = PROVENANCE_RANK[a.provenance] ?? 2;
    const rb = PROVENANCE_RANK[b.provenance] ?? 2;
    if (ra !== rb) return ra - rb;
    if (b.times_seen !== a.times_seen) return b.times_seen - a.times_seen;
    return b.last_seen - a.last_seen;
  });
}

// ---- foods library CRUD (the /api/foods surface) ----

export type FoodRow = FoodMemory; // alias: library rows are food_memory rows

// Search by display_name (case-insensitive substring), ordered by
// times_seen desc. Empty query returns the most-seen foods. Paged.
export async function searchFoods(
  userId: string,
  query: string,
  limit: number = 50,
  offset: number = 0
): Promise<FoodRow[]> {
  let q = getSupabase()
    .from("food_memory")
    .select("*")
    .eq("user_id", userId)
    .order("times_seen", { ascending: false })
    .order("last_seen", { ascending: false })
    .range(offset, offset + limit - 1);
  const trimmed = query.trim();
  if (trimmed) {
    // Escape PostgREST ilike wildcards in user input.
    const safe = trimmed.replace(/[%_]/g, (m) => `\\${m}`);
    q = q.ilike("display_name", `%${safe}%`);
  }
  const { data, error } = await q;
  if (error) throw new Error(`searchFoods: ${error.message}`);
  return (data as FoodRow[]) ?? [];
}

export async function getFood(
  userId: string,
  nameKey: string
): Promise<FoodRow | null> {
  const { data, error } = await getSupabase()
    .from("food_memory")
    .select("*")
    .eq("user_id", userId)
    .eq("name_key", nameKey)
    .maybeSingle();
  if (error) throw new Error(`getFood: ${error.message}`);
  return (data as FoodRow) ?? null;
}

export type FoodPatch = {
  display_name?: string;
  is_plant?: number;
  per_100g_json?: string;
  provenance?: Provenance;
  portion_presets?: PortionPreset[] | null;
};

export async function updateFood(
  userId: string,
  nameKey: string,
  patch: FoodPatch
): Promise<FoodRow> {
  const { data, error } = await getSupabase()
    .from("food_memory")
    .update(patch)
    .eq("user_id", userId)
    .eq("name_key", nameKey)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`updateFood: ${error.message}`);
  if (!data) throw new Error("food not found");
  return data as FoodRow;
}

export async function deleteFood(userId: string, nameKey: string): Promise<void> {
  const { error } = await getSupabase()
    .from("food_memory")
    .delete()
    .eq("user_id", userId)
    .eq("name_key", nameKey);
  if (error) throw new Error(`deleteFood: ${error.message}`);
}

export type NewFood = {
  display_name: string;
  is_plant: number;
  per_100g_json: string;
  provenance: Provenance;
  portion_presets?: PortionPreset[] | null;
};

// Insert a food directly into the library. Conflicts on (user_id,
// name_key) update in place (a manual add of an existing food just
// refreshes its data). Returns the resulting row.
export async function insertFood(
  userId: string,
  food: NewFood
): Promise<FoodRow> {
  const nameKey = normalizeFoodName(food.display_name);
  const { data, error } = await getSupabase()
    .from("food_memory")
    .upsert(
      {
        user_id: userId,
        name_key: nameKey,
        display_name: food.display_name.trim(),
        is_plant: food.is_plant,
        per_100g_json: food.per_100g_json,
        times_seen: 1,
        last_seen: Date.now(),
        provenance: food.provenance,
        portion_presets: food.portion_presets ?? null,
      },
      { onConflict: "user_id,name_key" }
    )
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`insertFood: ${error.message}`);
  return data as FoodRow;
}

// Merge duplicate library entries (Vision's messy naming produces these).
// Sums times_seen onto keep_id, keeps keep_id's nutrition/name/provenance,
// then deletes the merged rows. All scoped to one user. Returns the
// surviving row with its bumped times_seen.
export async function mergeFoods(
  userId: string,
  keepKey: string,
  mergeKeys: string[]
): Promise<FoodRow> {
  const toMerge = mergeKeys.filter((k) => k && k !== keepKey);
  const keep = await getFood(userId, keepKey);
  if (!keep) throw new Error("keep food not found");
  if (toMerge.length === 0) return keep;

  const { data: mergeRows, error: selErr } = await getSupabase()
    .from("food_memory")
    .select("name_key, times_seen")
    .eq("user_id", userId)
    .in("name_key", toMerge);
  if (selErr) throw new Error(`mergeFoods select: ${selErr.message}`);
  const summed = (mergeRows ?? []).reduce(
    (acc, r) => acc + ((r as { times_seen: number }).times_seen || 0),
    0
  );

  const newTimesSeen = keep.times_seen + summed;
  const { data: updated, error: upErr } = await getSupabase()
    .from("food_memory")
    .update({ times_seen: newTimesSeen, last_seen: Date.now() })
    .eq("user_id", userId)
    .eq("name_key", keepKey)
    .select("*")
    .maybeSingle();
  if (upErr) throw new Error(`mergeFoods update: ${upErr.message}`);

  const presentKeys = (mergeRows ?? []).map((r) => (r as { name_key: string }).name_key);
  if (presentKeys.length > 0) {
    const { error: delErr } = await getSupabase()
      .from("food_memory")
      .delete()
      .eq("user_id", userId)
      .in("name_key", presentKeys);
    if (delErr) throw new Error(`mergeFoods delete: ${delErr.message}`);
  }
  return updated as FoodRow;
}

// Fetch several library foods by their name_keys in one round trip
// (composer needs to resolve every line at once). Returns a map keyed by
// name_key for O(1) lookup. Missing keys simply don't appear in the map.
export async function getFoodsByKeys(
  userId: string,
  nameKeys: string[]
): Promise<Map<string, FoodRow>> {
  const map = new Map<string, FoodRow>();
  const unique = Array.from(new Set(nameKeys.filter(Boolean)));
  if (unique.length === 0) return map;
  const { data, error } = await getSupabase()
    .from("food_memory")
    .select("*")
    .eq("user_id", userId)
    .in("name_key", unique);
  if (error) throw new Error(`getFoodsByKeys: ${error.message}`);
  for (const row of (data as FoodRow[]) ?? []) map.set(row.name_key, row);
  return map;
}

// Increment times_seen + refresh last_seen on the foods a composed meal
// actually used (real usage signal). One RPC-less update per food via the
// existing per-user upsert path would re-write nutrition; instead we bump
// the counters directly. Errors are swallowed per-key so one bad row
// can't fail a save (the meal is already inserted).
export async function bumpFoodsSeen(userId: string, nameKeys: string[]) {
  const now = Date.now();
  const unique = Array.from(new Set(nameKeys.filter(Boolean)));
  await Promise.all(
    unique.map(async (key) => {
      // Read-modify-write: small per-user scale, no concurrent composer
      // for the same user, so a non-atomic bump is fine here.
      const { data } = await getSupabase()
        .from("food_memory")
        .select("times_seen")
        .eq("user_id", userId)
        .eq("name_key", key)
        .maybeSingle();
      const seen = (data as { times_seen?: number } | null)?.times_seen;
      if (typeof seen !== "number") return;
      await getSupabase()
        .from("food_memory")
        .update({ times_seen: seen + 1, last_seen: now })
        .eq("user_id", userId)
        .eq("name_key", key)
        .then(({ error }) => {
          if (error) console.error("bumpFoodsSeen failed:", key, error.message);
        });
    })
  );
}

// ---- recent meals as parse context ----

export type MealSummary = {
  created_at: number;
  caption: string | null;
  meal_vibe: string | null;
  items: { name: string; grams: number }[];
};

// ---- daily aggregates for the looking-back surface ----

export type DayAggregate = {
  date: string; // YYYY-MM-DD in user's local time (Europe/Lisbon)
  meal_count: number;
  plant_pct: number; // 0-100, mass-weighted across the day
  sat_fat_g: number;
  soluble_fiber_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  alcohol_g: number;
  // Whoop-estimated total daily energy expenditure (kcal). null when
  // the user has no Whoop connection or no data for that day.
  kcal_burn: number | null;
};

// Build local-day buckets for the requested range, then aggregate meals into
// them. Inclusive of today. Days with no meals come back with meal_count=0
// so the UI can render empty cells without holes.
export async function getDailyAggregates(
  userId: string,
  daysBack: number = 84
): Promise<DayAggregate[]> {
  // App-timezone day cells: start at Lisbon-midnight of (daysBack-1)
  // days ago so we get exactly `daysBack` cells including today. The
  // old server-local Date math ran in UTC on Vercel and mis-bucketed
  // late-evening meals.
  const startYmd = addDaysYmd(todayYmd(), -(daysBack - 1));
  const startTs = tzDayStart(startYmd);

  const { data, error } = await getSupabase()
    .from("meals")
    .select(
      "created_at, items_json, plant_pct, sat_fat_g, soluble_fiber_g, calories, protein_g, carbs_g, alcohol_g"
    )
    .eq("user_id", userId)
    .gte("created_at", startTs)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`getDailyAggregates: ${error.message}`);

  // Whoop kcal burn per day (when the user has a connection + a synced
  // cycle for that day). NULL when missing so the chart can render the
  // day's bar without a misleading 0-burn line.
  const { data: whoopRows } = await getSupabase()
    .from("whoop_cycles")
    .select("day, kcal")
    .eq("user_id", userId)
    .gte("day", startYmd);
  const burnByDay = new Map<string, number | null>();
  for (const r of whoopRows ?? []) {
    const row = r as { day: string; kcal: number | null };
    burnByDay.set(row.day, row.kcal);
  }

  // Initialize every day in the range with zeros.
  const days = new Map<
    string,
    {
      meal_count: number;
      // For mass-weighted plant_pct: sum of plant_grams and total_grams.
      plant_grams: number;
      total_grams: number;
      sat_fat_g: number;
      soluble_fiber_g: number;
      calories: number;
      protein_g: number;
      carbs_g: number;
      alcohol_g: number;
    }
  >();
  for (let i = 0; i < daysBack; i++) {
    days.set(addDaysYmd(startYmd, i), {
      meal_count: 0,
      plant_grams: 0,
      total_grams: 0,
      sat_fat_g: 0,
      soluble_fiber_g: 0,
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      alcohol_g: 0,
    });
  }

  for (const m of data ?? []) {
    const key = tzYmd((m as any).created_at);
    const bucket = days.get(key);
    if (!bucket) continue; // shouldn't happen given the gte filter
    bucket.meal_count += 1;
    bucket.sat_fat_g += (m as any).sat_fat_g || 0;
    bucket.soluble_fiber_g += (m as any).soluble_fiber_g || 0;
    bucket.calories += (m as any).calories || 0;
    bucket.protein_g += (m as any).protein_g || 0;
    bucket.carbs_g += (m as any).carbs_g || 0;
    bucket.alcohol_g += (m as any).alcohol_g || 0;

    // Rebuild grams-weighted plant share from items_json — simple sum is wrong
    // for combining meals with different masses.
    try {
      const items = JSON.parse((m as any).items_json);
      if (Array.isArray(items)) {
        for (const i of items) {
          if (typeof i?.grams === "number") {
            bucket.total_grams += i.grams;
            if (i.is_plant) bucket.plant_grams += i.grams;
          }
        }
      }
    } catch {
      // Skip malformed; very-old rows may not parse.
    }
  }

  const out: DayAggregate[] = [];
  for (const [date, b] of days.entries()) {
    const burn = burnByDay.get(date);
    out.push({
      date,
      meal_count: b.meal_count,
      plant_pct:
        b.total_grams > 0 ? Math.round((b.plant_grams / b.total_grams) * 100) : 0,
      sat_fat_g: round1(b.sat_fat_g),
      soluble_fiber_g: round1(b.soluble_fiber_g),
      calories: Math.round(b.calories),
      protein_g: round1(b.protein_g),
      carbs_g: round1(b.carbs_g),
      alcohol_g: round1(b.alcohol_g),
      kcal_burn: burn != null ? Math.round(burn) : null,
    });
  }
  // Map iteration is insertion order, so chronological ascending.
  return out;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

export async function getRecentMealsForContext(
  userId: string,
  daysBack: number = 7,
  limit: number = 30
): Promise<MealSummary[]> {
  const since = Date.now() - daysBack * 24 * 3600 * 1000;
  const { data, error } = await getSupabase()
    .from("meals")
    .select("created_at, caption, meal_vibe, items_json")
    .eq("user_id", userId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`getRecentMealsForContext: ${error.message}`);
  return (data ?? []).map((m: any) => {
    let items: { name: string; grams: number }[] = [];
    try {
      const arr = JSON.parse(m.items_json);
      if (Array.isArray(arr)) {
        items = arr
          .filter((i: any) => i && typeof i.name === "string")
          .map((i: any) => ({ name: i.name, grams: typeof i.grams === "number" ? i.grams : 0 }));
      }
    } catch {
      // ignore — old meals may not have items
    }
    return {
      created_at: m.created_at,
      caption: m.caption,
      meal_vibe: m.meal_vibe,
      items,
    };
  });
}
