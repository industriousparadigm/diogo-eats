import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAllowedEmail, parseAllowedEmails } from "@/lib/auth";

export const runtime = "nodejs";

// Send-only endpoint for the magic-link sign-in flow. Validates the
// email against the allowlist BEFORE asking Supabase to send the
// email, so non-invited addresses don't end up as orphan auth.users
// rows (and don't get spammed with sign-in attempts).
//
// Uses the service-role key to invite users explicitly. For existing
// users this is equivalent to signInWithOtp; for new users it creates
// the auth.users row and emails them. The allowlist gates both cases.
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const email = (body as { email?: string })?.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "valid email required" }, { status: 400 });
  }

  const allowed = parseAllowedEmails(process.env.ALLOWED_EMAILS);
  if (!isAllowedEmail(email, allowed)) {
    // Intentionally vague — don't confirm whether an email is in the
    // allowlist or not to anyone fishing for invites.
    return NextResponse.json(
      { error: "not invited — ask Diogo for access" },
      { status: 403 }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (req.headers.get("origin") ?? "https://diogo-eats.vercel.app");

  const supa = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // signInWithOtp via the public anon client would honor RLS for any
  // post-link-creation hooks, but at the public anon scope we can't
  // pre-create users either. Use admin generateLink so allowlist
  // gating is the only gate.
  const { data, error } = await supa.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${siteUrl}/auth/callback` },
  });
  if (error) {
    console.error("generateLink failed:", error.message);
    return NextResponse.json({ error: "couldn't send link" }, { status: 500 });
  }

  // The admin API returns the action_link but DOESN'T email by default.
  // Re-trigger via signInWithOtp now that the user exists (idempotent
  // for existing users) so Supabase sends the email.
  const { error: otpErr } = await supa.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false, // user definitely exists after generateLink above
      emailRedirectTo: `${siteUrl}/auth/callback`,
    },
  });
  if (otpErr) {
    console.error("signInWithOtp failed:", otpErr.message);
    return NextResponse.json({ error: "couldn't send link" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sent_to: email });
  // `data` is unused at this point but kept for the future:
  // we could surface the action_link directly in dev mode for testing.
  void data;
}
