// Runtime validation for POST /api/strength/sessions payloads. Pure
// (no I/O), gates DB writes, thoroughly tested — same rationale as
// lib/validate.ts for meals.
//
// Returns a typed payload on success or a plain-English error string
// the route turns into a 400.

import type { Exercise, StrengthSet } from "./types";

export type SessionPayload = {
  started_at: number;
  completed_at: number;
  note: string | null;
  sets: StrengthSet[]; // in logged order; position = array index
};

const MAX_SETS = 200;
const MAX_NOTE_LENGTH = 2000;
const MAX_WEIGHT_KG = 500;
const MAX_REPS = 1000; // carries count steps — give them headroom
const MAX_SESSION_MS = 12 * 3600 * 1000;
const MAX_PAST_MS = 7 * 24 * 3600 * 1000;
const FUTURE_SLACK_MS = 5 * 60 * 1000; // device clocks drift

export type ValidationResult =
  | { ok: true; payload: SessionPayload }
  | { ok: false; error: string };

function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

export function validateSessionPayload(
  body: unknown,
  exercises: Exercise[],
  now: number = Date.now()
): ValidationResult {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "expected a JSON object" };
  }
  const b = body as Record<string, unknown>;

  if (!isFiniteNumber(b.started_at) || !isFiniteNumber(b.completed_at)) {
    return { ok: false, error: "started_at and completed_at must be numbers (ms epoch)" };
  }
  const started_at = Math.floor(b.started_at);
  const completed_at = Math.floor(b.completed_at);
  if (completed_at < started_at) {
    return { ok: false, error: "completed_at must not precede started_at" };
  }
  if (completed_at - started_at > MAX_SESSION_MS) {
    return { ok: false, error: "session longer than 12 hours" };
  }
  if (completed_at > now + FUTURE_SLACK_MS) {
    return { ok: false, error: "completed_at is in the future" };
  }
  if (completed_at < now - MAX_PAST_MS) {
    return { ok: false, error: "session is older than 7 days" };
  }

  let note: string | null = null;
  if (b.note !== undefined && b.note !== null) {
    if (typeof b.note !== "string") {
      return { ok: false, error: "note must be a string" };
    }
    const trimmed = b.note.trim();
    if (trimmed.length > MAX_NOTE_LENGTH) {
      return { ok: false, error: "note too long" };
    }
    note = trimmed.length > 0 ? trimmed : null;
  }

  if (!Array.isArray(b.sets) || b.sets.length === 0) {
    return { ok: false, error: "at least one set required" };
  }
  if (b.sets.length > MAX_SETS) {
    return { ok: false, error: "too many sets" };
  }

  const byId = new Map(exercises.map((e) => [e.id, e]));
  const sets: StrengthSet[] = [];
  const seriesSeen = new Set<string>(); // exercise_id:series_index uniqueness

  for (const raw of b.sets) {
    if (!raw || typeof raw !== "object") {
      return { ok: false, error: "invalid set shape" };
    }
    const s = raw as Record<string, unknown>;

    if (typeof s.exercise_id !== "string") {
      return { ok: false, error: "set missing exercise_id" };
    }
    const exercise = byId.get(s.exercise_id);
    if (!exercise) {
      return { ok: false, error: `unknown exercise: ${s.exercise_id}` };
    }

    if (
      !isFiniteNumber(s.series_index) ||
      !Number.isInteger(s.series_index) ||
      s.series_index < 1 ||
      s.series_index > 50
    ) {
      return { ok: false, error: "series_index must be an integer from 1 to 50" };
    }
    const seriesKey = `${s.exercise_id}:${s.series_index}`;
    if (seriesSeen.has(seriesKey)) {
      return { ok: false, error: `duplicate series ${s.series_index} for ${exercise.name}` };
    }
    seriesSeen.add(seriesKey);

    if (
      !isFiniteNumber(s.reps) ||
      !Number.isInteger(s.reps) ||
      s.reps < 1 ||
      s.reps > MAX_REPS
    ) {
      return { ok: false, error: "reps must be an integer from 1 to 1000" };
    }

    let weight_kg: number | null = null;
    if (exercise.measurement_type === "bodyweight_reps") {
      // v0 logs bodyweight as null; a number is accepted for the
      // "optional added weight later" path.
      if (s.weight_kg !== undefined && s.weight_kg !== null) {
        if (!isFiniteNumber(s.weight_kg) || s.weight_kg <= 0 || s.weight_kg > MAX_WEIGHT_KG) {
          return { ok: false, error: "weight_kg out of range" };
        }
        weight_kg = s.weight_kg;
      }
    } else {
      // weight_reps and carry require a weight.
      if (!isFiniteNumber(s.weight_kg) || s.weight_kg <= 0 || s.weight_kg > MAX_WEIGHT_KG) {
        return { ok: false, error: `${exercise.name} needs a weight between 0 and ${MAX_WEIGHT_KG}kg` };
      }
      weight_kg = s.weight_kg;
    }

    sets.push({
      exercise_id: s.exercise_id,
      series_index: s.series_index,
      weight_kg,
      reps: s.reps,
    });
  }

  return { ok: true, payload: { started_at, completed_at, note, sets } };
}
