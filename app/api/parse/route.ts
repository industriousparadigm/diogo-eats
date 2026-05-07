import { NextResponse } from "next/server";
import { parseMealPhoto, totalsFromItems, KnownFood, RecentMeal } from "@/lib/vision";
import { insertMeal, topFoodMemory, getRecentMealsForContext } from "@/lib/db";
import { uploadPhoto } from "@/lib/storage";
import crypto from "crypto";
import sharp from "sharp";

export const runtime = "nodejs";
export const maxDuration = 60;

// Claude Vision caps base64 images at 5 MB. iPhone HEIC/JPG conversions
// routinely produce 8-15 MB files. We always resize + re-encode to JPEG so
// (a) the API call doesn't reject big originals, (b) stored photos stay
// reasonable. 2048px max dim is well above what Vision needs (~1568 sweet
// spot per Anthropic), so we're not losing useful detail.
async function normalizePhoto(buf: Buffer): Promise<Buffer> {
  return sharp(buf)
    .rotate() // honor EXIF orientation
    .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}

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
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json(
        { error: "expected multipart/form-data" },
        { status: 400 }
      );
    }
    const file = form.get("photo") as File | null;
    if (!file) return NextResponse.json({ error: "no photo" }, { status: 400 });

    const rawCaption = form.get("caption");
    const caption =
      typeof rawCaption === "string" && rawCaption.trim()
        ? rawCaption.trim().slice(0, 500)
        : null;

    const rawBuf = Buffer.from(await file.arrayBuffer());
    let buf: Buffer;
    try {
      buf = await normalizePhoto(rawBuf);
    } catch (err: any) {
      console.error("photo normalize failed", err);
      return NextResponse.json(
        { error: "couldn't read that image — try a different format" },
        { status: 400 }
      );
    }

    const id = crypto.randomBytes(8).toString("hex");
    const filename = `${id}.jpg`;
    await uploadPhoto(filename, buf, "image/jpeg");

    const [known, recent] = await Promise.all([
      knownFoodsFromMemory(),
      recentMealsForContext(),
    ]);
    const parsed = await parseMealPhoto(
      buf.toString("base64"),
      "image/jpeg",
      caption ?? undefined,
      known,
      recent
    );
    const totals = totalsFromItems(parsed.items);

    const meal = {
      id,
      created_at: Date.now(),
      photo_filename: filename,
      items_json: JSON.stringify(parsed.items),
      ...totals,
      notes: parsed.notes,
      caption,
      meal_vibe: parsed.meal_vibe,
    };
    await insertMeal(meal);

    return NextResponse.json({ meal });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message ?? "parse failed" }, { status: 500 });
  }
}
