import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/db";
import { signedPhotoUrl } from "@/lib/storage";
import { requireUser } from "@/lib/user";

export const runtime = "nodejs";

// Photo serving with ownership check. Returns a short-lived signed
// Supabase Storage URL only when the requesting user owns the meal
// that references this photo. Defends against URL enumeration as
// well as cross-user access if any photo filename ever leaks.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (resp) {
    if (resp instanceof NextResponse) return resp;
    throw resp;
  }

  const { filename } = await params;
  // 16-hex id + supported extension. Stops anyone hitting the route
  // with arbitrary paths into the bucket.
  if (!/^[a-f0-9]{16}\.(jpg|png|webp)$/.test(filename)) {
    return NextResponse.json({ error: "bad filename" }, { status: 400 });
  }

  // Verify the user owns a meal referencing this filename.
  const { data, error } = await getSupabase()
    .from("meals")
    .select("user_id")
    .eq("photo_filename", filename)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if ((data as { user_id?: string }).user_id !== userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const url = await signedPhotoUrl(filename, 300);
    return NextResponse.redirect(url, 302);
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "not found" }, { status: 404 });
  }
}
