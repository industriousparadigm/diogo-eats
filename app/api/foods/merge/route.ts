import { NextResponse } from "next/server";
import { mergeFoods } from "@/lib/db";
import { requireUser } from "@/lib/user";

export const runtime = "nodejs";

// POST /api/foods/merge — body { keep_id, merge_ids: [] }. Folds the
// merge_ids' times_seen into keep_id, keeps keep_id's name/nutrition/
// provenance, deletes the merged rows. ids are food_memory name_keys.
// Used to clean up Vision's messy duplicate names ("oat milk" vs
// "oat milk (provamel)").
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
  const keepId = typeof b.keep_id === "string" ? b.keep_id : "";
  if (!keepId) {
    return NextResponse.json({ error: "keep_id required" }, { status: 400 });
  }
  if (
    !Array.isArray(b.merge_ids) ||
    !b.merge_ids.every((m) => typeof m === "string")
  ) {
    return NextResponse.json({ error: "merge_ids must be an array of strings" }, { status: 400 });
  }
  const mergeIds = (b.merge_ids as string[]).filter((m) => m && m !== keepId);

  try {
    const food = await mergeFoods(userId, keepId, mergeIds);
    return NextResponse.json({ food });
  } catch (err: any) {
    const msg = err?.message ?? "merge failed";
    const status = msg.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
