import { NextResponse } from "next/server";
import { getMealsBetween, deleteMeal } from "@/lib/db";

export const runtime = "nodejs";

function dayBoundsFromQuery(req: Request): [number, number] {
  const url = new URL(req.url);
  const dayStr = url.searchParams.get("day");
  const day = dayStr ? new Date(dayStr) : new Date();
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  return [start, start + 24 * 60 * 60 * 1000];
}

export async function GET(req: Request) {
  const [start, end] = dayBoundsFromQuery(req);
  const meals = await getMealsBetween(start, end);
  return NextResponse.json({ meals });
}

export async function DELETE(req: Request) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "no id" }, { status: 400 });
  await deleteMeal(id);
  return NextResponse.json({ ok: true });
}
