import { NextResponse } from "next/server";
import { buildAuthorizeUrl } from "@/lib/whoop";
import { requireUser } from "@/lib/user";

export const runtime = "nodejs";

// Kick the OAuth dance. Auth-required so we know which app user this
// will eventually belong to. Sets a short-lived `whoop_oauth_state`
// cookie that the callback verifies against the `?state=` param to
// defeat CSRF.
export async function GET(req: Request) {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (resp) {
    if (resp instanceof NextResponse) return resp;
    throw resp;
  }

  // 16-byte random hex; bound to user via cookie so a fishing redirect
  // can't connect a different Whoop account to this user.
  const state = `${userId}.${crypto.randomUUID().replace(/-/g, "")}`;

  const url = new URL(req.url);
  const redirectUri = `${url.origin}/api/whoop/callback`;
  const authorizeUrl = buildAuthorizeUrl(state, redirectUri);

  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set("whoop_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: url.protocol === "https:",
    path: "/",
    maxAge: 60 * 10, // 10 min
  });
  return res;
}
