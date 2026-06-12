import { NextResponse } from "next/server";
import {
  deleteActivity,
  getActivity,
  updateActivity,
} from "@/lib/activities-db";
import { validatePatch } from "@/lib/activities";
import { requireUser } from "@/lib/user";

export const runtime = "nodejs";

// PATCH /api/activities/[id] — edit any subset of the create fields.
// Ownership-checked: an id that doesn't exist OR belongs to another user
// returns 404 (indistinguishable, by design). Returns the updated row.
export async function PATCH(
  req: Request,
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
  const existing = await getActivity(userId, id);
  if (!existing) {
    return NextResponse.json({ error: "activity not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }

  const result = validatePatch(body);
  if (result.ok === false) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const activity = await updateActivity(userId, id, result.payload);
  return NextResponse.json({ activity });
}

// DELETE /api/activities/[id] — remove an owned activity. Ownership-
// checked the same way as PATCH.
export async function DELETE(
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
  const existing = await getActivity(userId, id);
  if (!existing) {
    return NextResponse.json({ error: "activity not found" }, { status: 404 });
  }

  await deleteActivity(userId, id);
  return NextResponse.json({ ok: true });
}
