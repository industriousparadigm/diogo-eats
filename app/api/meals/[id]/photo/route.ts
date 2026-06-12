import { NextResponse } from "next/server";
import { getMeal, updateMealPhotoFilename } from "@/lib/db";
import { uploadPhoto, deletePhoto } from "@/lib/storage";
import { normalizePhoto, newPhotoFilename, singlePhotoFromForm } from "@/lib/photo";
import { requireUser } from "@/lib/user";

export const runtime = "nodejs";
export const maxDuration = 30;

// Attach (or replace) a meal's photo. This is the VISUAL RECORD only —
// it never re-parses: the meal's items/numbers are left exactly as they
// were. Text-logged meals start with no photo and gain one here; photo
// meals can swap theirs.
//
// Flow mirrors /api/parse's upload discipline: normalize (EXIF rotate,
// 2048 max, JPEG 85), upload as a NEW 16-hex object, point the row at it,
// then best-effort delete the PREVIOUS object (replace semantics). The new
// filename is what makes the client's filename-keyed signed-URL cache
// refresh — never overwrite in place.
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
  const meal = await getMeal(id);
  if (!meal) return NextResponse.json({ error: "meal not found" }, { status: 404 });
  if ((meal as { user_id?: string }).user_id !== userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart/form-data" }, { status: 400 });
  }

  const file = singlePhotoFromForm(form);
  if (!file) return NextResponse.json({ error: "no photo" }, { status: 400 });

  let buf: Buffer;
  try {
    buf = await normalizePhoto(Buffer.from(await file.arrayBuffer()));
  } catch {
    return NextResponse.json(
      { error: "couldn't read that image — try a different format" },
      { status: 400 }
    );
  }

  const previous = meal.photo_filename;
  const filename = newPhotoFilename();
  try {
    await uploadPhoto(filename, buf, "image/jpeg");
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "upload failed" }, { status: 500 });
  }

  try {
    await updateMealPhotoFilename(id, filename);
  } catch (err: any) {
    // The row never took the new pointer — pull the just-uploaded object
    // back out so it doesn't orphan, then surface the failure.
    await deletePhoto(filename).catch(() => {});
    return NextResponse.json({ error: err.message ?? "update failed" }, { status: 500 });
  }

  // Replace semantics: the old object is now unreferenced. Best-effort
  // delete (same posture as deleteMeal's storage cleanup) — a lingering
  // orphan is garbage-collectable, but must never block the response or
  // undo the successful attach.
  if (previous && previous !== filename) {
    await deletePhoto(previous).catch(() => {});
  }

  const updated = await getMeal(id);
  return NextResponse.json({ meal: updated });
}

// Remove a meal's photo. Symmetric to POST: drop the storage object
// (best-effort) and null the row's pointer. Items/numbers untouched.
export async function DELETE(
  _req: Request,
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
  const meal = await getMeal(id);
  if (!meal) return NextResponse.json({ error: "meal not found" }, { status: 404 });
  if ((meal as { user_id?: string }).user_id !== userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const previous = meal.photo_filename;
  await updateMealPhotoFilename(id, null);
  if (previous) {
    await deletePhoto(previous).catch(() => {});
  }

  const updated = await getMeal(id);
  return NextResponse.json({ meal: updated });
}
