import { NextResponse } from "next/server";
import { list } from "@vercel/blob";

export const runtime = "nodejs";

// Lists known backups (newest first). Same auth as /api/cron/backup —
// CRON_SECRET via Bearer header or ?secret= query param.
//
// Each item includes a public download URL (the random suffix in the
// pathname keeps the URL un-enumerable without listing here first).
export async function GET(req: Request) {
  const headerAuth = req.headers.get("authorization") || "";
  const url = new URL(req.url);
  const queryToken = url.searchParams.get("secret") || "";
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const headerToken = headerAuth.replace(/^Bearer\s+/i, "");
  if (headerToken !== expected && queryToken !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!blobToken) {
    return NextResponse.json(
      { error: "BLOB_READ_WRITE_TOKEN not configured" },
      { status: 500 }
    );
  }

  try {
    const { blobs } = await list({
      prefix: "eats-backups/",
      token: blobToken,
      limit: 200,
    });
    const items = blobs
      .map((b) => ({
        pathname: b.pathname,
        url: b.url,
        size: b.size,
        uploaded_at: b.uploadedAt,
      }))
      .sort((a, b) => b.uploaded_at.getTime() - a.uploaded_at.getTime());
    return NextResponse.json({ count: items.length, items });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "list failed" },
      { status: 500 }
    );
  }
}
