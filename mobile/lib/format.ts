// Display formatting helpers — pure functions, fully testable.

// Format a number for display with a fixed number of decimal places,
// trimming trailing zeros.
export function fmt(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return "0";
  return parseFloat(value.toFixed(decimals)).toString();
}

// Format calories as a whole number.
export function fmtCal(calories: number): string {
  return Math.round(calories).toString();
}

// Format plant% as "73%" with no decimals.
export function fmtPlant(pct: number): string {
  return `${Math.round(pct)}%`;
}

// Summarize items list into a one-line description for a meal card.
// Shows top 3 items by grams, then "+N more" if needed.
export function itemsSummary(items_json: string): string {
  try {
    const items = JSON.parse(items_json) as Array<{ name: string; grams: number }>;
    if (!Array.isArray(items) || items.length === 0) return "";
    const sorted = [...items].sort((a, b) => b.grams - a.grams);
    const top = sorted.slice(0, 3).map((i) => i.name);
    const rest = sorted.length - top.length;
    return rest > 0 ? `${top.join(", ")} +${rest} more` : top.join(", ");
  } catch {
    return "";
  }
}

// Format a ms-epoch timestamp as a time string (HH:MM) in local time.
export function fmtTime(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

// Format a YYYY-MM-DD date string as "Monday, 10 Jun".
export function fmtDayLabel(ymd: string): string {
  const [y, mo, d] = ymd.split("-").map(Number);
  const date = new Date(y, mo - 1, d);
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

// Return today's date as YYYY-MM-DD in local time.
export function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const mo = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

// Shift a YYYY-MM-DD day string by deltaDays (local-time safe — date
// parts only, no UTC parsing pitfalls). Used by the day navigation.
export function shiftYmd(ymd: string, deltaDays: number): string {
  const [y, mo, d] = ymd.split("-").map(Number);
  const date = new Date(y, mo - 1, d + deltaDays);
  const yy = date.getFullYear();
  const mm = (date.getMonth() + 1).toString().padStart(2, "0");
  const dd = date.getDate().toString().padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// Human header label for a day: Today / Yesterday for the close cases,
// "Monday, 8 Jun" for older. Mirrors the web's dayLabel.
export function dayNavLabel(ymd: string, todayYmdStr: string = todayYmd()): string {
  if (ymd === todayYmdStr) return "Today";
  if (ymd === shiftYmd(todayYmdStr, -1)) return "Yesterday";
  return fmtDayLabel(ymd);
}

// Parse a meal's items_json and return total grams for a quick size hint.
export function totalGrams(items_json: string): number {
  try {
    const items = JSON.parse(items_json) as Array<{ grams: number }>;
    return Array.isArray(items) ? items.reduce((s, i) => s + (i.grams ?? 0), 0) : 0;
  } catch {
    return 0;
  }
}
