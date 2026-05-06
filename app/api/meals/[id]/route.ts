import { NextResponse } from "next/server";
import { getMeal, updateMealItems, upsertFoodMemory } from "@/lib/db";
import { Item, totalsFromItems } from "@/lib/vision";

export const runtime = "nodejs";

function isItem(x: unknown): x is Item {
  if (!x || typeof x !== "object") return false;
  const i = x as Record<string, unknown>;
  if (typeof i.name !== "string" || !i.name.trim()) return false;
  if (typeof i.grams !== "number" || !isFinite(i.grams) || i.grams < 0 || i.grams > 5000) return false;
  if (i.confidence !== "low" && i.confidence !== "medium" && i.confidence !== "high") return false;
  if (typeof i.is_plant !== "boolean") return false;
  const p = i.per_100g as Record<string, unknown> | undefined;
  if (!p || typeof p !== "object") return false;
  for (const key of ["sat_fat_g", "soluble_fiber_g", "calories", "protein_g"] as const) {
    if (typeof p[key] !== "number" || !isFinite(p[key] as number)) return false;
    if ((p[key] as number) < 0 || (p[key] as number) > 1000) return false;
  }
  return true;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const meal = await getMeal(id);
  if (!meal) return NextResponse.json({ error: "meal not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  const itemsRaw = (body as { items?: unknown })?.items;
  if (!Array.isArray(itemsRaw)) {
    return NextResponse.json({ error: "items must be an array" }, { status: 400 });
  }
  if (itemsRaw.length === 0) {
    return NextResponse.json({ error: "at least one item required" }, { status: 400 });
  }
  if (itemsRaw.length > 30) {
    return NextResponse.json({ error: "too many items" }, { status: 400 });
  }
  for (const it of itemsRaw) {
    if (!isItem(it)) {
      return NextResponse.json({ error: "invalid item shape" }, { status: 400 });
    }
  }
  const items = itemsRaw as Item[];
  const totals = totalsFromItems(items);
  await updateMealItems(id, JSON.stringify(items), totals);

  // Save these now-validated items to long-term food memory so future parses
  // recognize them automatically. Only items the user has reviewed/saved
  // make it here, which keeps memory high-signal.
  await upsertFoodMemory(items);

  const updated = await getMeal(id);
  return NextResponse.json({ meal: updated });
}
