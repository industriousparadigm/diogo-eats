// Whoop API client + token lifecycle helpers.
//
// Scope kept tight: the route handlers + sync cron call into here for
// "give me a fresh access token" or "fetch this user's last 7 days of
// cycles/workouts". Token refresh + persistence is internal.
//
// Reference: https://developer.whoop.com/api/

import { getSupabase } from "./db";

const WHOOP_AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
const WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
const WHOOP_API_BASE = "https://api.prod.whoop.com/developer/v2";

// Scopes requested at OAuth init. Keep these minimal — only what we
// actually use. `offline` is required for refresh-token issuance.
export const WHOOP_SCOPES = [
  "read:profile",
  "read:cycles",
  "read:recovery",
  "read:workout",
  "read:sleep",
  "offline",
];

export type WhoopTokenPayload = {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
  token_type: string;
  scope: string;
};

export type WhoopConnection = {
  user_id: string;
  refresh_token: string;
  access_token: string | null;
  access_token_expires_at: number | null;
  scopes: string[];
  whoop_user_id: number | null;
  last_sync_at: number | null;
  last_sync_status: string | null;
};

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env: ${name}`);
  return v;
}

// Build the URL the user is redirected to when they hit "Connect Whoop".
// state is a CSRF-defense nonce we'll persist in a short-lived cookie
// during the redirect and verify on callback.
export function buildAuthorizeUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: envOrThrow("WHOOP_CLIENT_ID"),
    response_type: "code",
    redirect_uri: redirectUri,
    scope: WHOOP_SCOPES.join(" "),
    state,
  });
  return `${WHOOP_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<WhoopTokenPayload> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: envOrThrow("WHOOP_CLIENT_ID"),
    client_secret: envOrThrow("WHOOP_CLIENT_SECRET"),
  });
  const r = await fetch(WHOOP_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`whoop token exchange failed: ${r.status} ${text}`);
  }
  return (await r.json()) as WhoopTokenPayload;
}

// Exported for tests. Whoop's refresh grant takes scope=offline ONLY —
// sending the full scope list (as the authorize step does) gets a 400
// invalid_request back. Surfaced 10 Jun 2026 by the first real cron
// run; every token refresh had been failing with it.
export function refreshTokenRequestBody(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): URLSearchParams {
  return new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    scope: "offline",
  });
}

async function refreshAccessToken(
  refreshToken: string
): Promise<WhoopTokenPayload> {
  const body = refreshTokenRequestBody(
    refreshToken,
    envOrThrow("WHOOP_CLIENT_ID"),
    envOrThrow("WHOOP_CLIENT_SECRET")
  );
  const r = await fetch(WHOOP_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`whoop refresh failed: ${r.status} ${text}`);
  }
  return (await r.json()) as WhoopTokenPayload;
}

// Returns a usable access token for the user, refreshing if needed.
// Persists new tokens to the DB on every refresh. Throws if the user
// has no connection or the refresh permanently failed.
export async function getAccessTokenForUser(userId: string): Promise<string> {
  const supa = getSupabase();
  const { data, error } = await supa
    .from("whoop_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`whoop_connections lookup: ${error.message}`);
  if (!data) throw new Error("no whoop connection for user");
  const conn = data as WhoopConnection;

  const now = Date.now();
  // 60s safety margin so we don't race the upstream expiry.
  if (
    conn.access_token &&
    conn.access_token_expires_at &&
    conn.access_token_expires_at > now + 60_000
  ) {
    return conn.access_token;
  }

  // Refresh.
  const fresh = await refreshAccessToken(conn.refresh_token);
  const newRefresh = fresh.refresh_token || conn.refresh_token;
  const newAccessExp = now + fresh.expires_in * 1000;
  const scopes = (fresh.scope ?? "").split(" ").filter(Boolean);
  const { error: uErr } = await supa
    .from("whoop_connections")
    .update({
      refresh_token: newRefresh,
      access_token: fresh.access_token,
      access_token_expires_at: newAccessExp,
      scopes: scopes.length > 0 ? scopes : conn.scopes,
    })
    .eq("user_id", userId);
  if (uErr) throw new Error(`whoop_connections update: ${uErr.message}`);
  return fresh.access_token;
}

// Saves a brand-new connection on initial OAuth callback.
export async function upsertConnection(
  userId: string,
  payload: WhoopTokenPayload,
  whoopUserId: number | null
): Promise<void> {
  const now = Date.now();
  const scopes = (payload.scope ?? "").split(" ").filter(Boolean);
  const supa = getSupabase();
  const { error } = await supa.from("whoop_connections").upsert(
    {
      user_id: userId,
      refresh_token: payload.refresh_token,
      access_token: payload.access_token,
      access_token_expires_at: now + payload.expires_in * 1000,
      scopes,
      whoop_user_id: whoopUserId,
      connected_at: now,
      last_sync_at: null,
      last_sync_status: null,
      last_sync_error: null,
    },
    { onConflict: "user_id" }
  );
  if (error) throw new Error(`upsertConnection: ${error.message}`);
}

export async function getConnectionStatus(
  userId: string
): Promise<{ connected: boolean; lastSyncAt: number | null; status: string | null }> {
  const supa = getSupabase();
  const { data, error } = await supa
    .from("whoop_connections")
    .select("last_sync_at, last_sync_status")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`whoop status lookup: ${error.message}`);
  if (!data) return { connected: false, lastSyncAt: null, status: null };
  return {
    connected: true,
    lastSyncAt: (data as { last_sync_at: number | null }).last_sync_at,
    status: (data as { last_sync_status: string | null }).last_sync_status,
  };
}

