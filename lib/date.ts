// Pure date helpers used by Home, History, and the meal route. Kept in
// their own file so they're trivially testable and the page components
// don't ship duplicate logic.

export function todayStart(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseYmd(s: string): Date {
  // Anchored at midnight LOCAL — never UTC, so day boundaries match the
  // user's calendar. Inputs we receive look like "2026-05-08".
  return new Date(`${s}T00:00:00`);
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Human-readable relative-or-absolute label for the header.
// Today / Yesterday for the close cases; weekday + month + day for older.
export function dayLabel(d: Date, now: Date = new Date()): string {
  const today = todayStart(now);
  const target = todayStart(d);
  const diffDays = Math.round(
    (today.getTime() - target.getTime()) / (24 * 3600 * 1000)
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}
