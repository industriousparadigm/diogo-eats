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
import type { DayAggregate, Item, Meal, Per100g, Targets } from "./types";
import type { Food } from "./foods";
import type {
  AlternativesResult,
  CompleteSessionResult,
  CreateExerciseInput,
  Exercise,
  SessionDetail,
  SessionPayload,
  StrengthOverview,
  StrengthSession,
} from "./strengthTypes";
import type {
  Activity,
  CreateActivityInput,
  UpdateActivityInput,
  ParsedActivity,
} from "./activityTypes";
import {
  mockCompleteSession,
  mockSessionDetail,
  mockStrengthOverview,
} from "./strengthFixtures";

// Dev-only escape hatches, resolved at bundle time:
// - EXPO_PUBLIC_API_URL points the app at a local Next dev server.
// - EXPO_PUBLIC_STRENGTH_MOCK=1 serves typed strength fixtures while the
//   strength backend hasn't landed on prod yet. Neither is set when
//   publishing, so production bundles always hit the live API.
const STRENGTH_MOCK = process.env.EXPO_PUBLIC_STRENGTH_MOCK === "1";

const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ??
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

// GET /api/meals/recent?days=N&limit=M — recent meals across days,
// newest-first. Powers the capture-sheet repeat row (discover known meals
// at logging time, not only via day browsing).
export async function fetchRecentMeals(
  opts: { days?: number; limit?: number } = {}
): Promise<Meal[]> {
  const p = new URLSearchParams();
  if (opts.days != null) p.set("days", String(opts.days));
  if (opts.limit != null) p.set("limit", String(opts.limit));
  const qs = p.toString();
  const data = await request<{ meals: Meal[] }>(
    `/api/meals/recent${qs ? `?${qs}` : ""}`,
    { method: "GET" },
    30_000
  );
  return data.meals ?? [];
}

// POST /api/meals/[id]/repeat — deterministic re-log of a known meal at a
// scale (½/1×/2×), no Vision call. for_date backfills onto a past day.
export async function repeatMeal(
  id: string,
  opts: { scale?: number; forDate?: string } = {}
): Promise<Meal> {
  const body: { scale?: number; for_date?: string } = {};
  if (opts.scale != null) body.scale = opts.scale;
  if (opts.forDate) body.for_date = opts.forDate;
  const data = await request<{ meal: Meal }>(
    `/api/meals/${encodeURIComponent(id)}/repeat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    30_000
  );
  return data.meal;
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

// PATCH /api/meals/[id] with { items } — saves edited items, recomputes
// totals server-side, upserts food memory. Returns the updated meal.
export async function patchMealItems(id: string, items: Item[]): Promise<Meal> {
  const data = await request<{ meal: Meal }>(
    `/api/meals/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    },
    30_000
  );
  return data.meal;
}

// POST /api/meals/[id]/talk with { message } — Claude rewrites the items
// array from a plain-English correction. Returns the rewritten items;
// nothing is saved until the user confirms with a PATCH.
export async function talkFixMeal(id: string, message: string): Promise<Item[]> {
  const data = await request<{ items: Item[] }>(
    `/api/meals/${encodeURIComponent(id)}/talk`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    },
    60_000
  );
  return data.items ?? [];
}

// POST /api/meals/[id]/photo — multipart, one "photo" file. Attaches (or
// replaces) a meal's photo. This is the VISUAL RECORD only: the meal's
// items/numbers are never re-parsed, just the image pointer moves. Returns
// the updated meal (new photo_filename → resolvePhotoUrl re-fetches, no
// stale cache).
export async function attachMealPhoto(
  id: string,
  photo: { uri: string; name: string; type: string }
): Promise<Meal> {
  const form = new FormData();
  form.append("photo", {
    uri: photo.uri,
    name: photo.name,
    type: photo.type,
  } as unknown as Blob);
  const data = await request<{ meal: Meal }>(
    `/api/meals/${encodeURIComponent(id)}/photo`,
    { method: "POST", body: form },
    60_000
  );
  return data.meal;
}

