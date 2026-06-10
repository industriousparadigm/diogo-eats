import { NextResponse } from "next/server";
import { parseLabel } from "@/lib/vision";
import { insertFood } from "@/lib/db";
import { requireUser } from "@/lib/user";
import { getParseQuota, recordParseEvent } from "@/lib/quota";
import { isUsableLabel } from "@/lib/foods";
import sharp from "sharp";

export const runtime = "nodejs";
export const maxDuration = 60;

// Single-photo normalize: EXIF rotation + max 2048 + JPEG 85. Same
// settings as /api/parse, kept local so the two don't couple.
async function normalizePhoto(buf: Buffer): Promise<Buffer> {
  return sharp(buf)
    .rotate()
    .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}

// POST /api/foods/from-label — multipart photo of a nutrition label →
// Vision reads the panel into one authoritative per-100g entry →
// inserted as a 'label_verified' library food. Kills the
// photograph-the-box-forever loop: read it once, reuse deterministically.
//
// The label photo itself is NOT stored — only the transcribed numbers
// matter, and the foods library has no photo surface.
export async function POST(req: Request) {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (resp) {
    if (resp instanceof NextResponse) return resp;
    throw resp;
  }

  // A label read is a Vision call — same per-user daily quota as a parse.
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
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ error: "expected multipart/form-data" }, { status: 400 });
    }
    const file = form.getAll("photo").find((e): e is File => e instanceof File);
    if (!file) {
      return NextResponse.json({ error: "no photo" }, { status: 400 });
    }

    let buf: Buffer;
    try {
      buf = await normalizePhoto(Buffer.from(await file.arrayBuffer()));
    } catch (err) {
      console.error("label normalize failed", err);
      return NextResponse.json(
        { error: "couldn't read that image — try a different format" },
        { status: 400 }
      );
    }

    const label = await parseLabel(buf.toString("base64"), "image/jpeg");
    if (!isUsableLabel(label.per_100g, label.name)) {
      return NextResponse.json(
        { error: "couldn't read a nutrition label in that photo — try a clearer shot of the panel" },
        { status: 422 }
      );
    }

    const food = await insertFood(userId, {
      display_name: label.name,
      is_plant: label.is_plant ? 1 : 0,
      per_100g_json: JSON.stringify(label.per_100g),
      provenance: "label_verified",
    });
    await recordParseEvent(userId);

    return NextResponse.json({ food });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err.message ?? "label read failed" }, { status: 500 });
  }
}
