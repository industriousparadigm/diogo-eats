import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST() {
  const supa = await getSupabaseServer();
  await supa.auth.signOut();
  return NextResponse.json({ ok: true });
}
