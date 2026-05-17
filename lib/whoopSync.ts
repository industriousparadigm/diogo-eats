// Daily Whoop sync. Pulls the last N days of cycles + recoveries +
// workouts for one user and upserts them into our tables. Idempotent.
//
// Called from /api/cron/whoop-sync (iterates connected users) and from
// /api/whoop/sync (one-user manual trigger, for the user's own
// "refresh now" button + initial post-OAuth populate).

import { getSupabase } from "./db";
import {
  fetchRecentCycles,
  fetchRecentRecoveries,
  fetchRecentWorkouts,
  kjToKcal,
} from "./whoop";

export type SyncResult = {
  cycles_upserted: number;
  workouts_upserted: number;
  status: "ok" | "error" | "expired";
  error?: string;
};

function ymdLocal(iso: string): string {
  // Whoop returns ISO timestamps in UTC. We bucket by the user's local
  // day; for now assume Lisbon (the only TZ we serve). When we add
  // global users, store the user's TZ on user_profiles and bucket
  // accordingly.
  const d = new Date(iso);
  // Convert to Europe/Lisbon. Cheap approach: use toLocaleString
  // formatted as YYYY-MM-DD.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return parts;
}

export async function syncUser(userId: string, daysBack = 7): Promise<SyncResult> {
  const supa = getSupabase();
  try {
    const [cycles, recoveries, workouts] = await Promise.all([
      fetchRecentCycles(userId, daysBack),
      fetchRecentRecoveries(userId, daysBack),
      fetchRecentWorkouts(userId, daysBack),
    ]);

    // Join recovery (keyed by cycle_id) onto cycle (id) for the upsert.
    const recByCycleId = new Map<number, (typeof recoveries)[number]>();
    for (const r of recoveries) recByCycleId.set(r.cycle_id, r);

    // Whoop "cycles" are sleep-wake bounded, not calendar-day bounded —
    // so multiple cycle records can bucket to the same local day. Take
    // the latest one per day (highest whoop_cycle_id wins) to avoid
    // the "ON CONFLICT DO UPDATE command cannot affect row a second
    // time" postgres error.
    const cycleByDay = new Map<string, ReturnType<typeof toCycleRow>>();
    function toCycleRow(c: (typeof cycles)[number]) {
      const rec = recByCycleId.get(c.id);
      return {
        user_id: userId,
        day: ymdLocal(c.start),
        strain: c.score?.strain ?? null,
        recovery_pct: rec?.score?.recovery_score ?? null,
        hrv_ms: rec?.score?.hrv_rmssd_milli ?? null,
        rhr_bpm: rec?.score?.resting_heart_rate ?? null,
        kcal: c.score?.kilojoule != null ? kjToKcal(c.score.kilojoule) : null,
        whoop_cycle_id: c.id,
        fetched_at: Date.now(),
      };
    }
    for (const c of cycles) {
      const row = toCycleRow(c);
      const existing = cycleByDay.get(row.day);
      if (!existing || (existing.whoop_cycle_id ?? 0) < (row.whoop_cycle_id ?? 0)) {
        cycleByDay.set(row.day, row);
      }
    }
    const cycleRows = Array.from(cycleByDay.values());

    if (cycleRows.length > 0) {
      const { error } = await supa
        .from("whoop_cycles")
        .upsert(cycleRows, { onConflict: "user_id,day" });
      if (error) throw new Error(`cycles upsert: ${error.message}`);
    }

    const workoutRows = workouts.map((w) => ({
      id: `${userId}_${w.id}`,
      user_id: userId,
      whoop_workout_id: w.id,
      started_at: new Date(w.start).getTime(),
      ended_at: new Date(w.end).getTime(),
      sport_name: w.sport_name ?? null,
      strain: w.score?.strain ?? null,
      kcal: w.score?.kilojoule != null ? kjToKcal(w.score.kilojoule) : null,
      avg_hr: w.score?.average_heart_rate ?? null,
      max_hr: w.score?.max_heart_rate ?? null,
      fetched_at: Date.now(),
    }));

    if (workoutRows.length > 0) {
      const { error } = await supa
        .from("whoop_workouts")
        .upsert(workoutRows, { onConflict: "id" });
      if (error) throw new Error(`workouts upsert: ${error.message}`);
    }

    await supa
      .from("whoop_connections")
      .update({
        last_sync_at: Date.now(),
        last_sync_status: "ok",
        last_sync_error: null,
      })
      .eq("user_id", userId);

    return {
      cycles_upserted: cycleRows.length,
      workouts_upserted: workoutRows.length,
      status: "ok",
    };
  } catch (err: any) {
    const isAuth = err?.code === "WHOOP_UNAUTH";
    await supa
      .from("whoop_connections")
      .update({
        last_sync_at: Date.now(),
        last_sync_status: isAuth ? "expired" : "error",
        last_sync_error: err?.message ?? String(err),
      })
      .eq("user_id", userId);
    return {
      cycles_upserted: 0,
      workouts_upserted: 0,
      status: isAuth ? "expired" : "error",
      error: err?.message ?? String(err),
    };
  }
}
