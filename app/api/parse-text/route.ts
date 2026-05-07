import { NextResponse } from "next/server";
import { parseMealText, totalsFromItems, KnownFood, RecentMeal } from "@/lib/vision";
import { insertMeal, topFoodMemory, getRecentMealsForContext } from "@/lib/db";
import crypto from "crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

async function knownFoodsFromMemory(): Promise<KnownFood[]> {
  const rows = await topFoodMemory(30);
  return rows.map((m) => ({
    name: m.display_name,
    is_plant: m.is_plant === 1,
    per_100g: JSON.parse(m.per_100g_json),
  }));
}

async function recentMealsForContext(): Promise<RecentMeal[]> {
  return getRecentMealsForContext(7, 30);
}

export async function POST(req: Request) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
    }
    const rawText = (body as { text?: unknown })?.text;
    const text =
      typeof rawText === "string" && rawText.trim() ? rawText.trim().slice(0, 1000) : "";
    if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });

    const [known, recent] = await Promise.all([
      knownFoodsFromMemory(),
      recentMealsForContext(),
    ]);
    const parsed = await parseMealText(text, known, recent);
    const totals = totalsFromItems(parsed.items);
    const id = crypto.randomBytes(8).toString("hex");

    const meal = {
      id,
      created_at: Date.now(),
      photo_filename: null,
      items_json: JSON.stringify(parsed.items),
      ...totals,
      notes: parsed.notes,
      caption: text,
      meal_vibe: parsed.meal_vibe,
    };
    await insertMeal(meal);

    return NextResponse.json({ meal });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message ?? "parse-text failed" }, { status: 500 });
  }
}
