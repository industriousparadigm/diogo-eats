// Activities — types + runtime validation for the Movement tab's general
// activities (padel, runs, walks, etc.), the non-gym half of "how I moved".
//
// Validation is PURE (no I/O) and gates every DB write, mirroring
// lib/strength/validate.ts and lib/validate.ts (meals). Returns a typed
// payload on success or a plain-English error string the route turns into
// a 400. The route applies the result; this module never touches the DB.
//
// The CHECK constraints in the activities migration are the backstop;
// these functions reproduce them so the user sees a clean 400 message
// instead of a raw Postgres constraint-violation 500.

// ---- the whitelists (mirror the migration's CHECKs) ----

export const ACTIVITY_TYPES = [
  "padel",
  "run",
  "walk",
  "bike",
  "swim",
  "football",
  "hike",
  "other",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const EFFORTS = ["light", "moderate", "hard"] as const;
export type Effort = (typeof EFFORTS)[number];

// 'manual' is the only source this app writes. 'garmin'/'whoop' are
// reserved for the future automated feed (Pi cron, service-role) — the
// POST route always pins source to 'manual'.
export const SOURCES = ["manual", "garmin", "whoop"] as const;
export type Source = (typeof SOURCES)[number];

// ---- bounds (mirror the migration's CHECKs) ----

const MAX_DURATION_MIN = 1440; // 24h, matching duration_min <= 1440
const MAX_DISTANCE_KM = 1000; // a sane ceiling; the migration only checks > 0
const MAX_LABEL_LENGTH = 200;
const MAX_NOTE_LENGTH = 2000;
const MAX_PAST_MS = 365 * 24 * 3600 * 1000; // a year of backfill headroom
const FUTURE_SLACK_MS = 5 * 60 * 1000; // device clocks drift

// ---- the row shape the API serves ----

export type Activity = {
  id: string;
  type: ActivityType;
  label: string | null;
  started_at: number; // ms epoch
  duration_min: number;
  effort: Effort | null;
  distance_km: number | null;
  note: string | null;
  source: Source;
  external_id: string | null;
  created_at: number; // ms epoch
};

// ---- create (POST) ----

// What a validated POST resolves to. source is fixed to 'manual' at the
// route; external_id is never set from the manual path (only the feed
// uses it), so it isn't part of the create payload.
export type CreatePayload = {
  type: ActivityType;
  label: string | null;
  started_at: number;
  duration_min: number;
  effort: Effort | null;
  distance_km: number | null;
  note: string | null;
};

export type CreateResult =
  | { ok: true; payload: CreatePayload }
  | { ok: false; error: string };

function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

// Shared field validators, returned-string-on-error so create and patch
// stay in lockstep. Each returns the cleaned value or an error string.

function validateType(v: unknown): ActivityType | string {
  if (typeof v !== "string" || !(ACTIVITY_TYPES as readonly string[]).includes(v)) {
    return `type must be one of: ${ACTIVITY_TYPES.join(", ")}`;
  }
  return v as ActivityType;
}

// label / note: optional free text. undefined/null/empty → null. A blank
// or whitespace-only string normalises to null (not stored as "").
function validateOptionalText(
  v: unknown,
  field: string,
  maxLen: number
): string | null | { error: string } {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return { error: `${field} must be a string` };
  const trimmed = v.trim();
  if (trimmed.length > maxLen) return { error: `${field} too long` };
  return trimmed.length > 0 ? trimmed : null;
}

function validateDuration(v: unknown): number | string {
  if (!isFiniteNumber(v) || !Number.isInteger(v)) {
    return "duration_min must be an integer";
  }
  if (v <= 0 || v > MAX_DURATION_MIN) {
    return `duration_min must be between 1 and ${MAX_DURATION_MIN}`;
  }
  return v;
}

function validateEffort(v: unknown): Effort | null | { error: string } {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string" || !(EFFORTS as readonly string[]).includes(v)) {
    return { error: `effort must be one of: ${EFFORTS.join(", ")}` };
  }
  return v as Effort;
}

function validateDistance(v: unknown): number | null | { error: string } {
  if (v === undefined || v === null) return null;
  if (!isFiniteNumber(v) || v <= 0) {
    return { error: "distance_km must be a positive number" };
  }
  if (v > MAX_DISTANCE_KM) {
    return { error: `distance_km too large (max ${MAX_DISTANCE_KM})` };
  }
  return v;
}

// started_at: optional on create (defaults to now at the route). When
// present it must be a finite ms-epoch number within a sane window.
function validateStartedAt(v: unknown, now: number): number | string {
  if (!isFiniteNumber(v)) return "started_at must be a number (ms epoch)";
  const ts = Math.floor(v);
  if (ts > now + FUTURE_SLACK_MS) return "started_at is in the future";
  if (ts < now - MAX_PAST_MS) return "started_at is older than a year";
  return ts;
}

