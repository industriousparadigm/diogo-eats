import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/db";
import { requireUser } from "@/lib/user";

export const runtime = "nodejs";

const DEFAULT_DAYS = 7;
const MAX_DAYS = 90;

// Read-only Garmin daily history for the mobile Body screen's trend strip.
// Same table + same read-only contract as /api/garmin/status (a residential-
// IP cron keeps garmin_daily fresh; this only reads it) — just windowed to
// the last N days, oldest first. Accepts ?days=N, defaulting to 7.
export async function GET(req: Request) {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (resp) {
    if (resp instanceof NextResponse) return resp;
    throw resp;
  }

  const raw = new URL(req.url).searchParams.get("days");
  const n = Number(raw);
  const days = Number.isFinite(n) && n > 0 ? Math.min(Math.trunc(n), MAX_DAYS) : DEFAULT_DAYS;

  const { data, error } = await getSupabase()
    .from("garmin_daily")
    .select(
      "day, strain, recovery, resting_hr, sleep_hours, sleep_score, intensity_moderate_min, intensity_vigorous_min, intensity_load, body_battery_drained, body_battery_high, body_battery_low, steps, active_kcal, max_hr, updated_at",
    )
    .eq("user_id", userId)
    .order("day", { ascending: false })
    .limit(days);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ days: (data ?? []).reverse() });
}
