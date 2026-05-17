import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import { cookies } from "next/headers";

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

// Read the currently authenticated user. Returns null if no session.
// Thin wrapper so callers don't need to drill into auth.getUser().
export async function getCurrentUser() {
  const supa = await getSupabaseServer();
  const { data, error } = await supa.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}
