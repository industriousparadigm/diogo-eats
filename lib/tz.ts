// Timezone-aware day bucketing for SERVER code.
//
// Vercel functions run in UTC, but the user's calendar runs in
// Europe/Lisbon. Every server-side notion of "today" — meal day
// buckets, quota reset, backfill anchoring — must go through these
// helpers or late-evening meals land on the wrong day (23:30 UTC in
// summer is already tomorrow in Lisbon). Client components may keep
// using device-local Date math; it agrees with this module whenever
// the device is in Portugal.
//
// When the mobile client makes multi-timezone use real, pass the
// device timezone explicitly instead of APP_TZ.

export const APP_TZ = "Europe/Lisbon";

// Y-M-D of a timestamp as seen in tz. en-CA formats as YYYY-MM-DD.
export function tzYmd(ts: number, tz: string = APP_TZ): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ts));
}

// What tz's wall clock reads at the instant `ts`, expressed as a UTC
// timestamp. The difference to `ts` is the tz offset at that moment.
function tzOffsetMs(ts: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ts));
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const wall = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24, // Intl emits "24" for midnight in some environments
    get("minute"),
    get("second")
  );
  return wall - Math.floor(ts / 1000) * 1000;
}

// ms epoch of midnight starting the given Y-M-D in tz. Two correction
// passes converge across DST transitions (the offset at the guess and
// the offset at the answer can differ).
export function tzDayStart(ymd: string, tz: string = APP_TZ): number {
  const [y, m, d] = ymd.split("-").map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d);
  let ts = utcMidnight;
  for (let i = 0; i < 2; i++) {
    ts = utcMidnight - tzOffsetMs(ts, tz);
  }
  return ts;
}

// Half-open [start, end) of the given day in tz. End is the start of
// the NEXT day, so 23h/25h DST days stay correct.
export function tzDayBounds(ymd: string, tz: string = APP_TZ): [number, number] {
  return [tzDayStart(ymd, tz), tzDayStart(addDaysYmd(ymd, 1), tz)];
}

export function todayYmd(tz: string = APP_TZ, now: number = Date.now()): string {
  return tzYmd(now, tz);
}

// Pure calendar arithmetic on Y-M-D strings (timezone-independent).
export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

// Server-side created_at for a meal, replacing the old device-local
// createdAtFor (which, running on a UTC server, anchored backfills to
// UTC end-of-day — already tomorrow in Lisbon summer).
//
// Today / missing / malformed / future forDate → now.
// Past day → the last full second of that day in tz, plus a sub-second
// offset derived from where "now" sits in today. Backfills therefore
// sort to the top of their day (created_at desc), show a 23:59:59 wall
// clock the UI labels "added later", and multiple backfills for the
// same day keep stable real-time order.
export function createdAtForTz(
  forDate: string | null | undefined,
  tz: string = APP_TZ,
  nowTs: number = Date.now()
): number {
  if (!forDate || !/^\d{4}-\d{2}-\d{2}$/.test(forDate)) return nowTs;
  const today = todayYmd(tz, nowTs);
  if (forDate === today) return nowTs;
  if (forDate > today) return nowTs; // Y-M-D compares lexicographically
  const [, end] = tzDayBounds(forDate, tz);
  const candidate = end - 1000;
  const msSinceMidnight = nowTs - tzDayStart(today, tz);
  const offsetMs = Math.max(
    0,
    Math.min(999, Math.floor((msSinceMidnight / 86_400_000) * 1000))
  );
  return candidate + offsetMs;
}
