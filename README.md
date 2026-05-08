# Eats

AI-first food log. Single user, single screen. Snap or describe a meal → Claude Vision parses → today's pulse updates.

Anchored to: lowering LDL by the Sept 2026 cardio retest with Sergio Machado Leite. The 4 nutrients tracked (saturated fat, soluble fiber, calories, protein) plus a graded plant % are the ones that move that needle.

## Live

- **Production:** https://diogo-eats.vercel.app (Vercel)
- **Backend:** Supabase project `DiogoEats` (region eu-west-1)
  - Postgres for `meals` and `food_memory`
  - Storage bucket `photos` (private, signed URLs from `/api/photo/[filename]`)
- **Repo:** https://github.com/industriousparadigm/diogo-eats

## Capabilities

- **Snap or pick a photo** → Claude Vision parses items + per-item nutrition
- **Type instead** ("two slices of peanut butter cake at home") — same parser, no photo
- **Optional caption** — free-text hints (size, restaurant, low-sugar, vegan version) shape the parse
- **Auto-include implicit ingredients** — cooking oils, dressings, hidden butter/cream
- **Composite-food decomposition** — cakes/breads/sandwiches split into plant base + non-plant components so plant_pct is honest
- **Restaurant-aware** — captions like "at restaurant" / "takeout" trigger larger portions + heavier hidden fats
- **Quick fix in plain English** — tap a meal, tell Claude "it's vegan" / "smaller portion" / "add olive oil", items update
- **Manual edit** — gram-level tweaks, add/remove items with auto nutrition lookup
- **Food memory** — every PATCH save upserts items into `food_memory`; future parses prefer your corrections

## Run locally

```
cp .env.example .env
# fill in ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
npm install
npm run dev   # binds 0.0.0.0:3000 (or pass -- -p 3030 if 3000 is busy)
```

To use from your iPhone on the same wifi: visit `http://<laptop-ip>:3030`. Add to Home Screen for PWA.

## Architecture

```
app/
  page.tsx                          # single screen: pulse + meal grid + FAB + sheets
  layout.tsx                        # PWA manifest + viewport
  api/
    parse/route.ts                  # POST photo (multipart) → Vision → save
    parse-text/route.ts             # POST { text } → Vision → save
    meals/route.ts                  # GET today / DELETE { id }
    meals/[id]/route.ts             # PATCH { items } → recompute totals + upsert food memory
    meals/[id]/talk/route.ts        # POST { message } → conversational item correction
    lookup/route.ts                 # POST { name } → per_100g + is_plant
    photo/[filename]/route.ts       # 302 → short-lived signed URL from Storage
lib/
  db.ts                             # supabase-js admin client + table helpers
  storage.ts                        # photo upload + signed URL
  vision.ts                         # Claude Opus 4.7 calls (parse photo / text / edit)
supabase/
  config.toml                       # CLI link
  migrations/                       # SQL migrations (init schema, storage bucket, RPC fn)
scripts/
  migrate-from-sqlite.mjs           # one-shot port of local SQLite data → Supabase
```

## What's deferred

- Telegram / SMS input
- Weekly Sunday summary cron
- Pre-consult dossier (mid-Sep 2026)
- Auth (currently relies on the URL being unguessed; revisit when sharing or after first sketchy event)
- A "Memory" view to browse / delete entries directly
- **WHOOP integration** — pull activity / strain / recovery via the WHOOP OAuth API so the daily picture is energy-in vs energy-out, not just food. Requires a separate auth setup session.
- **Food library / "capture once, reuse"** — a saved-foods bank where photographed nutrition labels become deterministic per-100g entries, no LLM call needed for repeats. Saves money + makes repeat logging instant.
