import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
}

// Server-side admin client. Service role key bypasses RLS, which is what
// we want — all reads/writes go through Next.js API routes that already
// gate access. The anon key never touches data tables.
export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

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
  notes: string | null;
  caption: string | null;
  meal_vibe: string | null;
};

export async function insertMeal(m: Meal) {
  const { error } = await supabase.from("meals").insert(m);
  if (error) throw new Error(`insertMeal: ${error.message}`);
}

export async function deleteMeal(id: string) {
  // Best-effort photo cleanup. Fetch the row first to know the filename,
  // then drop the storage object alongside the DB row. Failures on the
  // storage side don't block the DB delete — orphan files are easy to
  // garbage-collect later.
  const { data: row } = await supabase
    .from("meals")
    .select("photo_filename")
    .eq("id", id)
    .maybeSingle();
  if (row?.photo_filename) {
    await supabase.storage.from("photos").remove([row.photo_filename]).catch(() => {});
  }
  const { error } = await supabase.from("meals").delete().eq("id", id);
  if (error) throw new Error(`deleteMeal: ${error.message}`);
}

export async function getMeal(id: string): Promise<Meal | null> {
  const { data, error } = await supabase
    .from("meals")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getMeal: ${error.message}`);
  return (data as Meal) ?? null;
}

export async function getMealsBetween(startMs: number, endMs: number): Promise<Meal[]> {
  const { data, error } = await supabase
    .from("meals")
    .select("*")
    .gte("created_at", startMs)
    .lt("created_at", endMs)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`getMealsBetween: ${error.message}`);
  return (data as Meal[]) ?? [];
}

export async function updateMealItems(
  id: string,
  itemsJson: string,
  totals: {
    sat_fat_g: number;
    soluble_fiber_g: number;
    calories: number;
    protein_g: number;
    plant_pct: number;
  }
) {
  const { error } = await supabase
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
        supabase
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
  const { data, error } = await supabase
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

export async function getRecentMealsForContext(
  daysBack: number = 7,
  limit: number = 30
): Promise<MealSummary[]> {
  const since = Date.now() - daysBack * 24 * 3600 * 1000;
  const { data, error } = await supabase
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
