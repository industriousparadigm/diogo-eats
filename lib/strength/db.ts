// Strength data access — service-role client via getSupabase(), same
// pattern as lib/db.ts. Routes do ownership checks (every query is
// user_id-scoped); RLS is defense-in-depth behind that.

import { getSupabase } from "../db";
import type { Exercise, StrengthSession, StrengthSet } from "./types";
import type { SessionPayload } from "./validate";

type SetRow = StrengthSet & { session_id: string; position: number };

export async function getExercises(): Promise<Exercise[]> {
  const { data, error } = await getSupabase()
    .from("strength_exercises")
    .select("id, name, description, measurement_type, image_key, sort_order")
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`getExercises: ${error.message}`);
  return (data as Exercise[]) ?? [];
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
