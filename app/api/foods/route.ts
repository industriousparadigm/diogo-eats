import { NextResponse } from "next/server";
import { searchFoods, insertFood } from "@/lib/db";
import { requireUser } from "@/lib/user";
import { isValidPer100g } from "@/lib/foods";

export const runtime = "nodejs";

// GET /api/foods?q=oats&limit=50&offset=0 — search the user's foods
// library by display name (case-insensitive substring), ordered by
// times_seen desc. Empty q returns the most-seen foods.
export async function GET(req: Request) {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (resp) {
    if (resp instanceof NextResponse) return resp;
    throw resp;
  }
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const limit = clampInt(url.searchParams.get("limit"), 50, 1, 100);
  const offset = clampInt(url.searchParams.get("offset"), 0, 0, 100000);
  const foods = await searchFoods(userId, q, limit, offset);
  return NextResponse.json({ foods });
}

// POST /api/foods — manual add. Body { display_name, is_plant, per_100g,
// portion_presets? }. provenance is forced to 'user_corrected' (a manual
// add is a user assertion). Upserts on (user_id, name_key).
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
  const displayName = typeof b.display_name === "string" ? b.display_name.trim() : "";
  if (!displayName) {
    return NextResponse.json({ error: "display_name required" }, { status: 400 });
  }
  if (typeof b.is_plant !== "boolean") {
    return NextResponse.json({ error: "is_plant must be a boolean" }, { status: 400 });
  }
  if (!isValidPer100g(b.per_100g)) {
    return NextResponse.json({ error: "invalid per_100g" }, { status: 400 });
  }

  const food = await insertFood(userId, {
    display_name: displayName,
    is_plant: b.is_plant ? 1 : 0,
    per_100g_json: JSON.stringify(b.per_100g),
    provenance: "user_corrected",
  });
  return NextResponse.json({ food });
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = raw == null ? NaN : parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