// DELETE /api/meals/[id]/photo — removes the photo object and nulls the
// pointer. Symmetric to attach; items/numbers untouched. Returns the
// updated meal (now photo_filename: null).
export async function removeMealPhoto(id: string): Promise<Meal> {
  const data = await request<{ meal: Meal }>(
    `/api/meals/${encodeURIComponent(id)}/photo`,
    { method: "DELETE" },
    30_000
  );
  return data.meal;
}

// POST /api/lookup with { name } — nutrition lookup for the add-item flow.
export async function lookupFood(
  name: string
): Promise<{ is_plant: boolean; per_100g: Per100g }> {
  return request<{ is_plant: boolean; per_100g: Per100g }>(
    "/api/lookup",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    },
    30_000
  );
}

// ---- foods library ----

// GET /api/foods?q=&limit=&offset= — search the user's foods library.
// Empty q returns the most-seen foods, provenance/times_seen ranked.
export async function fetchFoods(
  query = "",
  opts: { limit?: number; offset?: number } = {}
): Promise<Food[]> {
  const p = new URLSearchParams();
  if (query.trim()) p.set("q", query.trim());
  if (opts.limit != null) p.set("limit", String(opts.limit));
  if (opts.offset != null) p.set("offset", String(opts.offset));
  const data = await request<{ foods: Food[] }>(
    `/api/foods?${p.toString()}`,
    { method: "GET" },
    30_000
  );
  return data.foods ?? [];
}

// POST /api/foods — manual add (provenance forced server-side to user_corrected).
export async function createFood(input: {
  display_name: string;
  is_plant: boolean;
  per_100g: Per100g;
}): Promise<Food> {
  const data = await request<{ food: Food }>(
    "/api/foods",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    30_000
  );
  return data.food;
}

