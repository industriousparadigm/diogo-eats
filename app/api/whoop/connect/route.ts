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

  // Reconstruct the public origin from request headers — `new URL(req.url)`
  // would give us the dev server's bind address (`0.0.0.0:3000` under
  // `next dev -H 0.0.0.0`) rather than what the browser typed. Use the
  // Host header + forwarded proto so the redirect_uri matches Whoop's
  // registered list verbatim.
  const host = req.headers.get("host") ?? new URL(req.url).host;
  const proto =
    req.headers.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  const redirectUri = `${proto}://${host}/api/whoop/callback`;
  const authorizeUrl = buildAuthorizeUrl(state, redirectUri);

  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set("whoop_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: proto === "https",
    path: "/",
    maxAge: 60 * 10, // 10 min
  });
  return res;
}
