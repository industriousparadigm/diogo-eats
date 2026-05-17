// Server-side glue: fetches the user's cached Whoop data and hands it
// to the pure helpers in whoopContext. Used by parse/parse-text/talk
// to inject training context into Vision prompts.

import { getSupabase } from "./db";
import {
  buildTrainingSummary,
  trainingPromptBlock,
  type CycleRow,
  type WorkoutRow,
} from "./whoopContext";

function localYmd(ts: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ts));
}

// Returns "" when the user has no Whoop connection or no relevant data
// — callers can blindly concat without conditionals.
export async function getTrainingPromptBlock(userId: string): Promise<string> {
  const supa = getSupabase();
  const now = Date.now();
  const todayYmd = localYmd(now);
  const yesterdayYmd = localYmd(now - 24 * 3600 * 1000);

  // Two days of cycles is enough to populate today + yesterday.
  const { data: cycles } = await supa
    .from("whoop_cycles")
    .select("day, strain, recovery_pct, hrv_ms, rhr_bpm, kcal")
    .eq("user_id", userId)
    .in("day", [todayYmd, yesterdayYmd]);

  // Today's workouts only — yesterday's are interesting for trend but
  // would just add noise to a meal parse.
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { data: workouts } = await supa
    .from("whoop_workouts")
    .select("started_at, ended_at, sport_name, strain, kcal")
    .eq("user_id", userId)
    .gte("started_at", startOfDay.getTime())
    .order("started_at", { ascending: true });

  const summary = buildTrainingSummary(
    todayYmd,
    yesterdayYmd,
    (cycles ?? []) as CycleRow[],
    (workouts ?? []) as WorkoutRow[]
  );
  return trainingPromptBlock(summary);
}
