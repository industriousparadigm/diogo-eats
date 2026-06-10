import { NextResponse } from "next/server";
import { getMeal, insertMeal } from "@/lib/db";
import { Item, totalsFromItems } from "@/lib/vision";
import { createdAtForTz } from "@/lib/tz";
import { requireUser } from "@/lib/user";
import {
  isValidRepeatScale,
  repeatCaption,
  repeatMeal,
} from "@/lib/repeat";
import crypto from "crypto";

export const runtime = "nodejs";

// Deterministic lane — log a known meal verbatim, no Vision call.
//
// Copies the source meal's items (grams × scale, per_100g untouched),
// recomputes cached totals from those items, and lands the copy on the
// requested day. The photo is intentionally NOT copied: it documents the
// original instance, and the same filename on two rows would dangle when
// the original's row (and its storage object) is deleted. food_memory is
// NOT touched — repeating is reuse, not a new user validation.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (resp) {
    if (resp instanceof NextResponse) return resp;
    throw resp;
  }

  const { id } = await params;
  const source = await getMeal(id);
  if (!source) {
    return NextResponse.json({ error: "meal not found" }, { status: 404 });
  }
  if ((source as { user_id?: string }).user_id !== userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown = {};
  if (req.headers.get("content-length") && req.headers.get("content-length") !== "0") {
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
    }
  }

  const rawScale = (body as { scale?: unknown })?.scale;
  let scale = 1;
  if (rawScale !== undefined && rawScale !== null) {
    if (!isValidRepeatScale(rawScale)) {
      return NextResponse.json(
        { error: "scale must be a number in 0.1 to 5" },
        { status: 400 }
      );
    }
    scale = rawScale;
  }

  const rawForDate = (body as { for_date?: unknown })?.for_date;
  const forDate =
    typeof rawForDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawForDate)
      ? rawForDate
      : null;

  let sourceItems: Item[];
  try {
    const parsed = JSON.parse(source.items_json);
    sourceItems = Array.isArray(parsed) ? parsed : [];
  } catch {
    sourceItems = [];
  }
  if (sourceItems.length === 0) {
    return NextResponse.json({ error: "source meal has no items to repeat" }, { status: 400 });
  }

  const items = repeatMeal(sourceItems, scale);
  const totals = totalsFromItems(items);
  const caption = repeatCaption(source.caption, source.meal_vibe);
  const meal = {
    id: crypto.randomBytes(8).toString("hex"),
    user_id: userId,
    created_at: createdAtForTz(forDate),
    photo_filename: null,
    items_json: JSON.stringify(items),
    ...totals,
    notes: null,
    caption,
    meal_vibe: source.meal_vibe,
  };
  await insertMeal(meal);

  return NextResponse.json({ meal });
}
