# Eats Mobile

Native mobile client for the Eats food-logging app. Built with Expo SDK 54, TypeScript strict, expo-router file-based navigation.

**Distribution:** Expo Go (no Apple Developer Program required). EAS Update for OTA patches.

---

## Running the app

```bash
cd mobile/
npm install
npx expo start
```

Scan the QR code with the **Expo Go** app (iOS App Store). The app connects to the production API at `https://diogo-eats.vercel.app` — your Supabase credentials come from `app.json` extra config (already set to the live project).

---

## Auth flow

Sign-in is a two-step OTP email code flow:

1. Enter email. The app calls `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })`. Supabase sends a 6-digit code to the email. (The server's ALLOWED\_EMAILS env var gates who can receive a code.)
2. Enter the 6-digit code. The app calls `supabase.auth.verifyOtp({ email, token, type: "email" })`.
3. On success, the Supabase session is persisted in SecureStore via the chunked adapter (`lib/storage.ts`). The user never sees the sign-in screen again on this device.

**Session persistence:** Supabase sessions are ~3-4 KB and exceed SecureStore's 2048-byte per-key limit. The chunking adapter splits large values across `key_chunk_0`, `key_chunk_1`, etc. and stores the count in `key_chunk_count`. Small values are stored as a single key. Tests in `__tests__/storage.test.ts` verify the round-trip.

**Token refresh:** `persistSession: true` and `autoRefreshToken: true` are set on the Supabase client. The root layout (`app/_layout.tsx`) wires `AppState` so the SDK calls `startAutoRefresh()` when the app foregrounds and `stopAutoRefresh()` when it backgrounds — the documented React Native pattern.

**API auth:** Every API call attaches `Authorization: Bearer <access_token>`. On 401 the client refreshes the session once and retries. On refresh failure it surfaces "Session expired — please sign in again".

---

## EAS Update (wired 10 Jun 2026 — this is the daily-driver distribution)

Linked to `@diogo-native/diogo-eats` (project ID `d8e655c7-a6c9-440e-9c1e-fe785b75000c`), channel `main` → branch `main`, runtime policy `sdkVersion`.

**The app's permanent URL (no dev server needed):**

exp://u.expo.dev/d8e655c7-a6c9-440e-9c1e-fe785b75000c?channel-name=main

Open it in Expo Go (or via a home-screen Shortcut that opens this URL). Expo Go caches the last update, so the app opens offline-tolerant and picks up new updates when it can.

**Publish an update** (JS/assets only — that's everything in this app):

```bash
cd mobile && npx eas-cli update --branch main --message "what changed"
```

**SDK version is pinned by Expo Go, not by us.** Expo Go on the App Store is v54 (supports `exposdk:54.0.0` only). The project was downgraded SDK 56 → 54 on 10 Jun 2026 for exactly this reason (the store's Expo Go rejected 56). When Expo ships a newer Expo Go, upgrade the SDK and republish — until then, `npx expo install --check` must stay clean against SDK 54.

---

## What's deliberately deferred

These features require a paid Apple Developer Program account ($99/yr) or are intentionally out of v1 scope:

- **Push notifications.** APNs requires a Developer Program certificate. The FCM/APNs setup is non-trivial for Expo Go builds. The app reconciles missed parses via `AppState` foreground detection instead.
- **Home screen widget.** Requires WidgetKit (iOS native module) — not available in Expo Go.
- **Share sheet extension.** Requires App Extension capability — needs a native build.
- **Haptic feedback on capture.** `expo-haptics` is Expo Go-compatible but skipped to keep the feature list minimal for v1.
- **Notification badges.** Same gating as push.
- **Offline queue.** The design decision (from the web app's README) is to reconcile via `AppState` foreground detection rather than persist a client-side pending queue. If a parse was in-flight when the OS killed the app, the user pulls-to-refresh and the meal either appeared (parse succeeded server-side) or didn't (they re-submit).

---

## Project structure

```
mobile/
  app/
    _layout.tsx          # Root layout: AppState wiring, auth redirect
    (auth)/
      _layout.tsx
      sign-in.tsx        # Email OTP sign-in screen
    (app)/
      _layout.tsx
      today.tsx          # Today screen: meals list + FAB + pending cards
  components/
    MealCard.tsx         # Individual meal card with photo, vibe, badges
    PendingCard.tsx      # Optimistic card shown during parse
    DayTotalsStrip.tsx   # Horizontal strip: kcal, protein, sat fat, fiber, plant%
    CaptureSheet.tsx     # Bottom sheet: photo picker + text entry + resize
  lib/
    api.ts               # HTTP client: fetchMeals, deleteMeal, parseMealPhoto, parseMealText
    colors.ts            # Design tokens (dark theme, plant scale, accent green)
    format.ts            # Pure display-formatting functions (testable)
    storage.ts           # SecureStore chunked adapter for Supabase sessions
    supabase.ts          # Supabase client with storage adapter wired
    types.ts             # Shared types + computeDayTotals + parseItems
  __tests__/
    api.test.ts          # ApiError class
    colors.test.ts       # plantColor function
    format.test.ts       # All format.ts functions
    storage.test.ts      # Chunked SecureStore adapter
    types.test.ts        # parseItems + computeDayTotals
    SignIn.test.tsx       # Sign-in screen component (8 tests)
    TodayScreen.test.tsx  # Today screen component (7 tests)
    simple.test.tsx       # RTLRN v14 smoke test
```
