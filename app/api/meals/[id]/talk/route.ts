import { NextResponse } from "next/server";
import { getMeal, topFoodMemory, getRecentMealsForContext } from "@/lib/db";
import { editMealItems, Item, KnownFood, RecentMeal } from "@/lib/vision";

export const runtime = "nodejs";
export const maxDuration = 30;

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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const meal = await getMeal(id);
    if (!meal) return NextResponse.json({ error: "meal not found" }, { status: 404 });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
    }
    const rawMsg = (body as { message?: unknown })?.message;
    const message =
      typeof rawMsg === "string" && rawMsg.trim() ? rawMsg.trim().slice(0, 500) : "";
    if (!message) return NextResponse.json({ error: "message required" }, { status: 400 });

    let currentItems: Item[];
    try {
      currentItems = JSON.parse(meal.items_json) as Item[];
    } catch {
      return NextResponse.json({ error: "meal items not editable" }, { status: 400 });
    }
    if (!Array.isArray(currentItems) || currentItems.length === 0) {
      return NextResponse.json({ error: "meal has no items" }, { status: 400 });
    }
    if (!currentItems[0]?.per_100g) {
      return NextResponse.json(
        { error: "this meal predates per-item nutrition; delete and re-log" },
        { status: 400 }
      );
    }

    const [known, recent] = await Promise.all([
      knownFoodsFromMemory(),
      recentMealsForContext(),
    ]);
    const items = await editMealItems(currentItems, message, known, recent);
    return NextResponse.json({ items });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message ?? "talk failed" }, { status: 500 });
  }
}
