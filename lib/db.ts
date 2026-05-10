import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

export async function getMealsBetween(startMs: number, endMs: number): Promise<Meal[]> {
  const { data, error } = await getSupabase()
    .from("meals")
    .select("*")
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

// ---- food memory ----

export type FoodMemory = {
  name_key: string;
  display_name: string;
  is_plant: number;
  per_100g_json: string;
  times_seen: number;
  last_seen: number;
};

function normalizeFoodName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

type UpsertableItem = {
  name: string;
  is_plant: boolean;
  per_100g: { sat_fat_g: number; soluble_fiber_g: number; calories: number; protein_g: number };
};

export async function upsertFoodMemory(items: UpsertableItem[]) {
  const now = Date.now();
  // Loop one RPC per item — fine at single-user scale (≤ ~10 items per meal).
  // Errors are swallowed individually so one bad row can't kill a save.
  await Promise.all(
    items
      .filter((i) => i && i.per_100g && i.name?.trim())
      .map((i) =>
        getSupabase()
          .rpc("upsert_food_memory", {
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

export async function topFoodMemory(limit: number = 30): Promise<FoodMemory[]> {
  const { data, error } = await getSupabase()
    .from("food_memory")
    .select("*")
    .order("last_seen", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`topFoodMemory: ${error.message}`);
  return (data as FoodMemory[]) ?? [];
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
};

// Build local-day buckets for the requested range, then aggregate meals into
// them. Inclusive of today. Days with no meals come back with meal_count=0
// so the UI can render empty cells without holes.
export async function getDailyAggregates(daysBack: number = 84): Promise<DayAggregate[]> {
  const now = new Date();
  // Start from local-midnight of (daysBack-1) days ago so we get exactly
  // `daysBack` cells including today.
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (daysBack - 1));

  const { data, error } = await getSupabase()
    .from("meals")
    .select(
      "created_at, items_json, plant_pct, sat_fat_g, soluble_fiber_g, calories, protein_g"
    )
    .gte("created_at", start.getTime())
    .order("created_at", { ascending: true });
  if (error) throw new Error(`getDailyAggregates: ${error.message}`);

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
    }
  >();
  for (let i = 0; i < daysBack; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.set(localYmd(d), {
      meal_count: 0,
      plant_grams: 0,
      total_grams: 0,
      sat_fat_g: 0,
      soluble_fiber_g: 0,
      calories: 0,
      protein_g: 0,
    });
  }

  for (const m of data ?? []) {
    const key = localYmd(new Date((m as any).created_at));
    const bucket = days.get(key);
    if (!bucket) continue; // shouldn't happen given the gte filter
    bucket.meal_count += 1;
    bucket.sat_fat_g += (m as any).sat_fat_g || 0;
    bucket.soluble_fiber_g += (m as any).soluble_fiber_g || 0;
    bucket.calories += (m as any).calories || 0;
    bucket.protein_g += (m as any).protein_g || 0;

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
    out.push({
      date,
      meal_count: b.meal_count,
      plant_pct:
        b.total_grams > 0 ? Math.round((b.plant_grams / b.total_grams) * 100) : 0,
      sat_fat_g: round1(b.sat_fat_g),
      soluble_fiber_g: round1(b.soluble_fiber_g),
      calories: Math.round(b.calories),
      protein_g: round1(b.protein_g),
    });
  }
  // Map iteration is insertion order, so chronological ascending.
  return out;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function localYmd(d: Date): string {
  // We use the device's local time. Fine for a single user in one timezone;
  // would need TZ-aware bucketing for travel-heavy use cases later.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function getRecentMealsForContext(
  daysBack: number = 7,
  limit: number = 30
): Promise<MealSummary[]> {
  const since = Date.now() - daysBack * 24 * 3600 * 1000;
  const { data, error } = await getSupabase()
    .from("meals")
    .select("created_at, caption, meal_vibe, items_json")
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
