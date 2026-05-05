# Eats

AI-first food log. Single user, single screen. Snap a meal → Claude Vision parses it → today's pulse updates.

## v1 scope

- Big snap button (fires the iPhone camera via `<input capture>`)
- Today's grid of meal cards (photo + parsed items + 4 nutrient totals)
- Today's pulse: sat fat, soluble fiber, plant %, calories, protein
- Local SQLite, photos on disk, no auth

Anchored to: lowering LDL by Sept 2026 cardio retest. The 4 nutrients tracked are the ones that move that needle.

## Run on your laptop

```
cp .env.example .env
# put your ANTHROPIC_API_KEY in .env
npm install
npm run dev
```

The dev server binds to `0.0.0.0:3000`. To open it from your iPhone on the same wifi:

1. On your laptop: `ipconfig getifaddr en0` (or whatever your wifi interface is) → e.g. `192.168.1.42`
2. On your iPhone Safari: `http://192.168.1.42:3000`
3. Add to home screen → it installs as a PWA, launches fullscreen.

The camera button uses `capture="environment"`, which on iOS Safari opens the rear camera directly.

## Deploying later

When you want a real URL on your phone (no laptop needed):

1. Push to a new GitHub repo
2. Connect to Vercel
3. Set `ANTHROPIC_API_KEY` in Vercel env vars
4. Swap `better-sqlite3` for Vercel Postgres (or Neon) — SQLite doesn't work on Vercel's filesystem
5. Swap on-disk photos for Vercel Blob

Until then, local + iPhone over wifi is the fastest path.

## Architecture

```
app/
  page.tsx               # single screen: pulse + meal grid + FAB
  layout.tsx             # PWA manifest + viewport
  api/
    parse/route.ts       # POST photo → Claude Vision → save → return meal
    meals/route.ts       # GET today's meals, DELETE by id
    photo/[filename]/    # serve stored photos
lib/
  db.ts                  # SQLite schema + queries
  vision.ts              # Claude Vision call (Opus 4.7, structured output)
data/
  eats.db                # SQLite file (gitignored)
  photos/                # raw photos (gitignored)
```

## What's deferred

- Telegram bot / SMS input — defer until v1 is in daily use
- Manual edit/correct after parse — for now, delete + retake
- Weekly summary cron
- Pre-consult dossier (mid-Sep 2026)
- Auth (single user, single device)
