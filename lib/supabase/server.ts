import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { parseBearerToken } from "../auth";

// Server-side Supabase client bound to the request cookies. Use this in
// Route Handlers, Server Components, and Server Actions to read the
// signed-in user.
//
// Pairs with middleware.ts which refreshes tokens before the route
// runs, so by the time this client is created the cookies are fresh.
export async function getSupabaseServer() {
  const cookieStore = await cookies();
  const cookieMethods: CookieMethodsServer = {
    getAll() {
      return cookieStore.getAll();
    },
    setAll(cookies) {
      // In Server Components we can't write cookies, but route handlers
      // can. Wrap in try so RSC consumption doesn't blow up.
      try {
        for (const { name, value, options } of cookies) {
          cookieStore.set(name, value, options);
        }
      } catch {
        // RSC context — middleware handles cookie writes.
      }
    },
  };
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: cookieMethods }
  );
}

// Bearer-token path: the mobile client has no cookie jar — it sends
// its Supabase access token as `Authorization: Bearer <jwt>`. The
// token is validated against Supabase Auth (signature + expiry +
// revocation), exactly as trustworthy as the cookie session: both are
// minted by the same sign-in, behind the same ALLOWED_EMAILS gate.
async function getBearerUser() {
  const h = await headers();
  const token = parseBearerToken(h.get("authorization"));
  if (!token) return null;
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { data, error } = await supa.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

// Read the currently authenticated user. Returns null if no session.
// An explicit Bearer token wins over the ambient cookie session; web
// requests without the header skip straight to the cookie path.
export async function getCurrentUser() {
  const bearerUser = await getBearerUser();
  if (bearerUser) return bearerUser;
  const supa = await getSupabaseServer();
  const { data, error } = await supa.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}
