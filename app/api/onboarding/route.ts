import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/db";
import { deriveTargets, type OnboardingInputs } from "@/lib/onboarding";
import { requireUser } from "@/lib/user";

export const runtime = "nodejs";
export const maxDuration = 30;

// Onboarding submission. Takes the user's profile inputs, asks Claude
// to compute starter targets, and writes everything to user_profiles
// (marking onboarded_at so middleware stops redirecting them here).
export async function POST(req: Request) {
  let userId: string;
  let email: string;
  try {
    ({ userId, email } = await requireUser());
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

  const inputs: OnboardingInputs = {
    sex:
      b.sex === "M" || b.sex === "F" || b.sex === "X" ? (b.sex as "M" | "F" | "X") : null,
    age:
      typeof b.age === "number" && Number.isFinite(b.age) && b.age > 0 && b.age < 120
        ? Math.round(b.age)
        : null,
    weight_kg:
      typeof b.weight_kg === "number" &&
      Number.isFinite(b.weight_kg) &&
      b.weight_kg > 20 &&
      b.weight_kg < 400
        ? b.weight_kg
        : null,
    notes:
      typeof b.notes === "string" && b.notes.trim() ? b.notes.trim().slice(0, 1000) : null,
  };

  let derived;
  try {
    derived = await deriveTargets(inputs);
  } catch (err: any) {
    console.error("deriveTargets failed:", err?.message ?? err);
    // Fall back to defaults rather than blocking onboarding.
    derived = {
      sat_fat_g: 18,
      soluble_fiber_g: 10,
      calories: 2000,
      protein_g: 90,
      rationale: "Default starter targets — review in Settings any time.",
    };
  }

  const now = Date.now();
  const supa = getSupabase();
  const row = {
    user_id: userId,
    email,
    sex: inputs.sex,
    age: inputs.age,
    weight_kg: inputs.weight_kg,
    notes: inputs.notes,
    sat_fat_g: derived.sat_fat_g,
    soluble_fiber_g: derived.soluble_fiber_g,
    calories: derived.calories,
    protein_g: derived.protein_g,
    onboarded_at: now,
    updated_at: now,
  };
  const { error } = await supa
    .from("user_profiles")
    .upsert(row, { onConflict: "user_id" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profile: row, rationale: derived.rationale });
}
