import { NextResponse } from "next/server";
import { getMeal, getMealsBetween, deleteMeal } from "@/lib/db";
import { requireUser } from "@/lib/user";

export const runtime = "nodejs";

function dayBoundsFromQuery(req: Request): [number, number] {
  const url = new URL(req.url);
  const dayStr = url.searchParams.get("day");
  const day = dayStr ? new Date(dayStr) : new Date();
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  return [start, start + 24 * 60 * 60 * 1000];
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
