import { NextResponse } from "next/server";
import { getRecentMeals } from "@/lib/db";
import { requireUser } from "@/lib/user";
import { parseRecentParams, recentSinceMs, dedupeRecentMeals } from "@/lib/recent";

export const runtime = "nodejs";

// GET /api/meals/recent?days=N&limit=M — recent meals across days,
// newest-first, ONE entry per food (the same food re-logged shows once, at
// its most-recent time). Powers the mobile capture sheet's one-tap repeat row.
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
  // Fetch a wider slice than `limit` so dedup has duplicates to collapse, then
  // keep the newest occurrence of each food and cap to `limit`.
  const raw = await getRecentMeals(userId, recentSinceMs(days), Math.min(limit * 4, 200));
  const meals = dedupeRecentMeals(raw, limit);
  return NextResponse.json({ meals });
}
