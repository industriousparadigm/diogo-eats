// Phase 1 stop-gap for multi-tenant identity.
//
// Every route + helper now takes a `userId` argument so the path to
// real auth (Phase 3, session-based) is a mechanical swap. Until then,
// `ownerUserId()` resolves to Diogo's auth user — the single owner of
// all data backfilled by scripts/backfill-diogo-user.mjs.
//
// In Phase 3, server route handlers will derive the user_id from the
// Supabase SSR session (cookie) and pass it through. The constant
// below disappears at that point.

export const DIOGO_USER_ID = "47053402-614f-4a7d-bf36-54b9f3337bbe";

export function ownerUserId(): string {
  return DIOGO_USER_ID;
}
