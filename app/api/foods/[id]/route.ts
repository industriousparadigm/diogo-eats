import { NextResponse } from "next/server";
import { getFood, updateFood, deleteFood, type FoodPatch } from "@/lib/db";
import { requireUser } from "@/lib/user";
import { isValidPer100g } from "@/lib/foods";

export const runtime = "nodejs";

// The library [id] is the per-user stable key (food_memory.name_key). It
// is opaque to the client — passed back verbatim from GET /api/foods.

// PATCH /api/foods/[id] — edit display_name / is_plant / per_100g.
// Any nutrition edit (is_plant or per_100g) sets provenance to
// 'user_corrected' — a deliberate manual edit IS the user vouching for
// these numbers, even over a prior label read (they're overriding it on
// purpose). A rename alone does not change provenance.
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
  const nameKey = decodeURIComponent(id);

  const existing = await getFood(userId, nameKey);
  if (!existing) return NextResponse.json({ error: "food not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON body" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const patch: FoodPatch = {};
  let nutritionEdited = false;

  if (b.display_name !== undefined) {
    if (typeof b.display_name !== "string" || !b.display_name.trim()) {
      return NextResponse.json({ error: "display_name must be a non-empty string" }, { status: 400 });
    }
    patch.display_name = b.display_name.trim();
  }
  if (b.is_plant !== undefined) {
    if (typeof b.is_plant !== "boolean") {
      return NextResponse.json({ error: "is_plant must be a boolean" }, { status: 400 });
    }
    patch.is_plant = b.is_plant ? 1 : 0;
    nutritionEdited = true;
  }
  if (b.per_100g !== undefined) {
    if (!isValidPer100g(b.per_100g)) {
      return NextResponse.json({ error: "invalid per_100g" }, { status: 400 });
    }
    patch.per_100g_json = JSON.stringify(b.per_100g);
    nutritionEdited = true;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }
  // A nutrition edit is a user validation → user_corrected.
  if (nutritionEdited) {
    patch.provenance = "user_corrected";
  }

  const food = await updateFood(userId, nameKey, patch);
  return NextResponse.json({ food });
}

// DELETE /api/foods/[id] — remove a food from the library.
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
  const nameKey = decodeURIComponent(id);
  const existing = await getFood(userId, nameKey);
  if (!existing) return NextResponse.json({ error: "food not found" }, { status: 404 });
  await deleteFood(userId, nameKey);
  return NextResponse.json({ ok: true });
}
