import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { normalizePhoto, newPhotoFilename, singlePhotoFromForm } from "../photo";

describe("newPhotoFilename", () => {
  it("mints a 16-hex .jpg name matching the bucket's filename contract", () => {
    // The /api/photo route validates exactly /^[a-f0-9]{16}\.(jpg|png|webp)$/.
    expect(newPhotoFilename()).toMatch(/^[a-f0-9]{16}\.jpg$/);
  });

  it("never returns the same name twice (a replace must not collide with the original)", () => {
    const names = new Set(Array.from({ length: 1000 }, () => newPhotoFilename()));
    expect(names.size).toBe(1000);
  });
});

describe("singlePhotoFromForm", () => {
  // A FormData-shaped stub: only getAll("photo") is read by the helper.
  const form = (entries: unknown[]) => ({ getAll: () => entries });
  const file = (name: string) =>
    new File([new Uint8Array([1, 2, 3])], name, { type: "image/jpeg" });

  it("returns the file when one is present", () => {
    const f = file("a.jpg");
    expect(singlePhotoFromForm(form([f]))).toBe(f);
  });

  it("returns null when no file is present (route maps this to 400)", () => {
    expect(singlePhotoFromForm(form([]))).toBeNull();
    expect(singlePhotoFromForm(form(["caption text"]))).toBeNull();
  });

  it("takes the first file and ignores extras — attach is single-file (replace semantics)", () => {
    const first = file("first.jpg");
    const second = file("second.jpg");
    expect(singlePhotoFromForm(form([first, second]))).toBe(first);
  });

  it("ignores non-File entries mixed in under the same key", () => {
    const f = file("real.jpg");
    expect(singlePhotoFromForm(form(["text", f]))).toBe(f);
  });
});

describe("normalizePhoto — same recipe as /api/parse", () => {
  // Build a real oversized PNG and confirm the normalize pass downsizes it,
  // clamps the long edge to 2048, and re-encodes as JPEG (the exact recipe
  // the parse route relies on, now shared so it can't drift).
  async function bigImage(w: number, h: number): Promise<Buffer> {
    return sharp({
      create: { width: w, height: h, channels: 3, background: { r: 10, g: 80, b: 40 } },
    })
      .png()
      .toBuffer();
  }

  it("clamps the long edge to 2048 and outputs JPEG", async () => {
    const out = await normalizePhoto(await bigImage(4000, 3000));
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("jpeg");
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(2048);
    // Aspect ratio preserved (4:3 → 2048×1536).
    expect(meta.height).toBe(1536);
  });

  it("does not enlarge an already-small image", async () => {
    const out = await normalizePhoto(await bigImage(640, 480));
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(640);
    expect(meta.height).toBe(480);
    expect(meta.format).toBe("jpeg");
  });

  it("rejects non-image bytes (route maps the throw to a 400)", async () => {
    await expect(normalizePhoto(Buffer.from("not an image"))).rejects.toBeTruthy();
  });
});
