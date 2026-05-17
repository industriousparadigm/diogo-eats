import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Session refresh + protected-route gating.
//
// - Refreshes the Supabase session on every request (token rotation).
// - Redirects unauthenticated browsers to /login on protected UI routes.
// - API routes still surface 401 themselves (more granular control over
//   what protected vs not), so middleware doesn't 401 the API surface.

const PUBLIC_PATHS = new Set<string>([
  "/login",
  "/auth/callback",
]);

const PUBLIC_API_PREFIXES = [
  "/api/auth/", // magic-link send, sign-out
  "/api/cron/", // secret-gated, doesn't use session
  "/api/admin/", // secret-gated
];

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
  const isAuthed = !!data?.user;

  const path = req.nextUrl.pathname;
  const isPublicUi = PUBLIC_PATHS.has(path);
  const isPublicApi = PUBLIC_API_PREFIXES.some((p) => path.startsWith(p));
  const isApi = path.startsWith("/api/");

  // Unauthenticated UI hit on a protected route → redirect to /login.
  if (!isAuthed && !isPublicUi && !isApi) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Public APIs and authed traffic pass through normally.
  void isPublicApi;
  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|gif|woff2|ico)$).*)",
  ],
};
