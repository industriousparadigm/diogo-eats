import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/db";
import { requireUser } from "@/lib/user";

export const runtime = "nodejs";

// Read-only daily Garmin summary for the home chip. Garmin can't be reached
// from Vercel (datacenter IPs are blocked on login), so a residential-IP pull
// keeps garmin_daily fresh; this only reads it. Accepts ?date=YYYY-MM-DD so the
// chip works for any viewed day, defaulting to today (Lisbon).
export async function GET(req: Request) {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (resp) {
    if (resp instanceof NextResponse) return resp;
    throw resp;
  }

  const day =
    new URL(req.url).searchParams.get("date") ||
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Lisbon",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

  const { data } = await getSupabase()
    .from("garmin_daily")
    .select(
      "day, strain, recovery, resting_hr, sleep_hours, sleep_score, intensity_moderate_min, intensity_vigorous_min, intensity_load, body_battery_drained, body_battery_high, body_battery_low, steps, active_kcal, max_hr, updated_at",
    )
    .eq("user_id", userId)
    .eq("day", day)
    .maybeSingle();

  return NextResponse.json({ day, today: data ?? null });
}
