# Eats — architecture map for fast onboarding

A 5-minute read so an agent (or a future-you) can navigate confidently.
Read in this order if it's your first time.

## 1. Data flow at a glance

```
        ┌────────────────────────────────────────────────────────────┐
        │                      iPhone (PWA)                          │
        │                                                            │
        │  ┌─────────┐   ┌─────────┐   ┌──────────┐   ┌───────────┐  │
        │  │ Home    │ ⇄ │ Meal    │ ⇄ │ Settings │   │ Sheets    │  │
        │  │ /       │   │ /meal/* │   │ (modal)  │   │ (modal)   │  │
        │  └────┬────┘   └────┬────┘   └────┬─────┘   └─────┬─────┘  │
        │       │             │             │               │        │
        │       └─────────────┴──────┬──────┴───────────────┘        │
        │                            │                                │
        │                       lib/api.ts      ← only file that      │
        │                            │           knows /api/* paths   │
        └────────────────────────────┼────────────────────────────────┘
                                     │
        ┌────────────────────────────┼────────────────────────────────┐
        │                  Next.js API routes (server)                │
        │                                                             │
        │  /api/parse        /api/parse-text   /api/lookup            │
        │  /api/meals        /api/meals/[id]   /api/meals/[id]/talk   │
        │  /api/stats        /api/photo/[filename]                    │
        │                                                             │
        │       ┌───────────────────┴────────────────┐                │
        │       │                                    │                │
        │  lib/vision.ts                       lib/db.ts              │
        │  (Anthropic SDK,                     (Supabase admin        │
        │   prompts, schemas,                   client, table         │
        │   composite hint)                     helpers, aggregates)  │
        │                                       lib/storage.ts        │
        │                                       (signed URLs)         │
        └─────────────────────────────────────────────────────────────┘
                          │                          │
                  Anthropic API                Supabase Postgres
                  (Claude Opus 4.7)            + Storage (private)
```

## 2. Where things live

### `app/` — Next.js routes + components

| Path | Purpose |
|---|---|
| `app/page.tsx` | Home: today's pulse + meal cards + history below; smart-switch when today is empty |
| `app/meal/[id]/page.tsx` | Server component, fetches meal by id, hands off to EditPage |
| `app/meal/[id]/edit-page.tsx` | Full-screen edit UI (talk-fix, manual edits, totals, save/delete) |
| `app/components/*` | Presentation components — see below |
| `app/api/*/route.ts` | Server route handlers — thin orchestration over `lib/db.ts` + `lib/vision.ts` |

### `app/components/` — UI primitives

| File | What |
|---|---|
| `History.tsx` | Looking-back container; fetches `/api/stats`, renders headline + calendar + trends |
| `CalendarHeatmap.tsx` | 12-week (or fewer) grid, single-hue plant scale, tap-to-navigate |
| `RollingHeadline.tsx` | Presentation only — sentence comes from `lib/rolling-headline.ts` |
| `FiberTrend.tsx`, `SatFatTrend.tsx` | 7-day rolling-avg sparklines |
| `RetestAnchor.tsx` | "September retest in N weeks" footer |
| `SettingsSheet.tsx` | Daily targets editor (localStorage-backed) |
| `ItemRow.tsx` | One item card inside the edit page |

### `lib/` — pure logic + data layer

| File | Concern | Tested? |
|---|---|---|
| `types.ts` | Shared types (`Meal`, `Item`, `Per100g`, `DayAggregate`), default targets, retest date | n/a |
| `styles.ts` | Design tokens, plant-color scale, `inputStyle`, `textareaStyle` | yes (`plantColor`) |
| `date.ts` | `todayStart`, `ymd`, `parseYmd`, `isSameDay`, `dayLabel` | yes |
| `targets.ts` | `useTargets()` hook, localStorage R/W, custom-event sync | n/a (UI hook) |
| `computeTotals.ts` | Client-side mirror of server totals math | yes |
| `validate.ts` | `isValidItem` — server-side runtime guard for PATCH bodies | yes |
| `rolling-headline.ts` | Rules for the looking-back sentence | yes |
| `window.ts` | `visibleAggregates` — shared trim logic between calendar + trend lines | yes |
| `vision.ts` | Anthropic SDK calls, prompts, schemas, `totalsFromItems` (server) | partial |
| `db.ts` | Lazy Supabase admin client + table helpers + `getDailyAggregates` | n/a (I/O) |
| `storage.ts` | Photo upload + signed URL helpers | n/a (I/O) |
| `api.ts` | **Single client-side surface for `/api/*`.** All UI fetches go here. | n/a (thin) |
| `useBodyScrollLock.ts` | iOS-correct `position:fixed` body-scroll lock for modals | n/a (DOM) |

