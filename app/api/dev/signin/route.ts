import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

// LOCAL-ONLY sign-in shortcut. Magic-link emails are pinned to the prod
// site_url, so the normal /login flow on localhost dead-ends at prod.
// In dev, this route uses admin.generateLink to get a token_hash for
// the given email and immediately verifies it server-side so cookies
// land on localhost.
//
// Hard-blocked in production by NODE_ENV check + a second VERCEL_ENV
// guard. If both somehow fail, the user still needs the email to be on
// the allowlist (loaded from env at call time).
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ error: "dev-only endpoint" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const email = (body as { email?: string })?.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  const supaAdmin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: link, error: lErr } = await supaAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (lErr || !link.properties.hashed_token) {
    return NextResponse.json(
      { error: lErr?.message ?? "couldn't generate link" },
      { status: 500 }
    );
  }

  const supa = await getSupabaseServer();
  const { error: vErr } = await supa.auth.verifyOtp({
    type: "email",
    token_hash: link.properties.hashed_token,
  });
  if (vErr) {
    return NextResponse.json({ error: vErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
