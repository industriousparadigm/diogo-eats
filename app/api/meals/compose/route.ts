import { NextResponse } from "next/server";
import { insertMeal, getFoodsByKeys, bumpFoodsSeen } from "@/lib/db";
import { totalsFromItems } from "@/lib/vision";
import { composeItems, composeVibe, type ResolvedFood } from "@/lib/compose";
import { createdAtForTz } from "@/lib/tz";
import { requireUser } from "@/lib/user";
import crypto from "crypto";

export const runtime = "nodejs";

const MAX_LINES = 30;

// Deterministic lane — build a meal from known library foods, zero AI.
// Body: { items: [{ food_id, grams }], for_date?, caption? }.
// Each food_id is a library name_key. Items are built from the library
// entry verbatim (confidence "high" — these are user-validated numbers),
// totals via totalsFromItems, meal_vibe rule-based (no LLM), notes null,
// photo null. times_seen is bumped on every food actually used.
export async function POST(req: Request) {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (resp) {
    if (resp instanceof NextResponse) return resp;
    throw resp;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  const rawItems = b.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return NextResponse.json({ error: "items must be a non-empty array" }, { status: 400 });
  }
  if (rawItems.length > MAX_LINES) {
    return NextResponse.json({ error: "too many items" }, { status: 400 });
  }

  const lines: { food_id: string; grams: number }[] = [];
  for (const it of rawItems) {
    const foodId = (it as { food_id?: unknown })?.food_id;
    const grams = (it as { grams?: unknown })?.grams;
    if (typeof foodId !== "string" || !foodId.trim()) {
      return NextResponse.json({ error: "each item needs a food_id" }, { status: 400 });
    }
    if (typeof grams !== "number" || !Number.isFinite(grams) || grams <= 0 || grams > 5000) {
      return NextResponse.json({ error: "grams must be a number in 0–5000" }, { status: 400 });
    }
    lines.push({ food_id: foodId, grams });
  }

  // Resolve every food_id against the user's library. Any unknown id is a
  // 400 — the composer only builds from known foods.
  const foodMap = await getFoodsByKeys(userId, lines.map((l) => l.food_id));
  const resolved = new Map<string, ResolvedFood>();
  for (const line of lines) {
    const row = foodMap.get(line.food_id);
    if (!row) {
      return NextResponse.json(
        { error: `unknown food: ${line.food_id}` },
        { status: 400 }
      );
    }
    if (!resolved.has(line.food_id)) {
      let per100g;
      try {
        per100g = JSON.parse(row.per_100g_json);
      } catch {
        return NextResponse.json(
          { error: `corrupt nutrition for food: ${line.food_id}` },
          { status: 422 }
        );
      }
      resolved.set(line.food_id, {
        food_id: row.name_key,
        name: row.display_name,
        is_plant: row.is_plant === 1,
        per_100g: per100g,
      });
    }
  }

  const items = composeItems(lines, resolved);
  const totals = totalsFromItems(items);
  const vibe = composeVibe(items);

  const rawForDate = b.for_date;
  const forDate =
    typeof rawForDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawForDate)
      ? rawForDate
      : null;
  const rawCaption = b.caption;
  const caption =
    typeof rawCaption === "string" && rawCaption.trim()
      ? rawCaption.trim().slice(0, 500)
      : null;

  const meal = {
    id: crypto.randomBytes(8).toString("hex"),
    user_id: userId,
    created_at: createdAtForTz(forDate),
    photo_filename: null,
    items_json: JSON.stringify(items),
    ...totals,
    notes: null,
    caption,
    meal_vibe: vibe,
  };
  await insertMeal(meal);

  // Real usage signal: every distinct food used gets a times_seen bump.
  // Awaited so the serverless instance doesn't freeze before it lands.
  await bumpFoodsSeen(userId, Array.from(resolved.keys()));

  return NextResponse.json({ meal });
}
