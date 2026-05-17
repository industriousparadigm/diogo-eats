import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAllowedEmail, parseAllowedEmails } from "@/lib/auth";

export const runtime = "nodejs";

// Send a magic-link sign-in email. Allowlist-gates first so non-invited
// addresses don't drain the rate limit or create orphan auth.users
// rows. Uses the anon client + signInWithOtp because that's the
// primitive that actually sends the email; admin.generateLink only
// returns the URL without sending.
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
    // allowlist to anyone fishing for invites.
    return NextResponse.json(
      { error: "not invited — ask Diogo for access" },
      { status: 403 }
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (req.headers.get("origin") ?? "https://diogo-eats.vercel.app");

  const supa = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supa.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${siteUrl}/auth/callback`,
    },
  });
  if (error) {
    console.error("signInWithOtp failed:", error.message, error);
    // Surface the actual reason to the user (rate-limit etc.) rather
    // than hide behind a generic message — gives them a path forward.
    const friendly = error.message?.includes("rate limit")
      ? "too many sign-in attempts — wait a few minutes and try again"
      : error.message?.includes("Email")
        ? "couldn't send link — check your inbox / spam, or try again in a few minutes"
        : "couldn't send link — try again";
    return NextResponse.json(
      { error: friendly, _supabase: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, sent_to: email });
}
