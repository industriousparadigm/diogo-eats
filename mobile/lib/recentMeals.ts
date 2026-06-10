// Pure helpers for the capture-sheet's recent-meals repeat row. The sheet
// shows the last ~14 days of meals (newest first) as one-tap repeats so
// logging-time is the discovery point, not only day browsing. Searchable
// by caption / vibe / item names.

import { parseItems, type Meal } from "./types";

// Lowercased haystack for a meal: caption + vibe + every item name.
// Memo-free (cheap; the recent list is small) — computed per filter pass.
function mealHaystack(meal: Meal): string {
  const parts: string[] = [];
  if (meal.caption) parts.push(meal.caption);
  if (meal.meal_vibe) parts.push(meal.meal_vibe);
  for (const it of parseItems(meal.items_json)) {
    if (it.name) parts.push(it.name);
  }
  return parts.join(" ").toLowerCase();
}

// Filter recent meals by a free-text query against caption / vibe / item
// names. Empty / whitespace query returns the input unchanged. Order is
// preserved (the API already returns newest-first).
export function filterRecentMeals(meals: Meal[], query: string): Meal[] {
  const q = query.trim().toLowerCase();
  if (!q) return meals;
  // Every whitespace-separated term must appear somewhere (AND search),
  // so "oat banana" finds a meal with both even in different items.
  const terms = q.split(/\s+/);
  return meals.filter((m) => {
    const hay = mealHaystack(m);
    return terms.every((t) => hay.includes(t));
  });
}

// One-line label for a recent-meal chip: prefer caption, then vibe, then a
// short item summary, then a bare fallback. Never fabricates.
export function recentMealLabel(meal: Meal): string {
  const caption = meal.caption?.trim();
  if (caption) return caption;
  const vibe = meal.meal_vibe?.trim();
  if (vibe) return vibe;
  const items = parseItems(meal.items_json)
    .slice()
    .sort((a, b) => b.grams - a.grams)
    .map((i) => i.name)
    .filter(Boolean);
  if (items.length > 0) {
    const top = items.slice(0, 2);
    const rest = items.length - top.length;
    return rest > 0 ? `${top.join(", ")} +${rest}` : top.join(", ");
  }
  return "meal";
}
