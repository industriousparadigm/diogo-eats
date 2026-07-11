// Activities data access — service-role client via getSupabase(), same
// pattern as lib/db.ts and lib/strength/db.ts. Routes do the auth +
// ownership checks (every query is user_id-scoped); RLS is defense-in-
// depth behind that.
//
// Pure validation lives in lib/activities.ts; this module is the thin I/O
// layer the routes call once a payload is validated.

import { getSupabase } from "./db";
import { tzDayStart, todayYmd, addDaysYmd } from "./tz";
import type { Activity, CreatePayload, PatchPayload } from "./activities";

const COLUMNS =
  "id, type, label, started_at, duration_min, effort, distance_km, note, strain, surface, elevation_m, photo_filename, source, external_id, created_at, rpe, feel, training_effect";

// Insert a manual activity (source pinned to 'manual', external_id NULL —
// only the future feed sets those). created_at defaults in the DB.
export async function insertActivity(
  userId: string,
  payload: CreatePayload
): Promise<Activity> {
  const { data, error } = await getSupabase()
    .from("activities")
    .insert({
      user_id: userId,
      type: payload.type,
      label: payload.label,
      started_at: payload.started_at,
      duration_min: payload.duration_min,
      effort: payload.effort,
      distance_km: payload.distance_km,
      note: payload.note,
      strain: payload.strain ?? null,
      surface: payload.surface ?? null,
      elevation_m: payload.elevation_m ?? null,
      photo_filename: payload.photo_filename ?? null,
      source: "manual",
    })
    .select(COLUMNS)
    .single();
  if (error || !data) {
    throw new Error(`insertActivity: ${error?.message ?? "no row returned"}`);
  }
  return data as Activity;
}

// Activities within the last `days` calendar days, newest first. The
// window's lower edge is the START of the day `days - 1` days ago in
// Lisbon (tz.ts), so "last 1 day" = today only, "last 30" = a 30-day
// span including today. Edge math goes through tz.ts so late-evening
// activities bucket on the right calendar day.
export async function getActivities(
  userId: string,
  days: number,
  now: number = Date.now()
): Promise<Activity[]> {
  const today = todayYmd(undefined, now);
  const fromYmd = addDaysYmd(today, -(days - 1));
  const fromTs = tzDayStart(fromYmd);

  const { data, error } = await getSupabase()
    .from("activities")
    .select(COLUMNS)
    .eq("user_id", userId)
    .gte("started_at", fromTs)
    .order("started_at", { ascending: false });
  if (error) throw new Error(`getActivities: ${error.message}`);
  return (data as Activity[]) ?? [];
}

// One activity by id, ownership-scoped. Returns null when the id doesn't
// exist OR belongs to another user (indistinguishable, by design — the
// caller turns null into a 404 either way).
export async function getActivity(
  userId: string,
  id: string
): Promise<Activity | null> {
  const { data, error } = await getSupabase()
    .from("activities")
    .select(COLUMNS)
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getActivity: ${error.message}`);
  return (data as Activity | null) ?? null;
}

// Apply a validated partial patch to an owned row. The caller has already
// confirmed ownership via getActivity; the user_id filter here is a second
// guard so a concurrent ownership change can't let the update land on
// someone else's row. Returns the updated row.
export async function updateActivity(
  userId: string,
  id: string,
  patch: PatchPayload
): Promise<Activity> {
  const { data, error } = await getSupabase()
    .from("activities")
    .update(patch)
    .eq("user_id", userId)
    .eq("id", id)
    .select(COLUMNS)
    .single();
  if (error || !data) {
    throw new Error(`updateActivity: ${error?.message ?? "no row returned"}`);
  }
  return data as Activity;
}

// Delete an owned row. Ownership re-checked via the user_id filter.
export async function deleteActivity(userId: string, id: string): Promise<void> {
  const { error } = await getSupabase()
    .from("activities")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw new Error(`deleteActivity: ${error.message}`);
}