### `lib/__tests__/` — vitest unit tests

Run all: `npm test` · watch: `npm run test:watch` · UI: `npm run test:ui`

Currently 62 tests across:
- `date.test.ts`
- `computeTotals.test.ts`
- `window.test.ts`
- `styles.test.ts`
- `vision.test.ts`
- `rolling-headline.test.ts`
- `validate.test.ts`

### `supabase/migrations/` — versioned schema

Apply with `supabase db push`. Each file is timestamped + idempotent.

## 3. Conventions

### "Pure logic in `lib/`, presentation in components"

If a function makes a decision (which color, which copy, valid or not), it belongs in `lib/`. The component imports it and renders. Makes the decision testable without React, and makes the component readable as "what does this look like."

### "All `/api/*` calls go through `lib/api.ts`"

Components don't `fetch` directly. They call `parsePhoto(files, caption)` or `patchMealItems(id, items)`. One file owns request/response shapes and error handling.

### "Lazy I/O singletons"

`lib/db.ts` exports `getSupabase()`, NOT a top-level `supabase` const. Means the file can be imported (e.g. for types) without env vars set. Same pattern would apply to any future external-service client.

### "Memory writes only on validated saves"

`food_memory` is upserted only when the user PATCHes a meal (i.e., explicitly reviewed + saved), not on initial parse. Keeps the memory high-signal so future parses prefer user-validated values.

### "Targets are reference numbers, not gates"

The pulse and trend lines scale to targets, but nothing red-alerts when over. Settings live in localStorage; defaults tuned to Diogo's specific phenotype, not the textbook conservative case.

## 4. The flows worth knowing cold

### Capture (photo)
1. Tap photo FAB → file input (multi) → `pendingFiles` state set
2. ConfirmSheet shows preview + caption input
3. "log it" → `parsePhoto(files, caption)` (lib/api)
4. `/api/parse`: sharp-resizes / composites if multi → Vision call (with food_memory + recent meals as context) → `insertMeal`
5. UI re-fetches today's meals + bumps history version

### Capture (text)
1. Tap pencil FAB → TextSheet
2. "log it" → `parseText(text)` (lib/api)
3. `/api/parse-text`: text-only Vision call → `insertMeal`
4. UI refreshes

### Edit (full-screen route)
1. Tap meal card → `router.push(/meal/${id})`
2. Server fetches meal, renders EditPage
3. User can: edit grams, add/remove items, talk-fix via Claude, save or delete
4. Save → `patchMealItems(id, items)` → server validates each item (`isValidItem`) → recomputes totals → `updateMealItems` + `upsertFoodMemory`
5. `router.push("/")` + `router.refresh()` returns to home with fresh data

### Looking back
1. Home renders `<History />` smart-switched
2. History fetches `/api/stats?days=84`
3. Renders RollingHeadline (rules-based), CalendarHeatmap, FiberTrend, SatFatTrend, RetestAnchor

## 5. Known constraints + sharp edges

- **Photo size cap**: server resizes to 2048px max, JPEG 85, must stay under Claude's 5MB cap. Composite mode caps at 4 panels.
- **Single user, no auth yet**: URL is the secret. RLS enabled on tables; only the service-role key writes (server only).
- **`/api/photo/[filename]` regex guard**: 16-hex + jpg/png/webp only. Don't loosen without thinking about bucket-enumeration.
- **Time zone**: `lib/db.ts getDailyAggregates` uses the device's local time. Single user in one timezone — fine for now; needs TZ-aware bucketing for travel.
- **Food-memory exact-match key**: `name_key` is normalized lowercase + collapsed whitespace. "Fusilli Pasta" and "fusilli pasta" hit the same row. Substring or fuzzy-matching is intentionally NOT done.

## 6. Where to start when changing X

| Want to change | Open these |
|---|---|
| What Vision returns | `lib/vision.ts` (prompts, schemas) |
| The headline sentence rules | `lib/rolling-headline.ts` + its test |
| Calendar visual / interactions | `app/components/CalendarHeatmap.tsx` |
| Add a new API endpoint | new `app/api/*/route.ts` + add a wrapper in `lib/api.ts` |
| Add a column to `meals` | new file in `supabase/migrations/`, then `getDailyAggregates`, `Meal` type, `MealTotals`, `totalsFromItems` |
| Targets math | `lib/types.ts` `TARGETS` (defaults), `lib/targets.ts` (hook) |
| Daily empty-state copy | `app/components/History.tsx` (`FirstDaysCopy`), `app/page.tsx` (today section) |
