import { NextResponse } from "next/server";
import { getRecentMeals } from "@/lib/db";
import { requireUser } from "@/lib/user";
import { parseRecentParams, recentSinceMs } from "@/lib/recent";

export const runtime = "nodejs";

// GET /api/meals/recent?days=N&limit=M — recent meals across days,
// newest-first. Powers the mobile capture sheet's one-tap repeat row
// (discover known meals at logging time, not only via day browsing).
// Window + limit are clamped in lib/recent (days 1–60, limit 1–100).
export async function GET(req: Request) {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (resp) {
    if (resp instanceof NextResponse) return resp;
    throw resp;
  }
  const { days, limit } = parseRecentParams(new URL(req.url).searchParams);
  const meals = await getRecentMeals(userId, recentSinceMs(days), limit);
  return NextResponse.json({ meals });
}
