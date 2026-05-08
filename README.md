# Eats

A personal, AI-first food log. Single user, single screen. Snap or describe a meal, Claude Vision parses it, the dashboard updates.

**Anchored to a real medical goal:** lowering LDL by the September 2026 cardiology retest with Sergio Machado Leite. Diogo's LDL is 142, his phenotype is otherwise pristine (HDL 75, trigs 71, A1c 5.5), and the lifestyle-first plan needs to drop it ~15-25% by then. The metrics tracked (plant %, soluble fiber, saturated fat, calories, protein) are the ones that move that needle for someone with his specific picture.

**The actual win is the nudge.** Several days in he reported "thinking twice before mindlessly picking up a snack." That's what the app exists to protect. Every UX decision is downstream of "don't kill the nudge by becoming a calorie counter."

---

## Live

- **Production:** https://diogo-eats.vercel.app
- **Repo:** https://github.com/industriousparadigm/diogo-eats (auto-deploys to Vercel on push to `main`)
- **Backend:** Supabase project `DiogoEats` (region eu-west-1, Diogo's personal Supabase)
  - Postgres tables: `meals`, `food_memory`
  - Storage bucket: `photos` (private, served via short-lived signed URLs)
  - Free tier; Lenny Pass credits queued for when storage approaches the cap
- **Hosting:** Vercel project `diogo-eats` under personal scope `dsgmcostas-projects` (NOT Okra's scope — verified)

---

## Capabilities

### Capture

- **Snap a photo** → big green FAB opens iOS chooser (camera or library). Photos auto-resize via `sharp` (any size to ~700KB at 2048px max), so the 5MB Vision API cap is never hit.
- **Type a description** → "or type what you ate →" link below today's meals. Same parser, no photo. Useful for retroactive logging or quick text entries.
- **Optional caption** alongside photo: size hints ("small plate", "two slices"), context ("at restaurant", "homemade"), corrections ("the vegan version"). Captions ARE taken seriously — "at restaurant" scales portions up ~30-40% and adds hidden cream/butter; "homemade" reinforces home defaults.

### Parse (Claude Opus 4.7 Vision)

- **Per-item nutrition.** Each item gets `name`, `grams`, `confidence`, `is_plant`, and full per-100g nutrition (sat_fat, soluble_fiber, calories, protein, plus silent-capture fat/carbs/sugar/salt for future surfaces).
- **Implicit ingredients auto-included** — Vision adds cooking oils, dressings, hidden cream/butter/cheese the user wouldn't think to mention. Marked low-confidence so the user knows it's inferred.
- **Composite-food decomposition** — cakes, breads, sandwiches split into plant base + non-plant components (e.g. peanut butter cake → cake batter ~145g plant + butter ~20g non-plant + eggs ~15g non-plant) so plant % is honest.
- **Default context: home cooking in Portugal** — modest olive oil, simple seasoning, normal hungry-adult portions. Not "disciplined small."
- **Tone:** celebrate LDL-helping ingredients (oats, beans, lentils, chia, psyllium, plant sterols, plant protein) in notes. Only flag concerns when truly meaningful — single bites of cheese don't warrant a callout. Never editorializes about "non-vegan" status; the user is vegan-leaning, not strict.

### Memory (the system gets smarter as you use it)

- **Food memory.** Every meal you save (including after manual edits or talk-fixes) upserts each item into a `food_memory` table. Top 30 most-recent entries get injected into every parse prompt as authoritative data — Vision uses your validated name, plant flag, and per-100g over its defaults. Correct each food roughly once and it's recognized thereafter.
- **Recent meals context.** Last 7 days of meals (top 30) get injected into parse prompts so references like "same as yesterday" or "two more slices of that cake" resolve cleanly. Verified end-to-end: "i had electrolites with 500ml water, same as yesterday" correctly maps to your prior electrolyte log.

### Edit + correct

- **Tap a meal card → edit sheet** opens.
- **Talk to fix** ("it's all plant", "smaller portion", "I forgot the bread", "actually salmon not trout") — Claude rewrites the items array based on your message. Conservative: only changes what you explicitly say.
- **Manual gram tweaks** with live-updating totals at the bottom of the sheet.
- **Add an item** by name + grams → automatic nutrition lookup via `/api/lookup`.
- **Remove an item** with the X.
- **Confidence dots** (orange = low, amber = medium, no dot = high) so you can spot which items are guesses.

### Looking back (the "satisfaction" surface)

When today's empty, the looking-back surface leads. When today has meals, it sits below them as scroll-down.

- **12-week heatmap** (or fewer if you're newer) — 22px square cells, single-hue plant scale (cream → deep green, no stoplight). Tap any cell to navigate to that day's meals. Calendar grows as you log more.
- **Month + day-of-week labels** with sensible alignment.
- **Rolling headline** — rule-based (no LLM, fast + free + predictable). Leads with what's working: *"Last 14 logged days: plant-leaning; fiber on track most days."* Sat fat trend only mentioned when notable.
- **Soluble fiber trend chart** (7-day rolling avg vs target) — fiber is the underrated lever for LDL reduction; visualizing it celebrates the "keep up" side of the equation.
- **Saturated fat trend chart** (7-day rolling avg vs target) — the "keep down" lever.
- **September retest anchor** at the bottom: gentle "X weeks to retest" footer. No countdown urgency.

### Settings

- Tap the `⋯` icon in the header → settings sheet.
- 4 daily targets: sat fat, soluble fiber, calories, protein.
- Stored in `localStorage` (single user, no DB needed). Synced across hook instances via custom event.
- Defaults are tuned to Diogo's specific phenotype, not the textbook conservative case (sat fat 18g, not 13g).

---

## Design philosophy

These are the load-bearing decisions:

### Protect the nudge

Behavioral health calls it self-monitoring reactivity — the *act* of recording is what's already changing behavior. The looking-back surface has one job: don't kill that effect by becoming a verdict. No streaks, no badges, no "you've earned!" framing, no stoplight color. **Identity language, not score language.** A meal is a choice; the app characterizes the choice honestly without grading it.

### Lead with what's working

Earlier versions led with sat fat and red verdicts. The user's correction: *"I end up on the red every day from one bad food bite, never feel celebrated for plant choices."* Now plant % is the lead, fiber is celebrated when consistent, sat fat is mentioned only when meaningfully off — not on single-bite alarms.

### Single hue, semantic color

Plant scale: cream → deep green. Sat fat over target: amber yellow, never red. Real red reserved for actual errors (failed parse, missing photo). Color carries meaning; meaning is restrained.

### Capture-once, reuse silently

Memory grows from user-validated saves only (PATCH actions, not initial parses), so it stays high-signal. Vision still does the heavy lifting on every parse, but for foods you've corrected before, the result is consistent and feels deterministic.

### Targets are reference numbers, not gates

The pulse and trend lines scale to targets. Nothing red-alerts when over. Settings exist so the user picks the number that's honest for them. Default sat fat is 18g (livable for someone metabolically clean with mostly genetic LDL), not the 13g textbook cap.

---

## Run locally

```bash
cp .env.example .env
# fill in ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
npm install
npm run dev    # binds 0.0.0.0:3000
```

To use from your iPhone on the same wifi: visit `http://<laptop-ip>:3000` and Add to Home Screen for PWA. (Find your IP with `ipconfig getifaddr en0`.) For everyday use, just visit the production URL — it has the same data and avoids the laptop-tether.

---

## Architecture

```
app/
  page.tsx                            # single-screen orchestrator: pulse + meals + sheets + smart-switch
  layout.tsx                          # PWA manifest + Inter font wiring
  globals.css                         # design tokens + scroll lock + fade-in animation
  api/
    parse/route.ts                    # POST photo → resize → Vision → save
    parse-text/route.ts               # POST { text } → Vision → save
    meals/route.ts                    # GET today's / DELETE { id }
    meals/[id]/route.ts               # PATCH { items } → recompute totals + upsert food memory
    meals/[id]/talk/route.ts          # POST { message } → Claude rewrites items
    lookup/route.ts                   # POST { name } → per_100g + is_plant (for add-item flow)
    photo/[filename]/route.ts         # 302 → short-lived signed URL from Storage
    stats/route.ts                    # GET ?days=N → per-day aggregates for the looking-back surface
  components/
    History.tsx                       # the looking-back container (fetches /api/stats)
    CalendarHeatmap.tsx               # 12-week grid, fixed 22px cells, semantic plant scale
    RollingHeadline.tsx               # one-sentence summary of recent shape, rule-based
    FiberTrend.tsx                    # 7-day rolling avg, "keep up" lever
    SatFatTrend.tsx                   # 7-day rolling avg, "keep down" lever
    RetestAnchor.tsx                  # gentle "September retest in N weeks"
    SettingsSheet.tsx                 # daily targets editor, localStorage-backed

lib/
  db.ts                               # supabase-js admin client + meal/memory queries + getDailyAggregates
  storage.ts                          # photo upload + signed URL helpers
  vision.ts                           # Claude Opus 4.7 prompts (parse photo, parse text, edit, lookup)
  types.ts                            # shared types + default targets + retest date
  styles.ts                           # design tokens (colors, radii, plant scale, input/textarea styles)
  targets.ts                          # useTargets hook + saveTargets/resetTargets, localStorage-backed
  window.ts                           # visibleAggregates() — shared trim logic for calendar + trend lines
  useBodyScrollLock.ts                # iOS-correct body scroll lock for modal sheets

supabase/
  config.toml                         # CLI link to project lqkvykbohpoemcggwcuk
  migrations/                         # SQL migrations, applied in order
    20260506060847_init_eats.sql              # meals + food_memory tables, RLS on
    20260506060946_init_storage.sql           # private photos bucket, 5MB cap, image MIME allowlist
    20260506061131_upsert_food_memory_fn.sql  # Postgres RPC for the times_seen+1 upsert
    20260508130926_add_silent_nutrients.sql   # add fat_g/carbs_g/sugar_g/salt_g columns

scripts/
  migrate-from-sqlite.mjs             # one-shot port from the original SQLite scaffold (now archival)
```

### Key data shapes

```ts
// per-item, stored in items_json
type Item = {
  name: string;
  grams: number;
  confidence: "low" | "medium" | "high";
  is_plant: boolean;
  per_100g: {
    sat_fat_g: number;
    soluble_fiber_g: number;
    calories: number;
    protein_g: number;
    fat_g?: number;     // silent-capture, future surfaces
    carbs_g?: number;
    sugar_g?: number;
    salt_g?: number;
  };
};

// per-meal, on the meals table
type Meal = {
  id: string;
  created_at: number;          // ms epoch
  photo_filename: string | null;
  items_json: string;          // JSON of Item[]
  // cached totals (recomputed on every save)
  sat_fat_g: number;
  soluble_fiber_g: number;
  calories: number;
  protein_g: number;
  plant_pct: number;           // mass-weighted across items
  fat_g: number; carbs_g: number; sugar_g: number; salt_g: number;
  notes: string | null;        // Vision's one-line useful coaching note
  caption: string | null;      // user's typed caption / text-only entry
  meal_vibe: string | null;    // ≤6-word vibe phrase from Vision
};
```

### Auth model

Currently none. The URL is the secret. RLS is enabled on tables but no policies are added — the only client is the Next.js API routes using the Supabase service-role key, which bypasses RLS. The anon key is never used.

This is fine for v1 (single user, hard-to-guess subdomain) but should be revisited before sharing the URL with anyone or after any sketchy event. Most likely fix: magic link to a single allowed email via Supabase Auth.

### Image pipeline

1. iOS sends a JPEG/HEIC, often 8-15MB.
2. `/api/parse` reads the multipart, normalizes via `sharp`: EXIF rotation honored, max 2048px, JPEG 85.
3. Resulting buffer is uploaded to the private `photos` bucket as `{16-hex-id}.jpg`.
4. Same buffer is base64-encoded and sent to Claude Vision.
5. The 16-hex filename is stored on the meal row. UI requests `/api/photo/{filename}` which returns a 302 to a 5-minute signed URL.

The 16-hex-only regex on the photo route prevents anyone hitting arbitrary paths into the bucket.

---

## What's deferred (and why)

- **WHOOP integration** — pull activity / strain / recovery via the WHOOP OAuth API so the daily picture is energy-in vs energy-out, not just food. Requires a separate auth setup session.
- **Food library / capture-once-reuse** — a saved-foods bank where photographed nutrition labels become deterministic per-100g entries, no LLM call needed for repeats. Saves money + makes repeat logging instant. Adjacent to food memory but a different surface (a browsable library vs an invisible auto-recognition system).
- **Telegram / SMS input** — text the bot what you ate. Lives where you already are.
- **Weekly Sunday summary** — a once-weekly Claude-written digest. Worth it once there's enough history to write meaningfully about.
- **Pre-consult dossier** (mid-September 2026) — auto-generates the 4-month trajectory the week before Sergio. The killer use case for this entire app.
- **Auth** — see above.
- **Memory view** to browse / delete `food_memory` entries directly. Nice-to-have, not load-bearing.
- **Toggle for the heatmap metric** (currently fixed to plant %; could be sat fat, fiber, calorie). Keep one metric until friction shows.

The discipline: ship one thing at a time, see what gets used, only then add. Don't preempt.
