import { NextResponse } from "next/server";
import {
  getMeal,
  updateMealCreatedAt,
  updateMealItems,
  upsertFoodMemory,
} from "@/lib/db";
import { Item, totalsFromItems } from "@/lib/vision";
import { isValidItem } from "@/lib/validate";

export const runtime = "nodejs";

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
    if (!isValidItem(it)) {
      return NextResponse.json({ error: "invalid item shape" }, { status: 400 });
    }
  }
  const items = itemsRaw as Item[];
  const totals = totalsFromItems(items);
  await updateMealItems(id, JSON.stringify(items), totals);

  // Optional created_at override — lets the user fix a wrong time after
  // the fact (e.g. promote an "added later" backfill to a real clock
  // time). Validated as a finite number, not in the future, not older
  // than a year. Anything else is silently ignored.
  const rawCreatedAt = (body as { created_at?: unknown })?.created_at;
  if (typeof rawCreatedAt === "number" && Number.isFinite(rawCreatedAt)) {
    const now = Date.now();
    const oneYearAgo = now - 366 * 24 * 3600 * 1000;
    if (rawCreatedAt > oneYearAgo && rawCreatedAt <= now) {
      await updateMealCreatedAt(id, Math.floor(rawCreatedAt));
    }
  }

  // Save these now-validated items to long-term food memory so future parses
  // recognize them automatically. Only items the user has reviewed/saved
  // make it here, which keeps memory high-signal.
  await upsertFoodMemory(items);

  const updated = await getMeal(id);
  return NextResponse.json({ meal: updated });
}
