import { NextResponse } from "next/server";
import { getCurrentUser } from "./supabase/server";

// Identity helpers for server routes.
//
// Phase 3 onward: every protected route resolves the current user from
// the Supabase SSR session cookie. The old DIOGO_USER_ID stop-gap is
// retained only so legacy callers (one-off scripts, the cron route's
// service-role context) can still address Diogo when no session
// exists. UI routes that need a user MUST call `requireUser()` and
// get a proper 401 / redirect when there's no session.

export const DIOGO_USER_ID = "47053402-614f-4a7d-bf36-54b9f3337bbe";

// Returns Diogo's user_id unconditionally. Use ONLY for service-role
// scripts that legitimately operate as the historical sole owner
// (backfills, ad-hoc maintenance).
export function ownerUserId(): string {
  return DIOGO_USER_ID;
}

// Returns the signed-in user's id, or null if no session.
export async function getSessionUserId(): Promise<string | null> {
  const user = await getCurrentUser();
  return user?.id ?? null;
}

// Route-handler guard. Returns { userId, email } when authenticated.
// Otherwise throws a NextResponse 401 that the route can re-raise.
export async function requireUser(): Promise<{
  userId: string;
  email: string;
}> {
  const user = await getCurrentUser();
  if (!user) {
    throw NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return { userId: user.id, email: user.email ?? "" };
}

// Convenience wrapper for route bodies: try the work, surface the
// thrown 401 cleanly.
//
//   export const GET = withUser(async ({ userId }) => { ... })
export function withUser<T>(
  handler: (auth: { userId: string; email: string }) => Promise<T | NextResponse>
): () => Promise<T | NextResponse> {
  return async () => {
    try {
      const auth = await requireUser();
      return await handler(auth);
    } catch (err) {
      if (err instanceof NextResponse) return err;
      throw err;
    }
  };
}
