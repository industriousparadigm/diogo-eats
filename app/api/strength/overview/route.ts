import { NextResponse } from "next/server";
import { buildOverview } from "@/lib/strength/engine";
import { getExercises, getSessions } from "@/lib/strength/db";
import { requireUser } from "@/lib/user";

export const runtime = "nodejs";

// The strength feature's home payload: exercise catalog, per-exercise
// last/best/prefill, picker order, session history with beats counts.
// One round-trip powers both the overview screen and session start.
export async function GET() {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (resp) {
    if (resp instanceof NextResponse) return resp;
    throw resp;
  }

  const [exercises, history] = await Promise.all([
    getExercises(),
    getSessions(userId),
  ]);
  return NextResponse.json(buildOverview(exercises, history));
}