// Disconnects: revokes upstream + deletes the row + cascades cycles/workouts.
export async function disconnect(userId: string): Promise<void> {
  // Best-effort upstream revoke.
  try {
    const token = await getAccessTokenForUser(userId).catch(() => null);
    if (token) {
      await fetch("https://api.prod.whoop.com/oauth/oauth2/revoke", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token,
          client_id: envOrThrow("WHOOP_CLIENT_ID"),
          client_secret: envOrThrow("WHOOP_CLIENT_SECRET"),
        }),
      });
    }
  } catch {
    // Revoke is best-effort; row deletion is authoritative.
  }
  const supa = getSupabase();
  const { error } = await supa.from("whoop_connections").delete().eq("user_id", userId);
  if (error) throw new Error(`disconnect delete: ${error.message}`);
}

// --- Data fetches ---

// Wrapper that surfaces 401s as "needs re-auth" so the caller can mark
// the connection expired in our DB.
async function apiGet<T>(userId: string, path: string): Promise<T> {
  const token = await getAccessTokenForUser(userId);
  const r = await fetch(`${WHOOP_API_BASE}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (r.status === 401) {
    const err: Error & { code?: string } = new Error("whoop_unauthenticated");
    err.code = "WHOOP_UNAUTH";
    throw err;
  }
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`whoop ${path}: ${r.status} ${text}`);
  }
  return (await r.json()) as T;
}

export type WhoopProfile = {
  user_id: number;
  email: string;
  first_name: string;
  last_name: string;
};
export async function fetchProfile(userId: string): Promise<WhoopProfile> {
  return apiGet<WhoopProfile>(userId, "/user/profile/basic");
}

export type WhoopCycle = {
  id: number;
  start: string; // ISO
  end: string | null;
  score: {
    strain: number;
    kilojoule: number;
    average_heart_rate: number;
    max_heart_rate: number;
  };
};
export async function fetchRecentCycles(
  userId: string,
  daysBack: number = 7
): Promise<WhoopCycle[]> {
  const start = new Date(Date.now() - daysBack * 24 * 3600 * 1000).toISOString();
  const r = await apiGet<{ records: WhoopCycle[] }>(
    userId,
    `/cycle?start=${encodeURIComponent(start)}&limit=25`
  );
  return r.records ?? [];
}

export type WhoopRecovery = {
  cycle_id: number;
  score: { recovery_score: number; hrv_rmssd_milli: number; resting_heart_rate: number };
};
export async function fetchRecentRecoveries(
  userId: string,
  daysBack: number = 7
): Promise<WhoopRecovery[]> {
  const start = new Date(Date.now() - daysBack * 24 * 3600 * 1000).toISOString();
  const r = await apiGet<{ records: WhoopRecovery[] }>(
    userId,
    `/recovery?start=${encodeURIComponent(start)}&limit=25`
  );
  return r.records ?? [];
}

export type WhoopWorkout = {
  // Whoop v2 returns UUID strings (v1 used numeric ids). Our column is
  // now text to match.
  id: string;
  start: string;
  end: string;
  sport_name?: string;
  score: { strain: number; kilojoule: number; average_heart_rate: number; max_heart_rate: number };
};
export async function fetchRecentWorkouts(
  userId: string,
  daysBack: number = 7
): Promise<WhoopWorkout[]> {
  const start = new Date(Date.now() - daysBack * 24 * 3600 * 1000).toISOString();
  const r = await apiGet<{ records: WhoopWorkout[] }>(
    userId,
    `/activity/workout?start=${encodeURIComponent(start)}&limit=25`
  );
  return r.records ?? [];
}

// kJ → kcal helper. Whoop reports kilojoules; we store kcal everywhere
// else in the app so convert at the edge.
export function kjToKcal(kj: number): number {
  return kj / 4.184;
}
