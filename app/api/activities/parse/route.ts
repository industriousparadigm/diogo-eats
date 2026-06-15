import { NextResponse } from "next/server";
import { parseActivityPhoto, normalizeParsedActivity } from "@/lib/activityVision";
import { normalizePhoto } from "@/lib/photo";
import { uploadPhoto, deletePhoto } from "@/lib/storage";
import { requireUser } from "@/lib/user";
import crypto from "crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/activities/parse — read a Strava-style workout screenshot and
// return its extracted stats (the user reviews + commits via POST /activities).
// No quota gating for v1. The photo is normalized, AI-parsed, then uploaded
// only after a successful parse; a parse failure leaves nothing in the bucket.
export async function POST(req: Request) {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (resp) {
    if (resp instanceof NextResponse) return resp;
    throw resp;
  }
  void userId; // auth-gate only; the parse isn't persisted yet

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "expected multipart/form-data" },
      { status: 400 }
    );
  }

  const files = form.getAll("photo").filter((e): e is File => e instanceof File);
  const file = files[0];
  if (!file) {
    return NextResponse.json({ error: "no photo" }, { status: 400 });
  }

  let buf: Buffer;
  try {
    buf = await normalizePhoto(Buffer.from(await file.arrayBuffer()));
  } catch (err) {
    console.error("activity photo normalize failed", err);
    return NextResponse.json(
      { error: "couldn't read that image — try a different format" },
      { status: 400 }
    );
  }

  // Upload first so we can hand back the filename the client persists as
  // photo_filename; on any parse failure, clean it up before erroring.
  const id = crypto.randomBytes(8).toString("hex");
  const filename = `${id}.jpg`;
  await uploadPhoto(filename, buf, "image/jpeg");

  try {
    const raw = await parseActivityPhoto(buf.toString("base64"), "image/jpeg");
    const parsed = normalizeParsedActivity(raw);
    return NextResponse.json({ parsed, photo_filename: filename });
  } catch (err: any) {
    await deletePhoto(filename).catch(() => {});
    console.error(err);
    return NextResponse.json(
      { error: err?.message ?? "parse failed" },
      { status: 500 }
    );
  }
}
