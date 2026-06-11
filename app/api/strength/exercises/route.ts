import { NextResponse } from "next/server";
import {
  findExerciseByName,
  getExercises,
  insertExercise,
  maxExerciseSortOrder,
} from "@/lib/strength/db";
import {
  nameKey,
  resolveExerciseId,
  validateCreateExercise,
} from "@/lib/strength/exercises";
import { requireUser } from "@/lib/user";

export const runtime = "nodejs";

// POST /api/strength/exercises — create a user exercise (free-growth
// catalog). Body { name, measurement_type, description? } → { exercise }.
//
// Dedupe is case-insensitive against the WHOLE catalog (seeded + every
// user's): an exact name match (collapsed whitespace, case-folded) returns
// 409 with the existing exercise so the client can offer "use that one"
// instead of minting a near-duplicate. New exercises slug their id from the
// name with a collision suffix, sort after everything else, and are stamped
// created_by = caller. They have no bundled image (image_key null); the
// flow into buildOverview/prefill is untouched — a never-done exercise
// gets the standard never_done defaults like any catalog entry.
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

  const result = validateCreateExercise(body);
  // `=== false`, not `!result.ok`: this tsconfig runs strict:false, where
  // truthiness checks don't discriminate the union (same as sessions route).
  if (result.ok === false) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  const { name, measurement_type, description } = result.input;

  // Case-insensitive dedupe. findExerciseByName matches case-insensitively
  // but not on collapsed inner whitespace, so confirm with nameKey before
  // calling it a conflict (avoids a false 409 on "leg  press" vs the hit).
  const existing = await findExerciseByName(name);
  if (existing && nameKey(existing.name) === nameKey(name)) {
    return NextResponse.json({ error: "exercise already exists", exercise: existing }, { status: 409 });
  }

  const [catalog, maxSort] = await Promise.all([
    getExercises(),
    maxExerciseSortOrder(),
  ]);
  const id = resolveExerciseId(name, catalog.map((e) => e.id));

  const exercise = await insertExercise({
    id,
    name,
    description,
    measurement_type,
    created_by: userId,
    sort_order: maxSort + 1,
  });

  return NextResponse.json({ exercise });
}
