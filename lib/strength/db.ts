// Strength data access — service-role client via getSupabase(), same
// pattern as lib/db.ts. Routes do ownership checks (every query is
// user_id-scoped); RLS is defense-in-depth behind that.

import { getSupabase } from "../db";
import type { Exercise, StrengthSession, StrengthSet } from "./types";
import type { SessionPayload } from "./validate";

type SetRow = StrengthSet & { session_id: string; position: number };

const EXERCISE_COLUMNS =
  "id, name, description, measurement_type, image_key, created_by, sort_order";

export async function getExercises(): Promise<Exercise[]> {
  const { data, error } = await getSupabase()
    .from("strength_exercises")
    .select(EXERCISE_COLUMNS)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`getExercises: ${error.message}`);
  return (data as Exercise[]) ?? [];
}

// Case-insensitive name lookup across the WHOLE catalog (seeded + every
// user's), so a duplicate-name create returns the existing exercise to
// reuse rather than minting a near-dupe. ilike with no wildcards is an
// exact case-insensitive match. Returns the first hit or null.
export async function findExerciseByName(name: string): Promise<Exercise | null> {
  const { data, error } = await getSupabase()
    .from("strength_exercises")
    .select(EXERCISE_COLUMNS)
    .ilike("name", name)
    .order("sort_order", { ascending: true })
    .limit(1);
  if (error) throw new Error(`findExerciseByName: ${error.message}`);
  const rows = (data as Exercise[]) ?? [];
  return rows.length > 0 ? rows[0] : null;
}

// The highest sort_order currently in the catalog, so a new exercise can
// slot in after everything else. 0 when the catalog is somehow empty
// (never in practice — the seeded five exist).
export async function maxExerciseSortOrder(): Promise<number> {
  const { data, error } = await getSupabase()
    .from("strength_exercises")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1);
  if (error) throw new Error(`maxExerciseSortOrder: ${error.message}`);
  const rows = (data as { sort_order: number }[]) ?? [];
  return rows.length > 0 ? rows[0].sort_order : 0;
}

// Insert a user-created exercise. The route resolves a collision-free id
// and the sort_order; this is the thin write. image_key is null (no
// bundled asset — mobile renders a placeholder). Returns the full row in
// the same shape getExercises serves, so it drops straight into the
// catalog the client already holds.
export async function insertExercise(exercise: {
  id: string;
  name: string;
  description: string;
  measurement_type: Exercise["measurement_type"];
  created_by: string;
  sort_order: number;
}): Promise<Exercise> {
  const { data, error } = await getSupabase()
    .from("strength_exercises")
    .insert({
      id: exercise.id,
      name: exercise.name,
      description: exercise.description,
      measurement_type: exercise.measurement_type,
      image_key: null,
      created_by: exercise.created_by,
      sort_order: exercise.sort_order,
    })
    .select(EXERCISE_COLUMNS)
    .single();
  if (error || !data) {
    throw new Error(`insertExercise: ${error?.message ?? "no row returned"}`);
  }
  return data as Exercise;
}

// All completed sessions for the user, with sets in logged order,
// chronological ascending — the shape the engine consumes.
export async function getSessions(userId: string): Promise<StrengthSession[]> {
  const { data: sessionRows, error: sErr } = await getSupabase()
    .from("strength_sessions")
    .select("id, started_at, completed_at, note")
    .eq("user_id", userId)
    .order("completed_at", { ascending: true });
  if (sErr) throw new Error(`getSessions: ${sErr.message}`);
  const sessions = (sessionRows ?? []) as Omit<StrengthSession, "sets">[];
  if (sessions.length === 0) return [];

  const { data: setRows, error: setErr } = await getSupabase()
    .from("strength_sets")
    .select("session_id, exercise_id, series_index, weight_kg, reps, position")
    .eq("user_id", userId)
    .order("position", { ascending: true });
  if (setErr) throw new Error(`getSessions sets: ${setErr.message}`);

  const setsBySession = new Map<string, StrengthSet[]>();
  for (const row of (setRows ?? []) as SetRow[]) {
    const list = setsBySession.get(row.session_id) ?? [];
    list.push({
      exercise_id: row.exercise_id,
      series_index: row.series_index,
      weight_kg: row.weight_kg,
      reps: row.reps,
    });
    setsBySession.set(row.session_id, list);
  }

  return sessions.map((s) => ({ ...s, sets: setsBySession.get(s.id) ?? [] }));
}

// One session by id, ownership-scoped, with its sets in logged order
// (DB `position`) — the shape the engine consumes. Returns null when the
// id doesn't exist OR belongs to another user (the caller can't tell the
// difference apart, which is the right answer for an ownership miss).
export async function getSession(
  userId: string,
  sessionId: string
): Promise<StrengthSession | null> {
  const { data: sessionRow, error: sErr } = await getSupabase()
    .from("strength_sessions")
    .select("id, started_at, completed_at, note")
    .eq("user_id", userId)
    .eq("id", sessionId)
    .maybeSingle();
  if (sErr) throw new Error(`getSession: ${sErr.message}`);
  if (!sessionRow) return null;
  const session = sessionRow as Omit<StrengthSession, "sets">;

  const { data: setRows, error: setErr } = await getSupabase()
    .from("strength_sets")
    .select("exercise_id, series_index, weight_kg, reps, position")
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .order("position", { ascending: true });
  if (setErr) throw new Error(`getSession sets: ${setErr.message}`);

  const sets: StrengthSet[] = ((setRows ?? []) as Array<
    StrengthSet & { position: number }
  >).map((row) => ({
    exercise_id: row.exercise_id,
    series_index: row.series_index,
    weight_kg: row.weight_kg,
    reps: row.reps,
  }));

  return { ...session, sets };
}

// Insert a completed session + its sets. Two inserts (supabase-js has no
// client-side transactions); on a sets failure the orphan session row is
// best-effort removed so a retry can't double-log.
export async function insertSession(
  userId: string,
  payload: SessionPayload
): Promise<StrengthSession> {
  const { data: sessionRow, error: sErr } = await getSupabase()
    .from("strength_sessions")
    .insert({
      user_id: userId,
      started_at: payload.started_at,
      completed_at: payload.completed_at,
      note: payload.note,
    })
    .select("id, started_at, completed_at, note")
    .single();
  if (sErr || !sessionRow) {
    throw new Error(`insertSession: ${sErr?.message ?? "no row returned"}`);
  }
  const session = sessionRow as Omit<StrengthSession, "sets">;

  const setRows = payload.sets.map((s, i) => ({
    user_id: userId,
    session_id: session.id,
    exercise_id: s.exercise_id,
    position: i,
    series_index: s.series_index,
    weight_kg: s.weight_kg,
    reps: s.reps,
  }));
  const { error: setErr } = await getSupabase()
    .from("strength_sets")
    .insert(setRows);
  if (setErr) {
    await getSupabase()
      .from("strength_sessions")
      .delete()
      .eq("id", session.id)
      .then(() => {}, () => {});
    throw new Error(`insertSession sets: ${setErr.message}`);
  }

  return { ...session, sets: payload.sets };
}
