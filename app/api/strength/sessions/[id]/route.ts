import { NextResponse } from "next/server";
import { beatsForSession } from "@/lib/strength/engine";
import { getExercises, getSession, getSessions } from "@/lib/strength/db";
import { requireUser } from "@/lib/user";

export const runtime = "nodejs";

// GET /api/strength/sessions/[id] — one session in full + the beats it
// achieved that day. Powers the mobile session-detail screen.
//
//   { session, beats }
//
// `beats` reuses the SAME pure engine the highlights/overview use
// (computeSessionBeats via beatsForSession): a session beats the most
// recent PREVIOUS session containing each exercise. The day-1 baseline
// session has zero beats (nothing before it). Ownership: the session is
// fetched user-scoped; an id that doesn't exist OR belongs to someone
// else returns 404 (indistinguishable, by design).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (resp) {
    if (resp instanceof NextResponse) return resp;
    throw resp;
  }

  const { id } = await params;

  const [exercises, session, history] = await Promise.all([
    getExercises(),
    getSession(userId, id),
    getSessions(userId),
  ]);

  if (!session) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  const beats = beatsForSession(exercises, history, session.id);
  return NextResponse.json({ session, beats });
}
