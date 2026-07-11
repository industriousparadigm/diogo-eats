// Movement quick-log — client-side validation (mirroring the server's rules
// so a bad value is caught before the round-trip, with the same messages the
// API would 400 with) + the small formatting/stepper helpers the log sheet
// and activity cards share. Pure functions, testable.
//
// THE SERVER RULES (from the /api/activities contract):
//   - duration_min: integer, 1..1440 (24h cap)
//   - effort: one of light | moderate | hard (or omitted)
//   - distance_km: > 0 when present
//   - started_at: not in the future, not older than 1 year
// We validate the same things so the form never submits a value the server
// will reject. The server is still authoritative — this is a courtesy, not a
// trust boundary.

import type { ActivityEffort, CreateActivityInput } from "./activityTypes";

export const EFFORTS: ActivityEffort[] = ["light", "moderate", "hard"];

export const DURATION_MIN = 1;
export const DURATION_MAX = 1440;
export const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// Surface — the ground a distance activity was done on. The whitelist mirrors
// the server CHECK; the UI only offers the subset that makes sense per type
// (a track run yes, a track swim no).
export const SURFACES = [
  "road",
  "trail",
  "track",
  "treadmill",
  "gravel",
  "indoor",
  "mixed",
] as const;
export type Surface = (typeof SURFACES)[number];

const SURFACE_BY_TYPE: Record<string, Surface[]> = {
  run: ["road", "trail", "track", "treadmill"],
  walk: ["road", "trail", "treadmill"],
  hike: ["trail", "road"],
  bike: ["road", "trail", "gravel", "indoor"],
};

// The surface chips a given type offers (empty = no surface field for that
// type, e.g. padel/swim/football). Unknown types get none.
export function surfaceOptions(type: string): Surface[] {
  return SURFACE_BY_TYPE[type] ?? [];
}

export const ELEVATION_MAX_M = 30000; // sane ceiling (mirrors the server CHECK)

// The quick-log form's raw fields (strings, as they come off the inputs).
export type QuickLogDraft = {
  type: string;
  durationText: string; // numeric input
  effort: ActivityEffort | null;
  label: string;
  note: string;
  distanceText: string; // decimal input; only for distance-y types
  startedAt: number; // ms epoch, defaulted to now / a back-stepped day
  // Richer optional detail (15 Jun). Optional on the draft so existing
  // callers/tests keep working; the validator defaults them.
  surface?: Surface | null; // road/trail/… (distance types)
  elevationText?: string; // integer meters of gain
  photoFilename?: string | null; // a parsed Strava screenshot attached to this log
};

export type ValidationResult =
  | { ok: true; input: CreateActivityInput }
  | { ok: false; error: string };

// Validate + normalize a draft into a CreateActivityInput, or return the
// first human error. `now` lets tests freeze time; the screen passes
// Date.now().
export function validateQuickLog(
  draft: QuickLogDraft,
  now: number,
  distanceEnabled: boolean
): ValidationResult {
  const type = draft.type.trim();
  if (!type) return { ok: false, error: "pick a movement type" };

  // Duration: integer minutes 1..1440.
  const duration = Number(draft.durationText.trim());
  if (!Number.isFinite(duration) || !Number.isInteger(duration)) {
    return { ok: false, error: "duration must be a whole number of minutes" };
  }
  if (duration < DURATION_MIN || duration > DURATION_MAX) {
    return { ok: false, error: "duration must be between 1 and 1440 minutes" };
  }

  // Effort: whitelist or none.
  if (draft.effort !== null && !EFFORTS.includes(draft.effort)) {
    return { ok: false, error: "effort must be light, moderate, or hard" };
  }

  // started_at: not future, not older than a year.
  if (draft.startedAt > now) {
    return { ok: false, error: "that's in the future" };
  }
  if (draft.startedAt < now - ONE_YEAR_MS) {
    return { ok: false, error: "that's more than a year ago" };
  }

  // distance_km: only meaningful for distance-y types; > 0 when given.
  let distance_km: number | null = null;
  if (distanceEnabled && draft.distanceText.trim()) {
    const d = Number(draft.distanceText.trim());
    if (!Number.isFinite(d) || d <= 0) {
      return { ok: false, error: "distance must be greater than 0" };
    }
    distance_km = d;
  }

  // surface: optional; when present must be a known surface.
  let surface: Surface | null = null;
  if (draft.surface != null) {
    if (!SURFACES.includes(draft.surface)) {
      return { ok: false, error: "unknown surface" };
    }
    surface = draft.surface;
  }

  // elevation: optional; integer meters of gain, 0..ELEVATION_MAX_M.
  let elevation_m: number | null = null;
  const elevText = (draft.elevationText ?? "").trim();
  if (elevText) {
    const e = Number(elevText);
    if (!Number.isFinite(e) || !Number.isInteger(e) || e < 0) {
      return { ok: false, error: "elevation must be a whole number of meters" };
    }
    if (e > ELEVATION_MAX_M) {
      return { ok: false, error: `elevation must be ${ELEVATION_MAX_M}m or less` };
    }
    elevation_m = e;
  }

  const label = draft.label.trim();
  const note = draft.note.trim();

  return {
    ok: true,
    input: {
      type,
      duration_min: duration,
      started_at: draft.startedAt,
      effort: draft.effort,
      distance_km,
      surface,
      elevation_m,
      photo_filename: draft.photoFilename ?? null,
      label: label ? label : null,
      note: note ? note : null,
    },
  };
}

