import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  const safe = path.basename(filename);
  if (!/^[a-f0-9]{16}\.(jpg|png|webp)$/.test(safe)) {
    return NextResponse.json({ error: "bad filename" }, { status: 400 });
  }
  try {
    const buf = await fs.readFile(path.join(process.cwd(), "data", "photos", safe));
    const type = safe.endsWith(".png")
      ? "image/png"
      : safe.endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";
    return new NextResponse(buf, {
      headers: { "Content-Type": type, "Cache-Control": "public, max-age=31536000" },
    });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
