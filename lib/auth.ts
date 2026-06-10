// Allowlist + auth utility helpers. Kept pure-ish so they're testable.
//
// The allowlist is intentionally an env var (comma-separated) rather
// than a DB table — Diogo is the gatekeeper, and a one-line env change
// is faster than building an admin UI for a 2-user app. Once we cross
// ~10 users this should move to a row-level allowlist table.

export function parseAllowedEmails(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedEmail(
  email: string | undefined | null,
  allowed: string[]
): boolean {
  if (!email) return false;
  return allowed.includes(email.trim().toLowerCase());
}

// Extract the token from an Authorization: Bearer header. The mobile
// client authenticates this way (no cookies in native HTTP stacks);
// the web app keeps using the SSR cookie session.
export function parseBearerToken(
  header: string | undefined | null
): string | null {
  if (!header) return null;
  const m = header.match(/^Bearer\s+(\S+)\s*$/i);
  return m ? m[1] : null;
}
