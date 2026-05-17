import { NextResponse } from "next/server";
import { syncUser } from "@/lib/whoopSync";
import { requireUser } from "@/lib/user";

export const runtime = "nodejs";
export const maxDuration = 30;

// Manual sync trigger — used by the user's "refresh now" button on the
// integrations card. Daily cron uses /api/cron/whoop-sync.
export async function POST() {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (resp) {
    if (resp instanceof NextResponse) return resp;
    throw resp;
  }
  const result = await syncUser(userId, 14);
  return NextResponse.json(result, { status: result.status === "ok" ? 200 : 502 });
}
