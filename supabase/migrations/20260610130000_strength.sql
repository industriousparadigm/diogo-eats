-- Strength-training scoreboard (10 Jun 2026). Three tables:
--   strength_exercises — global read-only catalog (the seeded five; no
--     user_id — the library is shared, sessions are per-user).
--   strength_sessions  — one row per COMPLETED session. Drafts live
--     client-side; the server only ever sees finished sessions.
--   strength_sets      — one row per series of one exercise in one
--     session. Modeled individually, never averaged: a weight can
--     change between series (day 1: leg press 32kg then 39kg).
--
-- Timestamps are ms epoch bigints, matching meals.created_at.
-- All access goes through Next.js API routes with the service-role
-- key; RLS policies are defense-in-depth, same as the rest of the schema.

CREATE TABLE IF NOT EXISTS strength_exercises (
  id text PRIMARY KEY,                -- plain slug, e.g. 'leg-press'
  name text NOT NULL,
  description text NOT NULL,          -- plain-language form cue
  measurement_type text NOT NULL
    CHECK (measurement_type IN ('weight_reps', 'bodyweight_reps', 'carry')),
  image_key text NOT NULL,             -- bundled mobile asset key
  sort_order integer NOT NULL DEFAULT 0,
  created_at bigint NOT NULL DEFAULT (extract(epoch from now()) * 1000)
);

CREATE TABLE IF NOT EXISTS strength_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at bigint NOT NULL,
  completed_at bigint NOT NULL,
  note text,                           -- optional free-text; the AI surface later
  created_at bigint NOT NULL DEFAULT (extract(epoch from now()) * 1000)
);

CREATE INDEX IF NOT EXISTS strength_sessions_user_completed_idx
  ON strength_sessions (user_id, completed_at DESC);

CREATE TABLE IF NOT EXISTS strength_sets (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES strength_sessions(id) ON DELETE CASCADE,
  exercise_id text NOT NULL REFERENCES strength_exercises(id),
  position integer NOT NULL,           -- insertion order within the session
                                       -- (drives "same order as last session"
                                       -- in the exercise picker)
  series_index integer NOT NULL,       -- 1-based within the exercise
  weight_kg double precision,          -- null = bodyweight; kg PER HAND for carry.
                                       -- float8, NOT real: beat detection compares
                                       -- weights with === and a float4 round-trip
                                       -- turns 16.3 into 16.299999..., silently
                                       -- killing beats at fractional weights
  reps integer NOT NULL,               -- reps; STEPS for carry exercises
  UNIQUE (session_id, exercise_id, series_index)
);

CREATE INDEX IF NOT EXISTS strength_sets_session_idx
  ON strength_sets (session_id, position);
CREATE INDEX IF NOT EXISTS strength_sets_user_exercise_idx
  ON strength_sets (user_id, exercise_id);

-- RLS: catalog readable by any signed-in user; sessions/sets are
-- select+insert own (no user-facing update/delete in v0 — service role
-- handles maintenance).
ALTER TABLE strength_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE strength_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE strength_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY strength_exercises_select_all ON strength_exercises
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY strength_sessions_select_own ON strength_sessions
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY strength_sessions_insert_own ON strength_sessions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY strength_sets_select_own ON strength_sets
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY strength_sets_insert_own ON strength_sets
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- The five seeded exercises. Catalog data belongs in the migration so
-- every environment gets it; user data (the day-1 baseline session)
-- is seeded separately via scripts/seed-strength-day1.mjs.
INSERT INTO strength_exercises (id, name, description, measurement_type, image_key, sort_order) VALUES
  ('leg-press', 'Leg press', 'Feet mid-platform, shoulder-width. Lower slow, push. Don''t snap knees straight.', 'weight_reps', 'leg-press', 1),
  ('back-extension', 'Back extension', 'Arms crossed. Bow down, lift to a straight line (not beyond), squeeze the butt.', 'bodyweight_reps', 'back-extension', 2),
  ('chest-press', 'Chest press', 'Handles at mid-chest. Push out, return slow, don''t lock elbows.', 'weight_reps', 'chest-press', 3),
  ('seated-row', 'Seated row', 'Sit tall, pull to belly, squeeze shoulder blades. No yanking.', 'weight_reps', 'seated-row', 4),
  ('farmers-carry', 'Farmer''s carry', 'Heavy-ish dumbbell each hand. Stand tall, walk, turn, walk back.', 'carry', 'farmers-carry', 5)
ON CONFLICT (id) DO NOTHING;
