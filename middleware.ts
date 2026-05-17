import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Session refresh + protected-route gating.
//
// - Refreshes the Supabase session on every request (token rotation).
// - Redirects unauthenticated browsers to /login on protected UI routes.
// - Redirects authenticated-but-not-yet-onboarded users to /onboarding
//   so they can set their starter targets before logging meals.
// - API routes self-handle 401 in their handlers (more granularity
//   than a one-size response from middleware).

const PUBLIC_UI_PATHS = new Set<string>(["/login", "/auth/callback"]);
const ONBOARDING_PATH = "/onboarding";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next({ request: req });

  const supa = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookies) {
          for (const { name, value, options } of cookies) {
            req.cookies.set(name, value);
            res.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  const { data } = await supa.auth.getUser();
  const user = data?.user;
  const isAuthed = !!user;

  const path = req.nextUrl.pathname;
  const isPublicUi = PUBLIC_UI_PATHS.has(path);
  const isApi = path.startsWith("/api/");
  const isOnboarding = path === ONBOARDING_PATH;

  if (!isAuthed && !isPublicUi && !isApi) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Onboarding gate: only check for UI routes that aren't /onboarding
  // itself, /api/*, or public auth pages. One extra DB call per
  // request that we keep behind a session check.
  if (isAuthed && !isApi && !isPublicUi && !isOnboarding) {
    const { data: profile } = await supa
      .from("user_profiles")
      .select("onboarded_at")
      .eq("user_id", user!.id)
      .maybeSingle();
    if (!profile || profile.onboarded_at == null) {
      const url = req.nextUrl.clone();
      url.pathname = ONBOARDING_PATH;
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|gif|woff2|ico)$).*)",
  ],
};
