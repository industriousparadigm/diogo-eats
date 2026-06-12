import crypto from "crypto";
import sharp from "sharp";

// Single-photo normalize: EXIF rotation + max 2048 + JPEG 85. The one
// place this recipe lives, shared by /api/parse (solo uploads + per-panel
// pre-step) and /api/meals/[id]/photo (attach/replace). "Exactly like
// parse" is guaranteed by being the same function, not a copy.
export async function normalizePhoto(buf: Buffer, maxDim = 2048): Promise<Buffer> {
  return sharp(buf)
    .rotate()
    .resize(maxDim, maxDim, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}

// A fresh 16-hex object name for the bucket. Attaching always mints a NEW
// filename (never overwrites in place) so resolvePhotoUrl's filename-keyed
// cache can never serve a stale image after a replace.
export function newPhotoFilename(): string {
  return `${crypto.randomBytes(8).toString("hex")}.jpg`;
}

// Pull the single uploaded file out of a parsed FormData under the "photo"
// key. The attach endpoint takes exactly one file (replace semantics), so
// extra files are ignored and the first is used. Returns null when there's
// no file — the route maps that to a 400. Pure over the form so the route
// logic is unit-testable without a live request.
export function singlePhotoFromForm(form: {
  getAll: (key: string) => unknown[];
}): File | null {
  const entries = form.getAll("photo");
  const files = entries.filter((e): e is File => e instanceof File);
  return files[0] ?? null;
}
