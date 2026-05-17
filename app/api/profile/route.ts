import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/db";
import { requireUser } from "@/lib/user";

export const runtime = "nodejs";

export type ProfileRow = {
  user_id: string;
  email: string;
  sex: string | null;
  age: number | null;
  weight_kg: number | null;
  notes: string | null;
  sat_fat_g: number;
  soluble_fiber_g: number;
  calories: number;
  protein_g: number;
  onboarded_at: number | null;
  created_at: number;
  updated_at: number;
};

// GET returns the signed-in user's profile (creates a stub on first
// hit if it doesn't exist, so consumers always get a row back).
// PATCH lets the user update target macros or onboarding fields.
export async function GET() {
  let userId: string;
  let email: string;
  try {
    ({ userId, email } = await requireUser());
  } catch (resp) {
    if (resp instanceof NextResponse) return resp;
    throw resp;
  }

  const supa = getSupabase();
  const { data, error } = await supa
    .from("user_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (data) {
    return NextResponse.json({ profile: data as ProfileRow });
  }

  // Auto-create a stub so the UI doesn't need a separate empty state.
  // Real onboarding (Phase 5) overwrites this with Claude-derived
  // targets + the user's raw inputs.
  const now = Date.now();
  const stub = {
    user_id: userId,
    email,
    sat_fat_g: 18,
    soluble_fiber_g: 10,
    calories: 2000,
    protein_g: 90,
    onboarded_at: null,
    created_at: now,
    updated_at: now,
  };
  const { error: insErr } = await supa.from("user_profiles").insert(stub);
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }
  return NextResponse.json({ profile: stub });
}

const TARGET_FIELDS = [
  "sat_fat_g",
  "soluble_fiber_g",
  "calories",
  "protein_g",
] as const;

const PROFILE_FIELDS = ["sex", "age", "weight_kg", "notes"] as const;

export async function PATCH(req: Request) {
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

  const patch: Record<string, unknown> = { updated_at: Date.now() };
  for (const f of TARGET_FIELDS) {
    if (typeof b[f] === "number" && Number.isFinite(b[f]) && (b[f] as number) > 0) {
      patch[f] = b[f];
    }
  }
  for (const f of PROFILE_FIELDS) {
    if (b[f] === null) {
      patch[f] = null;
    } else if (typeof b[f] === "string" || typeof b[f] === "number") {
      patch[f] = b[f];
    }
  }
  if (typeof b.onboarded_at === "number") patch.onboarded_at = b.onboarded_at;

  const supa = getSupabase();
  const { data, error } = await supa
    .from("user_profiles")
    .update(patch)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ profile: data });
}
