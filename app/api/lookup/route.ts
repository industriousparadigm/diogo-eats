import { NextResponse } from "next/server";
import { lookupFood } from "@/lib/vision";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { name?: unknown };
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
    const result = await lookupFood(name);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message ?? "lookup failed" }, { status: 500 });
  }
}
