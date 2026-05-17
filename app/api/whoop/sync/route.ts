import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/db";
import { syncUser } from "@/lib/whoopSync";
import { requireUser } from "@/lib/user";

export const runtime = "nodejs";
export const maxDuration = 30;

// Sync trigger. Two callers:
//   - Explicit "refresh now" tap from the integrations card.
//   - Implicit "data looks stale" auto-refresh from the home chip /
//     settings card when last_sync_at is older than STALE_MS.
//
// Whoop's rate limits are tight enough that we want to be polite.
// Server-side enforces a MIN_INTERVAL_MS floor between syncs per user
// — manual taps within the window get a friendly "synced recently"
// 200 with no-op semantics rather than a 429, so the UI doesn't flash
// red on innocent button mashing.
//
// `?force=1` bypasses the floor (used by the explicit refresh button
// when the user clearly wants fresh data and is willing to wait).
const MIN_INTERVAL_MS = 60_000; // 1 minute

export async function POST(req: Request) {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (resp) {
    if (resp instanceof NextResponse) return resp;
    throw resp;
  }

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";

  if (!force) {
    const supa = getSupabase();
    const { data } = await supa
      .from("whoop_connections")
      .select("last_sync_at")
      .eq("user_id", userId)
      .maybeSingle();
    const last = (data as { last_sync_at: number | null } | null)?.last_sync_at;
    if (last && Date.now() - last < MIN_INTERVAL_MS) {
      return NextResponse.json({
        status: "skipped",
        reason: "synced recently",
        last_sync_at: last,
        cycles_upserted: 0,
        workouts_upserted: 0,
      });
    }
  }

  const result = await syncUser(userId, 14);
  return NextResponse.json(result, { status: result.status === "ok" ? 200 : 502 });
}
