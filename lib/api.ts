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

export async function patchMealItems(id: string, items: Item[]): Promise<Meal> {
  const r = await fetch(`/api/meals/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  const j = await jsonOrThrow<{ meal: Meal }>(r, "save failed");
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

export async function parsePhoto(
  files: File[],
  caption?: string
): Promise<Meal> {
  const fd = new FormData();
  for (const f of files) fd.append("photo", f);
  if (caption?.trim()) fd.append("caption", caption.trim());
  const r = await fetch("/api/parse", { method: "POST", body: fd });
  const j = await jsonOrThrow<{ meal: Meal }>(r, "parse failed");
  return j.meal;
}

export async function parseText(text: string): Promise<Meal> {
  const r = await fetch("/api/parse-text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
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
