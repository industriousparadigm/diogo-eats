import { NextResponse } from "next/server";
import { head, list } from "@vercel/blob";

export const runtime = "nodejs";

// Lists known backups (newest first) OR streams a specific one when
// ?pathname=… is supplied. Same auth as /api/cron/backup — CRON_SECRET
// via Bearer header or ?secret= query param.
//
// Private store: blob URLs aren't publicly accessible, so direct
// downloads have to go through this proxy. We fetch using the
// BLOB_READ_WRITE_TOKEN server-side and stream the body to the client.
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

  const wantPathname = url.searchParams.get("pathname");

  // Single-file download mode.
  if (wantPathname) {
    if (!wantPathname.startsWith("eats-backups/")) {
      return NextResponse.json(
        { error: "pathname must live under eats-backups/" },
        { status: 400 }
      );
    }
    try {
      const meta = await head(wantPathname, { token: blobToken });
      const resp = await fetch(meta.url, {
        headers: { Authorization: `Bearer ${blobToken}` },
      });
      if (!resp.ok) {
        return NextResponse.json(
          { error: `blob fetch failed: ${resp.status}` },
          { status: 502 }
        );
      }
      return new NextResponse(resp.body, {
        status: 200,
        headers: {
          "content-type": "application/json",
          "content-disposition": `attachment; filename="${wantPathname.split("/").pop()}"`,
          "cache-control": "no-store",
        },
      });
    } catch (err: any) {
      return NextResponse.json(
        { error: err?.message ?? "download failed" },
        { status: 500 }
      );
    }
  }

  // List mode.
  try {
    const { blobs } = await list({
      prefix: "eats-backups/",
      token: blobToken,
      limit: 200,
    });
    const items = blobs
      .map((b) => ({
        pathname: b.pathname,
        size: b.size,
        uploaded_at: b.uploadedAt,
        // Convenience: ready-to-curl URL through this same endpoint
        // (no token leak — caller still needs ?secret=).
        download_via: `/api/admin/backups?pathname=${encodeURIComponent(b.pathname)}`,
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
