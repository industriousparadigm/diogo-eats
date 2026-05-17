"use client";

import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client. Used by Client Components that need to
// kick off auth flows (magic-link send) or read the cached session on
// the client. All sensitive operations still go through server routes;
// this is just for auth-init niceties.
export function getSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
