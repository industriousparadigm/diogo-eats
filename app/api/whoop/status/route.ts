import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/db";
import { getConnectionStatus } from "@/lib/whoop";
import { requireUser } from "@/lib/user";

export const runtime = "nodejs";

// Read-only summary for the settings card + the home chip.
// Returns connection state + today's cycle if available.
export async function GET() {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (resp) {
    if (resp instanceof NextResponse) return resp;
    throw resp;
  }

  const status = await getConnectionStatus(userId);
  if (!status.connected) {
    return NextResponse.json({ connected: false });
  }

  // Today's row from whoop_cycles (if synced).
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const supa = getSupabase();
  const { data: today } = await supa
    .from("whoop_cycles")
    .select("strain, recovery_pct, hrv_ms, rhr_bpm, kcal")
    .eq("user_id", userId)
    .eq("day", day)
    .maybeSingle();

  // Today's workouts.
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { data: workouts } = await supa
    .from("whoop_workouts")
    .select("id, sport_name, started_at, ended_at, strain, kcal")
    .eq("user_id", userId)
    .gte("started_at", startOfDay.getTime())
    .order("started_at", { ascending: true });

  return NextResponse.json({
    connected: true,
    last_sync_at: status.lastSyncAt,
    last_sync_status: status.status,
    today: today ?? null,
    today_workouts: workouts ?? [],
  });
}
