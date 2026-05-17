import { NextResponse } from "next/server";
import { exchangeCodeForTokens, fetchProfile, upsertConnection } from "@/lib/whoop";
import { syncUser } from "@/lib/whoopSync";
import { requireUser } from "@/lib/user";

export const runtime = "nodejs";

// OAuth callback. Verifies CSRF state, exchanges the code for tokens,
// stores the connection, kicks off an initial sync, then redirects the
// user back to settings with a success/error flag.
export async function GET(req: Request) {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (resp) {
    if (resp instanceof NextResponse) return resp;
    throw resp;
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error");

  const cookieState = req.headers.get("cookie")?.match(/whoop_oauth_state=([^;]+)/)?.[1];

  // Construct the public origin from request headers so redirects don't
  // bounce the user from `localhost:3000` to `0.0.0.0:3000` and lose
  // their session cookies. Same fix as /api/whoop/connect.
  const host = req.headers.get("host") ?? url.host;
  const proto =
    req.headers.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  const origin = `${proto}://${host}`;

  if (err) {
    return NextResponse.redirect(
      new URL(`/settings?whoop=denied&reason=${encodeURIComponent(err)}`, origin)
    );
  }
  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(new URL(`/settings?whoop=bad_state`, origin));
  }
  if (!state.startsWith(`${userId}.`)) {
    return NextResponse.redirect(new URL(`/settings?whoop=user_mismatch`, origin));
  }

  try {
    const redirectUri = `${origin}/api/whoop/callback`;
    const tokens = await exchangeCodeForTokens(code, redirectUri);
    await upsertConnection(userId, tokens, null);
    const profile = await fetchProfile(userId).catch(() => null);
    if (profile?.user_id) {
      await upsertConnection(userId, tokens, profile.user_id);
    }
    // Fire an initial sync so the UI has something to show immediately.
    // Fail-soft: the user can hit "refresh now" if this hiccups.
    await syncUser(userId, 14).catch((e) => console.error("initial sync:", e));
  } catch (e: any) {
    console.error("whoop callback failed:", e?.message ?? e);
    return NextResponse.redirect(
      new URL(
        `/settings?whoop=error&reason=${encodeURIComponent(e?.message ?? "unknown")}`,
        origin
      )
    );
  }

  const res = NextResponse.redirect(new URL(`/settings?whoop=connected`, origin));
  res.cookies.delete("whoop_oauth_state");
  return res;
}
