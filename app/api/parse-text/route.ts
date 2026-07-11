import { NextResponse } from "next/server";
import { parseMealText, totalsFromItems, KnownFood, RecentMeal } from "@/lib/vision";
import { insertMeal, topFoodMemory, getRecentMealsForContext } from "@/lib/db";
import { createdAtForTz } from "@/lib/tz";
import { requireUser } from "@/lib/user";
import { getParseQuota, recordParseEvent } from "@/lib/quota";
import { getTrainingPromptBlock } from "@/lib/garminContextServer";
import crypto from "crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

async function knownFoodsFromMemory(userId: string): Promise<KnownFood[]> {
  const rows = await topFoodMemory(userId, 30);
  return rows.map((m) => ({
    name: m.display_name,
    is_plant: m.is_plant === 1,
    per_100g: JSON.parse(m.per_100g_json),
  }));
}

async function recentMealsForContext(userId: string): Promise<RecentMeal[]> {
  return getRecentMealsForContext(userId, 7, 30);
}

export async function POST(req: Request) {
  let userId: string;
  try {
    const auth = await requireUser();
    userId = auth.userId;
  } catch (resp) {
    if (resp instanceof NextResponse) return resp;
    throw resp;
  }

  const quota = await getParseQuota(userId);
  if (!quota.ok) {
    return NextResponse.json(
      {
        error: `today's parse limit reached (${quota.limit}). resets at local midnight.`,
        quota,
      },
      { status: 429 }
    );
  }

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

    const rawForDate = (body as { for_date?: unknown })?.for_date;
    const forDate =
      typeof rawForDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawForDate)
        ? rawForDate
        : null;

    const [known, recent, trainingBlock] = await Promise.all([
      knownFoodsFromMemory(userId),
      recentMealsForContext(userId),
      getTrainingPromptBlock(userId).catch(() => ""),
    ]);
    const parsed = await parseMealText(text, known, recent, trainingBlock || undefined);
    const totals = totalsFromItems(parsed.items);
    const id = crypto.randomBytes(8).toString("hex");

    const meal = {
      id,
      user_id: userId,
      created_at: createdAtForTz(forDate),
      photo_filename: null,
      items_json: JSON.stringify(parsed.items),
      ...totals,
      notes: parsed.notes,
      caption: text,
      meal_vibe: parsed.meal_vibe,
    };
    await insertMeal(meal);
    // Awaited: a fire-and-forget insert can be dropped when the
    // serverless instance freezes after the response flushes.
    await recordParseEvent(userId);

    return NextResponse.json({ meal });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message ?? "parse-text failed" }, { status: 500 });
  }
}
