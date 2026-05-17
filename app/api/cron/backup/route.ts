import { NextResponse } from "next/server";
import { put, list, del } from "@vercel/blob";
import { getSupabase } from "@/lib/db";

export const runtime = "nodejs";
// 30s should be plenty for ~hundreds of rows — adjust later if needed.
export const maxDuration = 30;

// Daily backup endpoint hit by Vercel cron (see vercel.json). Dumps
// meals + food_memory to Vercel Blob with a date-stamped filename, then
// trims any backups older than 90 days so the bucket doesn't grow
// unboundedly.
//
// Auth: Vercel cron requests include `Authorization: Bearer <CRON_SECRET>`.
// Anything else gets 401. Manual hits in dev can pass ?secret=<CRON_SECRET>
// for local testing.
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
    const { data: meals, error: mErr } = await getSupabase()
      .from("meals")
      .select("*")
      .order("created_at", { ascending: true });
    if (mErr) throw new Error(`meals fetch: ${mErr.message}`);

    const { data: memory, error: fErr } = await getSupabase()
      .from("food_memory")
      .select("*")
      .order("last_seen", { ascending: true });
    if (fErr) throw new Error(`food_memory fetch: ${fErr.message}`);

    const now = new Date();
    const iso = now
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .slice(0, 19);

    const payload = {
      schema_version: 1,
      taken_at: now.toISOString(),
      counts: { meals: meals?.length ?? 0, food_memory: memory?.length ?? 0 },
      meals: meals ?? [],
      food_memory: memory ?? [],
    };

    const filename = `eats-backups/meals-backup-${iso}.json`;
    const { url: blobUrl, pathname } = await put(filename, JSON.stringify(payload), {
      access: "public", // public URL — random suffix in path makes it un-enumerable
      contentType: "application/json",
      token: blobToken,
      addRandomSuffix: true,
    });

    // Retention: drop anything older than 90 days. Failures here are
    // non-fatal — the new backup is already written.
    let pruned = 0;
    try {
      const cutoff = Date.now() - 90 * 24 * 3600 * 1000;
      const { blobs } = await list({
        prefix: "eats-backups/",
        token: blobToken,
        limit: 200,
      });
      const stale = blobs.filter((b) => b.uploadedAt.getTime() < cutoff);
      if (stale.length > 0) {
        await del(
          stale.map((b) => b.url),
          { token: blobToken }
        );
        pruned = stale.length;
      }
    } catch (e: any) {
      console.error("backup prune failed:", e?.message ?? e);
    }

    return NextResponse.json({
      ok: true,
      pathname,
      url: blobUrl,
      counts: payload.counts,
      pruned,
    });
  } catch (err: any) {
    console.error("backup failed:", err);
    return NextResponse.json(
      { error: err?.message ?? "backup failed" },
      { status: 500 }
    );
  }
}
