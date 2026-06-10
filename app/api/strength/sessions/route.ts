import { NextResponse } from "next/server";
import { generateHighlights } from "@/lib/strength/highlights";
import { getExercises, getSessions, insertSession } from "@/lib/strength/db";
import { validateSessionPayload } from "@/lib/strength/validate";
import { requireUser } from "@/lib/user";

export const runtime = "nodejs";

// GET: full session log (with sets), newest first. The round-trip
// surface for any future web UI and for verification.
export async function GET(req: Request) {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (resp) {
    if (resp instanceof NextResponse) return resp;
    throw resp;
  }

  const url = new URL(req.url);
  const rawLimit = Number(url.searchParams.get("limit"));
  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 500) : 100;

  const sessions = await getSessions(userId); // ascending
  return NextResponse.json({ sessions: sessions.reverse().slice(0, limit) });
}

// POST: complete a session. The mobile app keeps the in-progress draft
// locally (gym networks are flaky; logging must never need the server)
// and submits the whole session here in one shot. Returns the persisted
// session plus the highlights payload — the client renders it verbatim
// and never recomputes the arithmetic.
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

  const exercises = await getExercises();
  const result = validateSessionPayload(body, exercises);
  // `=== false`, not `!result.ok`: this tsconfig runs strict:false, where
  // truthiness checks don't discriminate the ValidationResult union.
  if (result.ok === false) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // History BEFORE this session is what highlights compare against.
  const history = await getSessions(userId);
  const session = await insertSession(userId, result.payload);
  const highlights = generateHighlights(exercises, history, session);

  return NextResponse.json({ session, highlights });
}
