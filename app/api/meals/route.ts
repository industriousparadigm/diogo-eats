import { NextResponse } from "next/server";
import { getMeal, getMealsBetween, deleteMeal } from "@/lib/db";
import { requireUser } from "@/lib/user";
import { todayYmd, tzDayBounds } from "@/lib/tz";

export const runtime = "nodejs";

// Day bounds in the app timezone. The old server-local Date math ran in
// UTC on Vercel, so a 00:30-Lisbon meal showed under the previous day.
function dayBoundsFromQuery(req: Request): [number, number] {
  const url = new URL(req.url);
  const dayStr = url.searchParams.get("day");
  const ymd =
    dayStr && /^\d{4}-\d{2}-\d{2}$/.test(dayStr) ? dayStr : todayYmd();
  return tzDayBounds(ymd);
}

export async function GET(req: Request) {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (resp) {
    if (resp instanceof NextResponse) return resp;
    throw resp;
  }
  const [start, end] = dayBoundsFromQuery(req);
  const meals = await getMealsBetween(userId, start, end);
  return NextResponse.json({ meals });
}

export async function DELETE(req: Request) {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (resp) {
    if (resp instanceof NextResponse) return resp;
    throw resp;
  }
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "no id" }, { status: 400 });
  // Verify ownership before delete — service-role bypasses RLS.
  const meal = await getMeal(id);
  if (!meal) return NextResponse.json({ error: "not found" }, { status: 404 });
  if ((meal as { user_id?: string }).user_id !== userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  await deleteMeal(id);
  return NextResponse.json({ ok: true });
}
