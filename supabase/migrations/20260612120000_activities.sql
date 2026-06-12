-- Activities (12 Jun 2026). The Strength tab becomes "Movement": gym
-- sessions (strength_* tables, untouched) PLUS general activities — padel,
-- runs, walks, etc. Owner's framing: "what I ate, how I moved."
--
-- One table, one row per activity. Unlike strength sessions (which fan out
-- into sets), an activity is a flat record: type + when + how long + how
-- hard. Manual rows come from the app today; a future Garmin watch feed
-- (Pi cron) will upsert rows automatically — the schema anticipates that
-- without a redesign:
--   source       — where the row came from ('manual' today; 'garmin',
--                   'whoop' for automated feeds). Manual writes are pinned
--                   to 'manual' at the route; the feed sets its own.
--   external_id  — the upstream system's own activity id. The dedupe key
--                   for re-runs of the watch sync: a feed UPSERTs on
--                   (user_id, source, external_id) so re-importing the
--                   same Garmin activity updates rather than duplicates.
--                   NULL for manual rows (no upstream id), hence the
--                   PARTIAL unique index — manual rows are exempt, so two
--                   manual activities with no external_id never collide.
--
-- Timestamps are ms epoch bigints, matching meals.created_at and the
-- strength tables. All access goes through Next.js API routes with the
-- service-role key; RLS policies are defense-in-depth, same as the rest
-- of the schema. Activities get the FULL CRUD policy set (select / insert
-- / update / delete own) because the route exposes PATCH and DELETE —
-- unlike strength sessions, which are insert-only in v0.

CREATE TABLE IF NOT EXISTS activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL
    CHECK (type IN ('padel', 'run', 'walk', 'bike', 'swim', 'football', 'hike', 'other')),
  label text,                          -- optional free descriptor: "class", "match"
  started_at bigint NOT NULL,          -- ms epoch
  duration_min integer NOT NULL
    CHECK (duration_min > 0 AND duration_min <= 1440),
  effort text
    CHECK (effort IN ('light', 'moderate', 'hard')),
  distance_km double precision
    CHECK (distance_km > 0),
  note text,
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'garmin', 'whoop')),
  external_id text,                    -- upstream activity id; future dedupe key
  created_at bigint NOT NULL DEFAULT (extract(epoch from now()) * 1000)
);

CREATE INDEX IF NOT EXISTS activities_user_started_idx
  ON activities (user_id, started_at DESC);

-- Partial unique index: a feed re-run UPSERTs on (user_id, source,
-- external_id), so the same upstream activity can't be imported twice.
-- Manual rows (external_id NULL) are exempt — they never carry an
-- upstream id and must be freely duplicable.
CREATE UNIQUE INDEX IF NOT EXISTS activities_source_external_uniq
  ON activities (user_id, source, external_id)
  WHERE external_id IS NOT NULL;

-- RLS: full own-row CRUD (the route exposes POST/GET/PATCH/DELETE).
-- Service role bypasses RLS, so the API routes and the future cron feed
-- (both service-role) aren't affected; these policies only bite if the
-- anon key is ever used directly.
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY activities_select_own ON activities
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY activities_insert_own ON activities
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY activities_update_own ON activities
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY activities_delete_own ON activities
  FOR DELETE USING (user_id = auth.uid());
