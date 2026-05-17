import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Magic-link landing. Supabase appends ?code=… (PKCE flow) or
// ?token_hash=…&type=… (legacy implicit) depending on how the email
// was generated. We try the PKCE exchange first; if there's no code,
// fall back to the token_hash verifyOtp path.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = url.searchParams.get("next") || "/";

  const supa = await getSupabaseServer();

  if (code) {
    const { error } = await supa.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        new URL(`/login?error=callback_failed`, url.origin)
      );
    }
  } else if (tokenHash && type) {
    const { error } = await supa.auth.verifyOtp({
      type: type as any,
      token_hash: tokenHash,
    });
    if (error) {
      return NextResponse.redirect(
        new URL(`/login?error=callback_failed`, url.origin)
      );
    }
  } else {
    return NextResponse.redirect(
      new URL(`/login?error=no_code`, url.origin)
    );
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
