// API client for the Eats backend (https://diogo-eats.vercel.app).
//
// All requests attach Authorization: Bearer <access_token>.
// On 401: refreshes the session once, then retries. Surface error if
// refresh also fails.
//
// Every request has a timeout (default 30s for reads, 60s for parses).
// On network failure the error.code is "NETWORK_ERROR" so the UI can
// show a retry affordance.

import Constants from "expo-constants";
import { supabase } from "./supabase";
import type { Meal } from "./types";

const BASE_URL =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ??
  "https://diogo-eats.vercel.app";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Wraps fetch with timeout and maps network errors to ApiError.
async function fetchWithTimeout(
  url: string,
  opts: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { ...opts, signal: controller.signal });
    return resp;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new ApiError("TIMEOUT", "Request timed out — check your connection");
    }
    throw new ApiError("NETWORK_ERROR", "No network — check your connection");
  } finally {
    clearTimeout(tid);
  }
}

// Get the current access token, refreshing if needed.
async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    throw new ApiError("AUTH_ERROR", "Not signed in");
  }
  return data.session.access_token;
}

// Core request with one-shot 401-refresh-retry.
async function request<T>(
  path: string,
  init: RequestInit,
  timeoutMs: number,
  _retried = false
): Promise<T> {
  let token: string;
  try {
    token = await getAccessToken();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError("AUTH_ERROR", "Could not get auth token");
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...(init.headers as Record<string, string>),
  };

  const resp = await fetchWithTimeout(
    `${BASE_URL}${path}`,
    { ...init, headers },
    timeoutMs
  );

  if (resp.status === 401 && !_retried) {
    // Refresh and retry once.
    const { error } = await supabase.auth.refreshSession();
    if (error) {
      throw new ApiError("AUTH_ERROR", "Session expired — please sign in again", 401);
    }
    return request<T>(path, init, timeoutMs, true);
  }

  if (resp.status === 429) {
    let msg = "Daily parse limit reached — resets at midnight";
    try {
      const body = await resp.json();
      if (typeof body?.error === "string") msg = body.error;
    } catch {
      // keep default
    }
    throw new ApiError("QUOTA_EXCEEDED", msg, 429);
  }

  if (!resp.ok) {
    let msg = `Server error (${resp.status})`;
    try {
      const body = await resp.json();
      if (typeof body?.error === "string") msg = body.error;
    } catch {
      // keep default
    }
    throw new ApiError("SERVER_ERROR", msg, resp.status);
  }

  return resp.json() as Promise<T>;
}

// GET /api/meals?day=YYYY-MM-DD
export async function fetchMeals(day: string): Promise<Meal[]> {
  const data = await request<{ meals: Meal[] }>(
    `/api/meals?day=${encodeURIComponent(day)}`,
    { method: "GET" },
    30_000
  );
  return data.meals ?? [];
}

// DELETE /api/meals with { id }
export async function deleteMeal(id: string): Promise<void> {
  await request<{ ok: boolean }>(
    "/api/meals",
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    },
    15_000
  );
}

// POST /api/parse — multipart with 1-4 photos + optional caption + optional for_date
export async function parseMealPhoto(params: {
  photos: Array<{ uri: string; name: string; type: string }>;
  caption?: string;
  forDate?: string;
}): Promise<{ meal: Meal }> {
  const form = new FormData();
  for (const photo of params.photos) {
    form.append("photo", {
      uri: photo.uri,
      name: photo.name,
      type: photo.type,
    } as unknown as Blob);
  }
  if (params.caption) form.append("caption", params.caption);
  if (params.forDate) form.append("for_date", params.forDate);

  return request<{ meal: Meal }>(
    "/api/parse",
    { method: "POST", body: form },
    60_000
  );
}

// POST /api/parse-text — JSON { text, for_date? }
export async function parseMealText(params: {
  text: string;
  forDate?: string;
}): Promise<{ meal: Meal }> {
  return request<{ meal: Meal }>(
    "/api/parse-text",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: params.text,
        ...(params.forDate ? { for_date: params.forDate } : {}),
      }),
    },
    60_000
  );
}

// GET /api/photo/{filename} returns a 302 redirect to a signed URL.
// expo-image supports source={{ uri, headers }} which follows redirects —
// but passing an Authorization header via that prop is tricky in Expo Go.
// Instead, we resolve the signed URL client-side by following the
// redirect manually, then cache the resolved URL in memory.
const photoUrlCache = new Map<string, { url: string; expiresAt: number }>();

export async function resolvePhotoUrl(filename: string): Promise<string> {
  const cached = photoUrlCache.get(filename);
  // Supabase signed URLs expire in 5 min; cache for 4 min to be safe.
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  let token: string;
  try {
    token = await getAccessToken();
  } catch {
    throw new ApiError("AUTH_ERROR", "Not signed in");
  }

  // Use no-follow mode to capture the 302 Location, then return that URL
  // (the signed URL itself doesn't need auth headers).
  let resp: Response;
  try {
    resp = await fetchWithTimeout(
      `${BASE_URL}/api/photo/${encodeURIComponent(filename)}`,
      {
        method: "GET",
        redirect: "manual",
        headers: { Authorization: `Bearer ${token}` },
      },
      15_000
    );
  } catch (err) {
    // On mobile, "manual" redirect may not be supported and fetch might
    // follow the redirect automatically (to a URL without auth). If the
    // response is ok, return the final URL.
    if (err instanceof ApiError) throw err;
    throw new ApiError("NETWORK_ERROR", "Could not load photo");
  }

  // If the platform followed the redirect automatically and returned 200:
  if (resp.ok) {
    const url = resp.url;
    photoUrlCache.set(filename, { url, expiresAt: Date.now() + 4 * 60 * 1000 });
    return url;
  }

  // Redirect response: extract Location header.
  const location = resp.headers.get("location") ?? resp.headers.get("Location");
  if ((resp.status === 302 || resp.status === 301) && location) {
    photoUrlCache.set(filename, { url: location, expiresAt: Date.now() + 4 * 60 * 1000 });
    return location;
  }

  throw new ApiError("SERVER_ERROR", `Photo not available (${resp.status})`, resp.status);
}
