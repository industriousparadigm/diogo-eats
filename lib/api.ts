// Single client-side surface for talking to the /api/* routes. Components
// should NOT call fetch directly — they should call these helpers — so:
//   - one place owns the URL paths and request/response shapes
//   - error handling is consistent (every helper throws an Error with the
//     server's `error` field as the message, or a generic fallback)
//   - swapping transport (e.g. tRPC, server actions) later means changing
//     this file, not 30 components
//
// Each helper is async and throws on non-2xx. Caller is expected to wrap
// in try/catch + setError when invoked from a UI handler.

import type { DayAggregate, Item, Meal, Per100g } from "./types";

async function jsonOrThrow<T>(r: Response, fallbackErr: string): Promise<T> {
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error((j as { error?: string }).error ?? fallbackErr);
  }
  return j as T;
}

// ---- meals ----

export async function fetchMealsForDay(date: Date): Promise<Meal[]> {
  const day = ymd(date);
  const r = await fetch(`/api/meals?day=${day}`);
  const j = await jsonOrThrow<{ meals: Meal[] }>(r, "load meals failed");
  return j.meals ?? [];
}

export async function deleteMeal(id: string): Promise<void> {
  const r = await fetch("/api/meals", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  await jsonOrThrow<{ ok: true }>(r, "delete failed");
}

export async function patchMealItems(
  id: string,
  items: Item[],
  createdAt?: number
): Promise<Meal> {
  const r = await fetch(`/api/meals/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      createdAt != null ? { items, created_at: createdAt } : { items }
    ),
  });
  const j = await jsonOrThrow<{ meal: Meal }>(r, "save failed");
  return j.meal;
}

// Deterministic lane: re-log a known meal verbatim, no Vision call.
// `scale` multiplies every portion (default 1×); `forDate` backfills to a
// past day (default today, server-side). Returns the freshly inserted copy.
export async function repeatMeal(
  id: string,
  opts: { scale?: number; forDate?: string } = {}
): Promise<Meal> {
  const body: { scale?: number; for_date?: string } = {};
  if (opts.scale != null) body.scale = opts.scale;
  if (opts.forDate) body.for_date = opts.forDate;
  const r = await fetch(`/api/meals/${id}/repeat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await jsonOrThrow<{ meal: Meal }>(r, "repeat failed");
  return j.meal;
}

export async function talkFixMeal(id: string, message: string): Promise<Item[]> {
  const r = await fetch(`/api/meals/${id}/talk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  const j = await jsonOrThrow<{ items: Item[] }>(r, "fix failed");
  if (!Array.isArray(j.items) || j.items.length === 0) {
    throw new Error("got empty items back");
  }
  return j.items;
}

// ---- parse ----

// Client-side resize before upload. Two reasons this matters:
//  1) Vercel rejects requests over the platform body limit, so two raw
//     phone photos (3-5MB each) reliably fail before reaching the function.
//  2) On weak signal, a 700KB upload finishes; an 8MB one trips edge
//     timeouts long before the function would.
// Server still normalizes via sharp as a defensive belt-and-braces.
async function resizeForUpload(file: File): Promise<Blob> {
  // HEIC/odd formats may not decode in the browser. If anything goes
  // sideways, fall back to the original file rather than block the upload.
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const maxDim = 2048;
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d ctx");
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85)
    );
    if (!blob) throw new Error("toBlob returned null");
    return blob;
  } catch {
    return file;
  }
}

// `forDate` is an optional "YYYY-MM-DD" that backfills a log to a past day.
// Server treats absence as "log for now"; presence means "use that calendar
// date with the current local time-of-day as the meal's created_at".
export async function parsePhoto(
  files: File[],
  caption?: string,
  forDate?: string
): Promise<Meal> {
  const fd = new FormData();
  for (const f of files) {
    const blob = await resizeForUpload(f);
    const name = f.name.replace(/\.[^.]+$/, "") + ".jpg";
    fd.append("photo", blob, name);
  }
  if (caption?.trim()) fd.append("caption", caption.trim());
  if (forDate) fd.append("for_date", forDate);
  const r = await fetch("/api/parse", { method: "POST", body: fd });
  const j = await jsonOrThrow<{ meal: Meal }>(r, "parse failed");
  return j.meal;
}

export async function parseText(text: string, forDate?: string): Promise<Meal> {
  const r = await fetch("/api/parse-text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, for_date: forDate }),
  });
  const j = await jsonOrThrow<{ meal: Meal }>(r, "parse-text failed");
  return j.meal;
}

// ---- lookup ----

export type LookupResult = { is_plant: boolean; per_100g: Per100g };

export async function lookupFood(name: string): Promise<LookupResult> {
  const r = await fetch("/api/lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return jsonOrThrow<LookupResult>(r, "lookup failed");
}

// ---- foods library ----

export type Provenance = "label_verified" | "user_corrected" | "ai_inferred";

export type Food = {
  name_key: string;
  display_name: string;
  is_plant: number;
  per_100g_json: string;
  times_seen: number;
  last_seen: number;
  provenance: Provenance;
  portion_presets: { label: string; grams: number }[] | null;
};

export async function fetchFoods(
  query: string = "",
  opts: { limit?: number; offset?: number } = {}
): Promise<Food[]> {
  const p = new URLSearchParams();
  if (query.trim()) p.set("q", query.trim());
  if (opts.limit != null) p.set("limit", String(opts.limit));
  if (opts.offset != null) p.set("offset", String(opts.offset));
  const r = await fetch(`/api/foods?${p.toString()}`);
  const j = await jsonOrThrow<{ foods: Food[] }>(r, "load foods failed");
  return j.foods ?? [];
}

export async function createFood(input: {
  display_name: string;
  is_plant: boolean;
  per_100g: Per100g;
}): Promise<Food> {
  const r = await fetch("/api/foods", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const j = await jsonOrThrow<{ food: Food }>(r, "add food failed");
  return j.food;
}

export async function updateFood(
  nameKey: string,
  patch: { display_name?: string; is_plant?: boolean; per_100g?: Per100g }
): Promise<Food> {
  const r = await fetch(`/api/foods/${encodeURIComponent(nameKey)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const j = await jsonOrThrow<{ food: Food }>(r, "update food failed");
  return j.food;
}

export async function deleteFood(nameKey: string): Promise<void> {
  const r = await fetch(`/api/foods/${encodeURIComponent(nameKey)}`, {
    method: "DELETE",
  });
  await jsonOrThrow<{ ok: true }>(r, "delete food failed");
}

export async function mergeFoods(keepKey: string, mergeKeys: string[]): Promise<Food> {
  const r = await fetch("/api/foods/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keep_id: keepKey, merge_ids: mergeKeys }),
  });
  const j = await jsonOrThrow<{ food: Food }>(r, "merge failed");
  return j.food;
}

// Deterministic lane: build a meal from known library foods, zero AI.
// `items` are { food_id (a library name_key), grams }. Returns the meal.
export async function composeMeal(
  items: { food_id: string; grams: number }[],
  opts: { forDate?: string; caption?: string } = {}
): Promise<Meal> {
  const body: { items: typeof items; for_date?: string; caption?: string } = { items };
  if (opts.forDate) body.for_date = opts.forDate;
  if (opts.caption?.trim()) body.caption = opts.caption.trim();
  const r = await fetch("/api/meals/compose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await jsonOrThrow<{ meal: Meal }>(r, "compose failed");
  return j.meal;
}

export async function foodFromLabel(file: File): Promise<Food> {
  const blob = await resizeForUpload(file);
  const fd = new FormData();
  fd.append("photo", blob, "label.jpg");
  const r = await fetch("/api/foods/from-label", { method: "POST", body: fd });
  const j = await jsonOrThrow<{ food: Food }>(r, "label read failed");
  return j.food;
}

// ---- stats ----

export async function fetchStats(days: number = 84): Promise<DayAggregate[]> {
  const r = await fetch(`/api/stats?days=${days}`);
  const j = await jsonOrThrow<{ aggregates: DayAggregate[] }>(r, "stats failed");
  return j.aggregates ?? [];
}

// Tiny local helper — keeps lib/api.ts free of a date.ts import cycle.
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
