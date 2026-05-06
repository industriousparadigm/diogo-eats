import { NextResponse } from "next/server";
import { signedPhotoUrl } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  // Same regex guard as the on-disk version: 16-hex id + supported extension.
  // Stops anyone hitting the route with arbitrary paths into the bucket.
  if (!/^[a-f0-9]{16}\.(jpg|png|webp)$/.test(filename)) {
    return NextResponse.json({ error: "bad filename" }, { status: 400 });
  }
  try {
    const url = await signedPhotoUrl(filename, 300);
    // 302 redirect — the client follows to the short-lived signed URL.
    return NextResponse.redirect(url, 302);
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "not found" }, { status: 404 });
  }
}
