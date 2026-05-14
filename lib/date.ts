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

// Compute a meal's created_at timestamp. Default is "now". If a valid
// "YYYY-MM-DD" forDate is passed, the timestamp lands on that calendar
// date at the current local time-of-day — so a meal backfilled to
// yesterday at 8pm appears at 8pm yesterday, not at midnight. Future
// dates fall back to now: the app never logs forward.
export function createdAtFor(
  forDate: string | null | undefined,
  now: Date = new Date()
): number {
  if (!forDate || !/^\d{4}-\d{2}-\d{2}$/.test(forDate)) return now.getTime();
  const [y, m, d] = forDate.split("-").map(Number);
  const target = new Date(
    y,
    m - 1,
    d,
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
    now.getMilliseconds()
  );
  return target.getTime() > now.getTime() ? now.getTime() : target.getTime();
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
