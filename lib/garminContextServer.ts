// Server-side glue: fetches the user's Garmin daily rollup + today's activities
// and hands them to the pure helpers in garminContext. Used by parse/parse-text
// to inject training context into Vision meal prompts. Replaces whoopContextServer.

import { getSupabase } from "./db";
import { todayYmd, addDaysYmd, tzDayBounds } from "./tz";
import {
  buildTrainingSummary,
  trainingPromptBlock,
  type GarminDailyRow,
  type GarminActivityRow,
} from "./garminContext";

// Returns "" when there's no Garmin data — callers can blindly concat.
export async function getTrainingPromptBlock(userId: string): Promise<string> {
  const supa = getSupabase();
  const today = todayYmd();
  const yesterday = addDaysYmd(today, -1);

  const { data: daily } = await supa
    .from("garmin_daily")
    .select("day, strain, recovery, active_kcal")
    .eq("user_id", userId)
    .in("day", [today, yesterday]);

  // Today's activities (any source), bounded to the Lisbon calendar day.
  const [startMs, endMs] = tzDayBounds(today);
  const { data: activities } = await supa
    .from("activities")
    .select("type, label, duration_min, strain, distance_km")
    .eq("user_id", userId)
    .gte("started_at", startMs)
    .lt("started_at", endMs)
    .order("started_at", { ascending: true });

  const summary = buildTrainingSummary(
    today,
    yesterday,
    (daily ?? []) as GarminDailyRow[],
    (activities ?? []) as GarminActivityRow[]
  );
  return trainingPromptBlock(summary);
}