// ---- display formatting (cards + detail) ---------------------------------

// "90 MIN" — the duration as the card's big StatNumber value (caller styles
// the numeral; this returns just the digits, the "MIN" rides as the label).
export function fmtDurationValue(min: number): string {
  return String(min);
}

// A felt-effort chip's text — "felt: light". null effort renders no chip.
export function fmtEffort(effort: ActivityEffort | null): string | null {
  if (!effort) return null;
  return `felt: ${effort}`;
}

// "5.2 km" — trims trailing zeros (5 → "5 km", 5.20 → "5.2 km"). null hides.
export function fmtDistance(km: number | null): string | null {
  if (km == null) return null;
  return `${parseFloat(km.toFixed(2))} km`;
}

// "5:30 /km" — average pace DERIVED from distance + time (we never store it;
// distance ÷ time is the truth). null when either input is missing/zero, so a
// run with no distance just hides pace rather than showing "∞". Rounds to the
// second, rolling 60s up to the next minute.
export function fmtPace(distanceKm: number | null, durationMin: number | null): string | null {
  if (distanceKm == null || durationMin == null) return null;
  if (distanceKm <= 0 || durationMin <= 0) return null;
  const minPerKm = durationMin / distanceKm;
  let m = Math.floor(minPerKm);
  let s = Math.round((minPerKm - m) * 60);
  if (s === 60) {
    m += 1;
    s = 0;
  }
  return `${m}:${String(s).padStart(2, "0")} /km`;
}

// "320 m" elevation gain, or null. Whole meters.
export function fmtElevation(m: number | null): string | null {
  if (m == null) return null;
  return `${Math.round(m)} m`;
}

// ---- Garmin-measured post-workout numbers (11 Jul enrichment) ------------
// Garmin's own RPE/feel/training-effect, read-only — only present when
// Garmin measured the workout. Display-only formatting; there is no input
// path for these (the app never lets a user set them).

// Garmin's RPE is 0-100; the app shows it the way an athlete talks about
// RPE, out of 10: 50 → "5/10".
export function fmtGarminRpe(rpe: number): string {
  return `${Math.round(rpe / 10)}/10`;
}

// Garmin's "feel" is 0-100 in practice landing near 25/50/75/100; map to
// the nearest of Garmin's four labels rather than assuming an exact hit.
const FEEL_BUCKETS: Array<{ at: number; label: string }> = [
  { at: 25, label: "weak" },
  { at: 50, label: "normal" },
  { at: 75, label: "good" },
  { at: 100, label: "strong" },
];

export function fmtGarminFeel(feel: number): string {
  let nearest = FEEL_BUCKETS[0];
  let bestDiff = Math.abs(feel - nearest.at);
  for (const bucket of FEEL_BUCKETS.slice(1)) {
    const diff = Math.abs(feel - bucket.at);
    if (diff < bestDiff) {
      nearest = bucket;
      bestDiff = diff;
    }
  }
  return nearest.label;
}

// "3.7 aerobic" — Garmin's aerobic training effect, 0-5.
export function fmtTrainingEffect(te: number): string {
  return `${te.toFixed(1)} aerobic`;
}

// The card's sub-line: "padel · class" (type name + label), or just the
// type name when there's no label. Caller passes the resolved display name.
export function fmtActivitySubtitle(typeName: string, label: string | null): string {
  const l = label?.trim();
  return l ? `${typeName.toLowerCase()} · ${l}` : typeName.toLowerCase();
}

// ---- the date-back stepper (no heavy datetime dep) -----------------------
//
// The log sheet defaults to today and lets the user step BACK whole days
// (backfill) — and the edit sheet lets the user nudge the HOUR. Both are
// plain integer arithmetic on the ms epoch, computed in LOCAL time so a
// "−1 day" lands on the same wall-clock time yesterday (DST-safe via the
// Date constructor, which normalizes overflow).

// Step a timestamp by whole local days (negative = earlier). Preserves the
// local hour/minute.
export function stepDays(ms: number, deltaDays: number): number {
  const d = new Date(ms);
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() + deltaDays,
    d.getHours(),
    d.getMinutes()
  ).getTime();
}

// Step a timestamp by whole hours (negative = earlier). Wraps the day
// naturally via the Date constructor's overflow normalization.
export function stepHours(ms: number, deltaHours: number): number {
  const d = new Date(ms);
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    d.getHours() + deltaHours,
    d.getMinutes()
  ).getTime();
}

// How many whole LOCAL days back from `now` a timestamp sits (0 = today, 1 =
// yesterday). Used to render the backfill stepper's "today / −1 day" label.
export function daysBack(ms: number, now: number): number {
  const a = startOfLocalDay(ms);
  const b = startOfLocalDay(now);
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// The stepper's human label: "today", "yesterday", or "N days ago".
export function fmtDaysBack(ms: number, now: number): string {
  const n = daysBack(ms, now);
  if (n <= 0) return "today";
  if (n === 1) return "yesterday";
  return `${n} days ago`;
}

// "11:00" — the started_at clock, for the edit sheet's hour stepper readout.
export function fmtClock(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
