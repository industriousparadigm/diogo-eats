// Tiny module-level stores for cross-screen handoff — the same pattern
// the web app uses (lib/pendingStore.ts). Route params stay clean and
// big objects (a meal's items_json, a highlights payload) don't get
// serialized through the URL.

import type { Meal } from "./types";
import type { CompleteSessionResult } from "./strengthTypes";

// ---- meal handoff: day list -> meal edit screen ----

const meals = new Map<string, Meal>();

export function stashMeal(meal: Meal): void {
  meals.set(meal.id, meal);
}

export function takeMeal(id: string): Meal | null {
  return meals.get(id) ?? null;
}

// ---- selected day: overview heatmap -> food tab ----

type DayListener = (ymd: string) => void;
const dayListeners = new Set<DayListener>();
let pendingDay: string | null = null;

export function pickDay(ymd: string): void {
  pendingDay = ymd;
  for (const l of dayListeners) l(ymd);
}

// The food tab consumes the pending day when it gains focus (it may
// have been unmounted when the heatmap was tapped).
export function consumePendingDay(): string | null {
  const d = pendingDay;
  pendingDay = null;
  return d;
}

export function onDayPicked(listener: DayListener): () => void {
  dayListeners.add(listener);
  return () => {
    dayListeners.delete(listener);
  };
}

// ---- composed/new meal handoff: composer -> food tab ----
//
// The composer (and any other pushed screen that creates a meal) stashes
// the freshly-inserted meal here before navigating back. The food tab
// picks it up on focus and inserts it without a refetch (and jumps to the
// day it landed on if it was a backfill). { meal, day } so the tab can
// decide whether the meal belongs to the currently-viewed day.

let newMeal: { meal: Meal; day: string } | null = null;

export function stashNewMeal(meal: Meal, day: string): void {
  newMeal = { meal, day };
}

export function takeNewMeal(): { meal: Meal; day: string } | null {
  const v = newMeal;
  newMeal = null;
  return v;
}

// ---- highlights handoff: session complete -> highlights screen ----

let lastResult: CompleteSessionResult | null = null;

export function stashSessionResult(result: CompleteSessionResult): void {
  lastResult = result;
}

export function takeSessionResult(): CompleteSessionResult | null {
  const r = lastResult;
  lastResult = null;
  return r;
}
