import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/db";
import { syncUser } from "@/lib/whoopSync";

export const runtime = "nodejs";
export const maxDuration = 60;

// Daily Vercel cron. Iterates every connected user, syncs their last
// 7 days of cycles + workouts. Secured by CRON_SECRET (same env var
// the backup cron uses; one secret for all cron endpoints).
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

  const supa = getSupabase();
  const { data: connections, error } = await supa
    .from("whoop_connections")
    .select("user_id");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Record<string, unknown>[] = [];
  for (const c of connections ?? []) {
    const r = await syncUser((c as { user_id: string }).user_id, 7);
    results.push({ user_id: (c as { user_id: string }).user_id, ...r });
  }
  return NextResponse.json({ ok: true, users: results.length, results });
}
