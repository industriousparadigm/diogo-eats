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

// Compute a meal's created_at timestamp.
//
// Today (or null/undefined forDate): the actual current timestamp.
//
// Past day backfill: anchored to the LAST second of that day, with a
// sub-second offset derived from where "now" sits in today. This gives
// two important properties:
//   1. Backfilled meals always land at end-of-day, so they show up at
//      the TOP of that day's list (sorted by created_at desc) — they
//      never get interleaved between the day's "real" meals in a wrong
//      position. The UI can detect them by their 23:59:59 clock and
//      label them "added later" instead of a clock time.
//   2. Multiple backfills for the SAME past day, made at different
//      moments today, keep a stable order (later real-time = later
//      timestamp, sub-second precision) — so the user sees the most
//      recently entered backfill at the top of that day's list.
//
// Future dates: fall back to now. The app never logs forward.
export function createdAtFor(
  forDate: string | null | undefined,
  now: Date = new Date()
): number {
  if (!forDate || !/^\d{4}-\d{2}-\d{2}$/.test(forDate)) return now.getTime();
  const todayYmd = ymd(todayStart(now));
  // If the user is logging for today, just use real time.
  if (forDate === todayYmd) return now.getTime();
  const [y, m, d] = forDate.split("-").map(Number);
  const candidate = new Date(y, m - 1, d, 23, 59, 59, 0).getTime();
  // Reject future dates: fall back to now rather than logging forward.
  if (candidate > now.getTime()) return now.getTime();
  const startOfToday = todayStart(now).getTime();
  const msSinceMidnight = now.getTime() - startOfToday;
  // Map 0..86_400_000ms-since-midnight to 0..999ms offset added to
  // 23:59:59.000 of the target past day. Lands in the last full second
  // of that day, monotonically increasing with real-time-today.
  const offsetMs = Math.floor((msSinceMidnight / 86_400_000) * 1000);
  return candidate + offsetMs;
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
