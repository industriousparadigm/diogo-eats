import { NextResponse } from "next/server";
import { getActivities, insertActivity } from "@/lib/activities-db";
import { clampDays, validateCreate } from "@/lib/activities";
import { requireUser } from "@/lib/user";

export const runtime = "nodejs";

// GET /api/activities?days=N — activities in the last N calendar days
// (default 30, clamped to [1,365]), newest first. The window's lower edge
// is bucketed in Europe/Lisbon via tz.ts so late-evening activities land
// on the right day.
export async function GET(req: Request) {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (resp) {
    if (resp instanceof NextResponse) return resp;
    throw resp;
  }

  const url = new URL(req.url);
  const days = clampDays(url.searchParams.get("days"));
  const activities = await getActivities(userId, days);
  return NextResponse.json({ activities });
}

// POST /api/activities — log a manual activity. started_at defaults to
// now when omitted; source is always 'manual' from this route (the
// automated feed has its own write path). Returns the persisted row.
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

  const result = validateCreate(body);
  // `=== false`, not `!result.ok`: this tsconfig runs strict:false, where
  // truthiness checks don't discriminate the union (matches strength).
  if (result.ok === false) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const activity = await insertActivity(userId, result.payload);
  return NextResponse.json({ activity });
}
