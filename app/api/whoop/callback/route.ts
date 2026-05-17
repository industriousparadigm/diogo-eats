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

  if (err) {
    return NextResponse.redirect(
      new URL(`/settings?whoop=denied&reason=${encodeURIComponent(err)}`, url.origin)
    );
  }
  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(new URL(`/settings?whoop=bad_state`, url.origin));
  }
  // CSRF cookie also binds the user prefix.
  if (!state.startsWith(`${userId}.`)) {
    return NextResponse.redirect(new URL(`/settings?whoop=user_mismatch`, url.origin));
  }

  try {
    const redirectUri = `${url.origin}/api/whoop/callback`;
    const tokens = await exchangeCodeForTokens(code, redirectUri);
    // Stash the connection FIRST so getAccessTokenForUser works for the
    // profile fetch below.
    await upsertConnection(userId, tokens, null);
    const profile = await fetchProfile(userId).catch(() => null);
    if (profile?.user_id) {
      // Re-upsert with the whoop_user_id now that we have it.
      await upsertConnection(userId, tokens, profile.user_id);
    }
    // Fire an initial sync so the UI has something to show immediately.
    // Fail-soft: the cron will catch up if this hiccups.
    await syncUser(userId, 14).catch((e) => console.error("initial sync:", e));
  } catch (e: any) {
    console.error("whoop callback failed:", e?.message ?? e);
    return NextResponse.redirect(
      new URL(`/settings?whoop=error&reason=${encodeURIComponent(e?.message ?? "unknown")}`, url.origin)
    );
  }

  const res = NextResponse.redirect(new URL(`/settings?whoop=connected`, url.origin));
  res.cookies.delete("whoop_oauth_state");
  return res;
}
