import { NextResponse } from "next/server";
import { getDailyAggregates } from "@/lib/db";
import { ownerUserId } from "@/lib/user";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const daysParam = url.searchParams.get("days");
  const days = daysParam ? Math.min(365, Math.max(7, parseInt(daysParam, 10) || 84)) : 84;
  const aggregates = await getDailyAggregates(ownerUserId(), days);
  return NextResponse.json({ aggregates });
}
