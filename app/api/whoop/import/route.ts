import { NextResponse } from "next/server";
import { syncUser } from "@/lib/whoopSync";
import { importWhoopActivities } from "@/lib/whoopActivityImport";
import { requireUser } from "@/lib/user";

export const runtime = "nodejs";
export const maxDuration = 60;

// "Pull from Whoop" — the Movement-tab action behind the mobile
// pullFromWhoop() call. Two steps:
//   1. Refresh whoop_workouts (syncUser, last 14d). Tolerate failure: if the
//      token expired we still import over whatever's already synced and tell
//      the UI to suggest a reconnect.
//   2. Run the import: add new source='whoop' activities + enrich same-day
//      manual rows with strain. Idempotent — a second tap adds 0 / enriches 0.
export async function POST() {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (resp) {
    if (resp instanceof NextResponse) return resp;
    throw resp;
  }

  // Refresh first, but don't let a dead/expired token block the import — we
  // still want to fold in anything already in whoop_workouts.
  const sync = await syncUser(userId, 14).catch(() => null);
  const r = await importWhoopActivities(userId);

  return NextResponse.json({
    syncStatus: sync?.status ?? "error",
    workouts_upserted: sync?.workouts_upserted ?? 0,
    added: r.added,
    enriched: r.enriched,
  });
}
