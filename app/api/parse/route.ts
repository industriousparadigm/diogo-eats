import { NextResponse } from "next/server";
import { parseMealPhoto } from "@/lib/vision";
import { insertMeal } from "@/lib/db";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

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
      typeof rawCaption === "string" && rawCaption.trim() ? rawCaption.trim().slice(0, 500) : null;

    const buf = Buffer.from(await file.arrayBuffer());
    const id = crypto.randomBytes(8).toString("hex");
    const ext =
      file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const filename = `${id}.${ext}`;
    await fs.writeFile(path.join(process.cwd(), "data", "photos", filename), buf);

    const mediaType =
      file.type === "image/png"
        ? "image/png"
        : file.type === "image/webp"
        ? "image/webp"
        : "image/jpeg";

    const parsed = await parseMealPhoto(buf.toString("base64"), mediaType, caption ?? undefined);

    const meal = {
      id,
      created_at: Date.now(),
      photo_filename: filename,
      items_json: JSON.stringify(parsed.items),
      sat_fat_g: parsed.totals.sat_fat_g,
      soluble_fiber_g: parsed.totals.soluble_fiber_g,
      calories: parsed.totals.calories,
      protein_g: parsed.totals.protein_g,
      is_plant_based: parsed.is_plant_based ? 1 : 0,
      notes: parsed.notes,
      caption,
    };
    insertMeal(meal);

    return NextResponse.json({ meal, parsed });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message ?? "parse failed" }, { status: 500 });
  }
}
