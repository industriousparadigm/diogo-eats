import type { Item, Meal } from "./types";

// Markdown report of a single day's meals + totals, designed to be pasted
// into other AI chats / journals / notes. Concise, scannable, no emoji,
// no calorie-shame framing. Lowercase aesthetic matches the rest of the
// app's tone.
//
// Why markdown over plain text: most consumers (Claude, ChatGPT, Obsidian,
// Notion, GitHub) render the headers and bullets nicely; raw consumers
// still see something readable.

// Backfill sentinel: server stamps meals logged for a past day as the
// last second of that day. Pure check by clock components — robust to
// timezone shenanigans because we read the local fields directly.
export function isBackfillCreatedAt(ts: number): boolean {
  const d = new Date(ts);
  return d.getHours() === 23 && d.getMinutes() === 59 && d.getSeconds() === 59;
}

function safeParseItems(raw: string): Item[] {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function ymdHuman(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function clockOrTag(ts: number): string {
  if (isBackfillCreatedAt(ts)) return "added later";
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function aggregate(meals: Meal[]) {
  let cal = 0;
  let sat = 0;
  let fib = 0;
  let pro = 0;
  let plantSum = 0;
  for (const m of meals) {
    cal += m.calories;
    sat += m.sat_fat_g;
    fib += m.soluble_fiber_g;
    pro += m.protein_g;
    plantSum += m.plant_pct;
  }
  const plant = meals.length ? Math.round(plantSum / meals.length) : 0;
  return { cal, sat, fib, pro, plant };
}

export function formatDayReport(meals: Meal[], date: Date): string {
  const dateStr = ymdHuman(date);
  if (meals.length === 0) {
    return `# eats · ${dateStr}\n\nno meals logged.`;
  }

  const t = aggregate(meals);
  const lines: string[] = [];
  lines.push(`# eats · ${dateStr}`);
  lines.push("");
  lines.push("## day totals");
  lines.push(`- ${Math.round(t.cal)} kcal`);
  lines.push(`- ${t.sat.toFixed(1)}g sat fat`);
  lines.push(`- ${t.fib.toFixed(1)}g soluble fiber`);
  lines.push(`- ${t.pro.toFixed(0)}g protein`);
  lines.push(`- ${t.plant}% plant (average across meals)`);
  lines.push("");
  lines.push(`## meals (${meals.length})`);

  for (const m of meals) {
    const items = safeParseItems(m.items_json);
    const clock = clockOrTag(m.created_at);
    lines.push("");
    lines.push(`### ${clock}`);
    if (m.meal_vibe) lines.push(`*${m.meal_vibe}*`);
    if (m.caption) lines.push(`> ${m.caption.trim()}`);
    if (items.length > 0) {
      for (const it of items) {
        const g = Math.round(it.grams);
        lines.push(`- ${g}g ${it.name}`);
      }
    }
    const plantTag = m.plant_pct >= 100 ? " · 100% plant" : "";
    lines.push(
      `${Math.round(m.calories)} kcal · ${m.sat_fat_g.toFixed(1)}g sat · ${m.soluble_fiber_g.toFixed(1)}g fib · ${m.protein_g.toFixed(0)}g pro${plantTag}`
    );
    if (m.notes) lines.push(`_${m.notes.trim()}_`);
  }

  return lines.join("\n");
}
