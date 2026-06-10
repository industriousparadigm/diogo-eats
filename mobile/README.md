# Eats Mobile

Native mobile client for the Eats food-logging app + the strength-training scoreboard. Built with Expo SDK 54, TypeScript strict, expo-router file-based navigation.

**Distribution:** Expo Go (no Apple Developer Program required). EAS Update for OTA patches.

> **Doing any UI work? Read [`DESIGN.md`](./DESIGN.md) first.** It is the style
> bible — the design DNA, the token system (`lib/theme.ts`), the shared
> primitives (`components/ui/`), the food-vs-strength register rule, and a
> new-screen checklist. The whole app shares one visual language; DESIGN.md is
> how it stays coherent.

**Surfaces** (4 tabs + pushed screens):

- **Today** (default) — the daily food loop. Day navigation (chevrons walk back, label taps home to today), totals strip, Whoop chip, meal cards, capture FAB. Viewing a past day makes the FAB backfill INTO that day (`for_date`).
- **Meal detail/edit** (tap a card) — mirrors the web edit page: confidence dots, gram/name tweaks with live totals, add item via `/api/lookup`, remove, talk-to-fix via `/api/meals/[id]/talk` (rewrite lands for review; only `save` persists).
- **Looking back** — rolling headline (rule-based, ported from the web's `lib/rolling-headline.ts`), calendar heatmap (single-hue plant scale, tap a day to jump the food tab there), coverage-honest averages (logged days only, says so), fiber + sat fat 7-day trends.
- **Strength** — the scoreboard. Per-exercise last/best, session history with beats counts, Start/Resume session. Deliberately a different emotional contract from food (amber, bold color-per-exercise cards, beats language) in the same design system.
- **Strength session** (capture flow) — picker ordered "most likely next" (done cards sink), per-series steppers pre-filled from the API's prefill payload, confirm-or-nudge, add-series, optional note, explicit Session complete. **The in-progress draft lives in AsyncStorage and survives app kill/backgrounding** — the server only sees completed sessions. Network failure on complete keeps the draft.
- **Highlights** (post-complete) — renders the API's highlight lines verbatim; beats line leads.
- **Settings** — the 4 daily targets, DB-backed via `/api/profile` (same row the web reads), reset to defaults, signed-in email + sign out.

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
    _layout.tsx              # Root layout: AppState wiring, auth redirect
    index.tsx                # Cold-start entry: resolve session, redirect
    dev-signin.tsx           # __DEV__-only deep-link session injection (simulator agents)
    (auth)/sign-in.tsx       # Email OTP sign-in screen
    (app)/
      _layout.tsx            # Stack: tabs + pushed screens
      (tabs)/
        _layout.tsx          # Tab bar (Today / Looking back / Strength / Settings)
        index.tsx            # Day screen: day nav + meals + FAB + pending cards
        overview.tsx         # Looking back: headline, heatmap, averages, trends
        strength.tsx         # Strength overview: start/resume, last/best, history
        settings.tsx         # Targets (DB-backed) + account
      meal/[id].tsx          # Meal detail/edit (items, talk-to-fix, live totals)
      strength/
        session.tsx          # Live capture flow (picker <-> entry, draft persisted)
        highlights.tsx       # Post-session highlights, rendered verbatim
  components/
    MealCard.tsx             # Meal card: photo, vibe, badges; tap=edit, long-press=delete
    PendingCard.tsx          # Optimistic card shown during parse
    DayTotalsStrip.tsx       # kcal, protein, sat fat, fiber, plant%
    CaptureSheet.tsx         # Photo/text capture; shows backfill day when not today
    WhoopChip.tsx            # Strain + recovery chip (hidden when not connected)
    EditItemRow.tsx          # Item row in the meal editor (confidence dot, grams)
    Heatmap.tsx              # Calendar heatmap (grid math in lib/heatmap.ts)
    TrendChart.tsx           # 7-day rolling trend (react-native-svg)
    SeriesRow.tsx            # Strength series row: steppers + confirm
  lib/
    api.ts                   # HTTP client for every endpoint the app touches
    colors.ts                # Design tokens + exerciseAccent (strength palette)
    format.ts                # Display formatting + day-nav date math
    headline.ts              # Rolling headline rules + window/averages (web port)
    heatmap.ts               # Week-grid assembly for the calendar
    editTotals.ts            # Live totals math during meal editing
    strengthTypes.ts         # MIRROR of backend lib/strength/types.ts (frozen contract)
    strengthSession.ts       # Session draft state machine (pure, serializable)
    strengthFormat.ts        # One vocabulary for strength numbers
    strengthFixtures.ts      # Typed day-1 fixtures (tests + EXPO_PUBLIC_STRENGTH_MOCK)
    draftStorage.ts          # AsyncStorage persistence for the session draft
    stores.ts                # Module stores: meal handoff, picked day, session result
    exerciseImages.ts        # Bundled exercise images keyed by image_key
    storage.ts               # SecureStore chunked adapter for Supabase sessions
    supabase.ts              # Supabase client with storage adapter wired
    types.ts                 # Shared types + computeDayTotals + parseItems
  assets/exercises/          # The five exercise images (free-exercise-db, committed)
  __tests__/                 # 204 tests: pure logic + component tests per screen
```

## Simulator verification (for agents)

Interactive OTP sign-in is impossible for an agent. Instead: mint a session
(supabase admin `generateLink` -> `verifyOtp` in a throwaway script), then
deep-link it into the __DEV__-only route:

```
exp://127.0.0.1:8081/--/dev-signin?access_token=...&refresh_token=...
```

Navigation is deep-linkable too (`/--/(app)/(tabs)/strength`, etc.).
For taps, `idb` (`brew install facebook/fb/idb-companion` + `pip install fb-idb`)
taps in device-point coordinates and is far more reliable than window-coordinate
mouse clicks. Published bundles run production-mode, so `dev-signin` is inert there.
