import { NextResponse } from "next/server";
import { getAlternatives } from "@/lib/strength/alternatives";
import { getExercises, getSessions } from "@/lib/strength/db";
import { exercisesInLoggedOrder } from "@/lib/strength/engine";
import { todayYmd, tzDayBounds } from "@/lib/tz";
import { requireUser } from "@/lib/user";

export const runtime = "nodejs";
export const maxDuration = 30;

// POST /api/strength/alternatives — the "machine taken" brain. Body
// { exercise_id } → { alternatives: [{ exercise_id, reason }], suggestions:
// [{ name, measurement_type, description, reason }] }.
//
// alternatives = ranked best-first from the EXISTING catalog, excluding the
// blocked exercise and anything the user already logged TODAY. suggestions =
// 0-2 NEW exercises, only when catalog overlap is weak. One Sonnet call; no
// caching v1.
export async function POST(req: Request) {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (resp) {
    if (resp instanceof NextResponse) return resp;
    throw resp;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const exerciseId = typeof b.exercise_id === "string" ? b.exercise_id : "";
  if (!exerciseId) {
    return NextResponse.json({ error: "exercise_id required" }, { status: 400 });
  }

  const [catalog, history] = await Promise.all([
    getExercises(),
    getSessions(userId),
  ]);
  const blocked = catalog.find((e) => e.id === exerciseId);
  if (!blocked) {
    return NextResponse.json({ error: "unknown exercise" }, { status: 404 });
  }

  // Exercises already trained today (any session whose completed_at falls in
  // today's local-day window) are off the table — the user has hit that
  // movement this session. tz.ts keeps "today" on the user's calendar, not
  // the UTC server's.
  const [dayStart, dayEnd] = tzDayBounds(todayYmd());
  const todayLoggedIds = Array.from(
    new Set(
      history
        .filter((s) => s.completed_at >= dayStart && s.completed_at < dayEnd)
        .flatMap((s) => exercisesInLoggedOrder(s))
    )
  );

  try {
    const result = await getAlternatives(blocked, catalog, todayLoggedIds);
    return NextResponse.json(result);
  } catch (err) {
    console.error("strength alternatives failed", err);
    return NextResponse.json(
      { error: "couldn't fetch alternatives" },
      { status: 502 }
    );
  }
}
