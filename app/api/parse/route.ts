import { NextResponse } from "next/server";
import { parseMealPhoto, totalsFromItems, KnownFood, RecentMeal } from "@/lib/vision";
import { insertMeal, topFoodMemory, getRecentMealsForContext } from "@/lib/db";
import { uploadPhoto } from "@/lib/storage";
import crypto from "crypto";
import sharp from "sharp";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_PHOTOS = 4;
const COMPOSITE_PANEL_WIDTH = 1500; // px each input is resized to
const COMPOSITE_GAP = 8; // px between panels in the vertical strip

// Single-photo normalize: EXIF rotation + max 2048 + JPEG 85. Used both as
// a one-shot for solo uploads AND as the per-panel pre-step before
// compositing multi-photo uploads.
async function normalizePhoto(buf: Buffer, maxDim = 2048): Promise<Buffer> {
  return sharp(buf)
    .rotate()
    .resize(maxDim, maxDim, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}

// Vertically stack 2-4 photos into a single composite JPEG. Each input
// gets resized to a common width so the strip stays clean; small dark gap
// between panels makes boundaries unambiguous to Vision. Final composite
// is capped at 2048 max dim for Claude's 5MB limit.
async function compositeStrip(buffers: Buffer[]): Promise<Buffer> {
  // Step 1: resize each panel to a common width and capture its height.
  const panels = await Promise.all(
    buffers.map(async (buf) => {
      const out = await sharp(buf)
        .rotate()
        .resize({ width: COMPOSITE_PANEL_WIDTH, withoutEnlargement: false })
        .jpeg({ quality: 88 })
        .toBuffer();
      const meta = await sharp(out).metadata();
      return { buf: out, height: meta.height ?? 0 };
    })
  );

  const totalHeight =
    panels.reduce((sum, p) => sum + p.height, 0) + (panels.length - 1) * COMPOSITE_GAP;

  // Step 2: layer panels onto a black canvas at calculated y offsets.
  let y = 0;
  const overlays = panels.map((p) => {
    const top = y;
    y += p.height + COMPOSITE_GAP;
    return { input: p.buf, top, left: 0 };
  });

  const stitched = await sharp({
    create: {
      width: COMPOSITE_PANEL_WIDTH,
      height: totalHeight,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .composite(overlays)
    .jpeg({ quality: 85 })
    .toBuffer();

  // Step 3: clamp to 2048 max so we stay well inside Claude's 5MB cap.
  return normalizePhoto(stitched, 2048);
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

    // Multi-photo support: the client may send 1-4 files under the same
    // "photo" key. Single = parse as before; multi = composite first.
    const allEntries = form.getAll("photo");
    const files = allEntries.filter((e): e is File => e instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: "no photo" }, { status: 400 });
    }
    if (files.length > MAX_PHOTOS) {
      return NextResponse.json(
        { error: `up to ${MAX_PHOTOS} photos per meal` },
        { status: 400 }
      );
    }

    const rawCaption = form.get("caption");
    const caption =
      typeof rawCaption === "string" && rawCaption.trim()
        ? rawCaption.trim().slice(0, 500)
        : null;

    let buf: Buffer;
    try {
      const rawBuffers = await Promise.all(
        files.map(async (f) => Buffer.from(await f.arrayBuffer()))
      );
      buf =
        rawBuffers.length === 1
          ? await normalizePhoto(rawBuffers[0])
          : await compositeStrip(rawBuffers);
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
      recent,
      files.length > 1
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