// PATCH /api/foods/[id] — id is the url-encoded name_key.
export async function updateFood(
  nameKey: string,
  patch: { display_name?: string; is_plant?: boolean; per_100g?: Per100g }
): Promise<Food> {
  const data = await request<{ food: Food }>(
    `/api/foods/${encodeURIComponent(nameKey)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    },
    30_000
  );
  return data.food;
}

// DELETE /api/foods/[id].
export async function deleteFood(nameKey: string): Promise<void> {
  await request<{ ok: boolean }>(
    `/api/foods/${encodeURIComponent(nameKey)}`,
    { method: "DELETE" },
    15_000
  );
}

// POST /api/foods/merge — fold merge_ids into keep_id.
export async function mergeFoods(keepKey: string, mergeKeys: string[]): Promise<Food> {
  const data = await request<{ food: Food }>(
    "/api/foods/merge",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keep_id: keepKey, merge_ids: mergeKeys }),
    },
    30_000
  );
  return data.food;
}

// POST /api/foods/from-label — multipart label photo → label_verified food.
// 422 = no readable panel. NOTE: consumes a daily Vision parse quota.
export async function foodFromLabel(photo: {
  uri: string;
  name: string;
  type: string;
}): Promise<Food> {
  const form = new FormData();
  form.append("photo", {
    uri: photo.uri,
    name: photo.name,
    type: photo.type,
  } as unknown as Blob);
  const data = await request<{ food: Food }>(
    "/api/foods/from-label",
    { method: "POST", body: form },
    60_000
  );
  return data.food;
}

// POST /api/meals/compose — build a meal from known library foods (zero
// AI). items are { food_id (a name_key), grams }. for_date backfills.
export async function composeMeal(
  items: { food_id: string; grams: number }[],
  opts: { forDate?: string; caption?: string } = {}
): Promise<Meal> {
  const body: { items: typeof items; for_date?: string; caption?: string } = { items };
  if (opts.forDate) body.for_date = opts.forDate;
  if (opts.caption?.trim()) body.caption = opts.caption.trim();
  const data = await request<{ meal: Meal }>(
    "/api/meals/compose",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    30_000
  );
  return data.meal;
}

// GET /api/stats?days=N — per-day aggregates for the looking-back surface.
export async function fetchStats(days = 84): Promise<DayAggregate[]> {
  const data = await request<{ aggregates: DayAggregate[] }>(
    `/api/stats?days=${days}`,
    { method: "GET" },
    30_000
  );
  return data.aggregates ?? [];
}

// GET /api/profile — the user's profile row (targets live here).
export type Profile = Targets & { email?: string };

export async function fetchProfile(): Promise<Profile> {
  const data = await request<{ profile: Profile }>(
    "/api/profile",
    { method: "GET" },
    30_000
  );
  return data.profile;
}

// PATCH /api/profile — update the 4 daily targets.
export async function saveTargets(targets: Targets): Promise<void> {
  await request<{ profile: Profile }>(
    "/api/profile",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(targets),
    },
    30_000
  );
}

// GET /api/garmin/status?date=YYYY-MM-DD — read-only daily Garmin rollup
// (strain 0-21 + recovery + components). A Pi cron keeps the table fresh;
// there's no sync-from-app path (Garmin blocks datacenter IPs). Per-day.
export type GarminDay = {
  day: string;
  today: {
    strain: number | null;
    recovery: number | null;
    resting_hr: number | null;
    sleep_hours: number | null;
    sleep_score: number | null;
    intensity_moderate_min: number | null;
    intensity_vigorous_min: number | null;
    body_battery_drained: number | null;
    body_battery_high: number | null;
    body_battery_low: number | null;
  } | null;
};

export async function fetchGarminStatus(day: string): Promise<GarminDay> {
  return request<GarminDay>(`/api/garmin/status?date=${encodeURIComponent(day)}`, { method: "GET" }, 15_000);
}

// GET /api/strength/overview — the strength feature's home payload.
export async function fetchStrengthOverview(): Promise<StrengthOverview> {
  if (STRENGTH_MOCK) return mockStrengthOverview();
  return request<StrengthOverview>(
    "/api/strength/overview",
    { method: "GET" },
    30_000
  );
}

// GET /api/strength/sessions — the full session log (with sets),
// newest first. Powers the exercise-detail screen's per-exercise history
// + progression sparkline (derived client-side; no new endpoint).
export async function fetchStrengthSessions(): Promise<StrengthSession[]> {
  if (STRENGTH_MOCK) return [mockSessionDetail("").session];
  const data = await request<{ sessions: StrengthSession[] }>(
    "/api/strength/sessions",
    { method: "GET" },
    30_000
  );
  return data.sessions ?? [];
}

// GET /api/strength/sessions/[id] — one session in full + that day's
// beats. Powers the session-detail screen.
export async function fetchStrengthSession(id: string): Promise<SessionDetail> {
  if (STRENGTH_MOCK) return mockSessionDetail(id);
  return request<SessionDetail>(
    `/api/strength/sessions/${encodeURIComponent(id)}`,
    { method: "GET" },
    30_000
  );
}

// POST /api/strength/sessions — submit a completed session in one shot.
// Returns the persisted session + the highlights payload, rendered
// verbatim by the client.
export async function completeStrengthSession(
  payload: SessionPayload
): Promise<CompleteSessionResult> {
  if (STRENGTH_MOCK) return mockCompleteSession(payload);
  return request<CompleteSessionResult>(
    "/api/strength/sessions",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    30_000
  );
}

// POST /api/strength/alternatives — the "machine taken" brain. Body
// { exercise_id } → { alternatives, suggestions }. ~2-4s (a Sonnet call);
// 404 = unknown exercise, 502 = "couldn't fetch alternatives" (surfaced
// cleanly with a retry). Longer timeout to match the model call.
export async function fetchAlternatives(exerciseId: string): Promise<AlternativesResult> {
  return request<AlternativesResult>(
    "/api/strength/alternatives",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exercise_id: exerciseId }),
    },
    60_000
  );
}

// Thrown by createStrengthExercise on a 409 case-insensitive dupe. Carries
// the echoed existing exercise so the UI can offer "use that one" instead
// of minting a near-duplicate.
export class ExerciseConflictError extends ApiError {
  constructor(
    message: string,
    public readonly exercise: Exercise
  ) {
    super("EXERCISE_CONFLICT", message, 409);
    this.name = "ExerciseConflictError";
  }
}

// POST /api/strength/exercises — create a user exercise. 200 { exercise } |
// 400 (validation) | 409 { error, exercise } (case-insensitive dupe). The
// 409 is intercepted here and re-thrown as ExerciseConflictError carrying
// the echoed exercise; everything else flows through the shared error path.
// A bespoke fetch (not the shared `request`) so the 409 body is read before
// it's collapsed into a generic SERVER_ERROR.
export async function createStrengthExercise(
  input: CreateExerciseInput
): Promise<Exercise> {
  let token: string;
  try {
    token = await getAccessToken();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError("AUTH_ERROR", "Could not get auth token");
  }

  const doFetch = (bearer: string) =>
    fetchWithTimeout(
      `${BASE_URL}/api/strength/exercises`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${bearer}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      },
      30_000
    );

  let resp = await doFetch(token);
  if (resp.status === 401) {
    const { error } = await supabase.auth.refreshSession();
    if (error) {
      throw new ApiError("AUTH_ERROR", "Session expired — please sign in again", 401);
    }
    token = await getAccessToken();
    resp = await doFetch(token);
  }

  // 409 — the dupe path. Read the echoed exercise so the caller can offer
  // "use that one".
  if (resp.status === 409) {
    let exercise: Exercise | null = null;
    let msg = "exercise already exists";
    try {
      const body = await resp.json();
      if (typeof body?.error === "string") msg = body.error;
      if (body?.exercise) exercise = body.exercise as Exercise;
    } catch {
      // keep defaults
    }
    if (exercise) throw new ExerciseConflictError(msg, exercise);
    // Defensive: a 409 with no echoed exercise still shouldn't crash.
    throw new ApiError("SERVER_ERROR", msg, 409);
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

  const data = (await resp.json()) as { exercise: Exercise };
  return data.exercise;
}

// ---- activities (general MOVEMENT) ---------------------------------------
//
// The non-gym half of "how I moved": padel, runs, walks. All under
// requireUser (Bearer). Validation lives server-side; lib/movementLog.ts
// mirrors the rules so the form catches errors first. Clean 400 messages
// flow through the shared SERVER_ERROR path.

// GET /api/activities?days=N (default 30, clamp 1-365) → newest-first.
export async function fetchActivities(days?: number): Promise<Activity[]> {
  const qs = days != null ? `?days=${days}` : "";
  const data = await request<{ activities: Activity[] }>(
    `/api/activities${qs}`,
    { method: "GET" },
    30_000
  );
  return data.activities ?? [];
}

// POST /api/activities → { activity }. 400s with a clean message on a bad
// duration / effort / distance / started_at (surfaced verbatim).
export async function createActivity(input: CreateActivityInput): Promise<Activity> {
  const data = await request<{ activity: Activity }>(
    "/api/activities",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    30_000
  );
  return data.activity;
}

// PATCH /api/activities/[id] (any subset; nullables clear with null) →
// { activity }. The edit sheet uses this for the started_at time adjust and
// every other field.
export async function updateActivity(
  id: string,
  patch: UpdateActivityInput
): Promise<Activity> {
  const data = await request<{ activity: Activity }>(
    `/api/activities/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    },
    30_000
  );
  return data.activity;
}

// DELETE /api/activities/[id] → { ok }.
export async function deleteActivity(id: string): Promise<void> {
  await request<{ ok: boolean }>(
    `/api/activities/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    15_000
  );
}

// POST /api/activities/parse — a Strava-style workout screenshot in, the
// stats the AI read out (+ the stored screenshot's filename to attach on
// create/patch). The form prefills from `parsed`; the user confirms. Nothing
// is logged until they submit.
export async function parseActivityPhoto(photo: {
  uri: string;
  name: string;
  type: string;
}): Promise<{ parsed: ParsedActivity; photo_filename: string }> {
  const form = new FormData();
  form.append("photo", {
    uri: photo.uri,
    name: photo.name,
    type: photo.type,
  } as unknown as Blob);
  return request<{ parsed: ParsedActivity; photo_filename: string }>(
    "/api/activities/parse",
    { method: "POST", body: form },
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
