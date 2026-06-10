// Calendar helpers for the strength engine. Pure Y-M-D string math —
// timezone-independent once a timestamp has been bucketed to a day via
// lib/tz.ts (tzYmd). Never feed these raw Date objects from server-local
// time; Vercel runs UTC and that bug class was already fixed app-wide.

import { addDaysYmd } from "../tz";

// Monday-start week (no prior convention existed in the codebase; Monday
// chosen and documented — the European default, and "3rd session this
// week" should reset on Monday, not Sunday).
export function weekStartYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  const sinceMonday = (day + 6) % 7;
  return addDaysYmd(ymd, -sinceMonday);
}

// Whole calendar days from a to b (positive when b is later).
export function diffDaysYmd(a: string, b: string): number {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  return Math.round(
    (Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000
  );
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export function monthNameOfYmd(ymd: string): string {
  const m = Number(ymd.slice(5, 7));
  return MONTH_NAMES[m - 1] ?? "";
}

// English ordinal: 1st, 2nd, 3rd, 4th … 11th-13th stay "th".
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}