export function validateCreate(
  body: unknown,
  now: number = Date.now()
): CreateResult {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "expected a JSON object" };
  }
  const b = body as Record<string, unknown>;

  const type = validateType(b.type);
  if (typeof type === "string" && !(ACTIVITY_TYPES as readonly string[]).includes(type)) {
    return { ok: false, error: type };
  }

  // started_at defaults to now when omitted.
  let started_at = now;
  if (b.started_at !== undefined && b.started_at !== null) {
    const r = validateStartedAt(b.started_at, now);
    if (typeof r === "string") return { ok: false, error: r };
    started_at = r;
  }

  const duration = validateDuration(b.duration_min);
  if (typeof duration === "string") return { ok: false, error: duration };

  const label = validateOptionalText(b.label, "label", MAX_LABEL_LENGTH);
  if (label && typeof label === "object") return { ok: false, error: label.error };

  const effort = validateEffort(b.effort);
  if (effort && typeof effort === "object") return { ok: false, error: effort.error };

  const distance = validateDistance(b.distance_km);
  if (distance && typeof distance === "object") return { ok: false, error: distance.error };

  const note = validateOptionalText(b.note, "note", MAX_NOTE_LENGTH);
  if (note && typeof note === "object") return { ok: false, error: note.error };

  return {
    ok: true,
    payload: {
      type: type as ActivityType,
      label: label as string | null,
      started_at,
      duration_min: duration,
      effort: effort as Effort | null,
      distance_km: distance as number | null,
      note: note as string | null,
    },
  };
}

// ---- patch (PATCH) ----

// Any subset of the create fields. Only the keys PRESENT in the body are
// validated and returned, so a partial update touches only those columns.
// An empty patch (no recognised keys) is an error — there's nothing to do.
export type PatchPayload = Partial<{
  type: ActivityType;
  label: string | null;
  started_at: number;
  duration_min: number;
  effort: Effort | null;
  distance_km: number | null;
  note: string | null;
}>;

export type PatchResult =
  | { ok: true; payload: PatchPayload }
  | { ok: false; error: string };

export function validatePatch(
  body: unknown,
  now: number = Date.now()
): PatchResult {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "expected a JSON object" };
  }
  const b = body as Record<string, unknown>;
  const patch: PatchPayload = {};

  if ("type" in b) {
    const type = validateType(b.type);
    if (typeof type === "string" && !(ACTIVITY_TYPES as readonly string[]).includes(type)) {
      return { ok: false, error: type };
    }
    patch.type = type as ActivityType;
  }

  if ("started_at" in b) {
    const r = validateStartedAt(b.started_at, now);
    if (typeof r === "string") return { ok: false, error: r };
    patch.started_at = r;
  }

  if ("duration_min" in b) {
    const r = validateDuration(b.duration_min);
    if (typeof r === "string") return { ok: false, error: r };
    patch.duration_min = r;
  }

  if ("label" in b) {
    const r = validateOptionalText(b.label, "label", MAX_LABEL_LENGTH);
    if (r && typeof r === "object") return { ok: false, error: r.error };
    patch.label = r as string | null;
  }

  if ("effort" in b) {
    const r = validateEffort(b.effort);
    if (r && typeof r === "object") return { ok: false, error: r.error };
    patch.effort = r as Effort | null;
  }

  if ("distance_km" in b) {
    const r = validateDistance(b.distance_km);
    if (r && typeof r === "object") return { ok: false, error: r.error };
    patch.distance_km = r as number | null;
  }

  if ("note" in b) {
    const r = validateOptionalText(b.note, "note", MAX_NOTE_LENGTH);
    if (r && typeof r === "object") return { ok: false, error: r.error };
    patch.note = r as string | null;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "nothing to update" };
  }
  return { ok: true, payload: patch };
}

// ---- window clamping (GET ?days=N) ----

export const DEFAULT_DAYS = 30;
export const MIN_DAYS = 1;
export const MAX_DAYS = 365;

// Clamp the ?days param to [1, 365], defaulting to 30 for
// missing/non-integer/out-of-range input. Pure so it's unit-tested
// alongside the validators; the route feeds the result into tz.ts day
// bucketing for the window's lower edge.
export function clampDays(raw: unknown): number {
  // Number("") and Number("  ") coerce to 0, not NaN — an empty/whitespace
  // param means "no value given", so it must fall to the default, not clamp
  // up to MIN_DAYS. Guard the blank-string case before coercing.
  if (typeof raw === "string" && raw.trim() === "") return DEFAULT_DAYS;
  const n = typeof raw === "string" ? Number(raw) : raw;
  if (!isFiniteNumber(n) || !Number.isInteger(n)) return DEFAULT_DAYS;
  if (n < MIN_DAYS) return MIN_DAYS;
  if (n > MAX_DAYS) return MAX_DAYS;
  return n;
}
