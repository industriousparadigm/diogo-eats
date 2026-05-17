import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase session on every request, mirroring the
// reference setup from Supabase's Next.js docs. Without this, expired
// access tokens silently log users out mid-session.
//
// No route gating yet — Phase 3 adds the redirect-if-unauthenticated
// logic in tandem with RLS. For now this just keeps the session alive.
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

  // Triggers a token refresh if needed and propagates the new cookies
  // through the response.
  await supa.auth.getUser();

  return res;
}

export const config = {
  // Skip static assets + framework internals. Everything else gets the
  // session refresh.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|gif|woff2|ico)$).*)",
  ],
};
