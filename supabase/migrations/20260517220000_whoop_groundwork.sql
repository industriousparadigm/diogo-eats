-- Whoop integration groundwork. Three user-scoped tables behind RLS:
--   whoop_connections — OAuth refresh token (encrypted at rest) +
--     connection metadata. One row per user max.
--   whoop_cycles      — daily summary (strain, recovery, HRV, RHR,
--     kcal). One row per day per user.
--   whoop_workouts    — per-event log (sport, start/end, strain, kcal,
--     HR zones). Append-mostly.
--
-- Token storage strategy: stored in a service-role-only column. RLS
-- prevents user-facing access. Layer-on-top encryption (pgp_sym_encrypt
-- via supabase.vault) can land later if we want defense-in-depth, but
-- the column is already inaccessible to anything but service_role.

CREATE TABLE IF NOT EXISTS whoop_connections (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- OAuth state
  refresh_token text NOT NULL,
  access_token text,                  -- short-lived; refreshed on demand
  access_token_expires_at bigint,     -- ms epoch
  scopes text[] NOT NULL DEFAULT '{}',
  whoop_user_id bigint,               -- Whoop's numeric user id (for webhook routing later)
  -- Sync bookkeeping
  connected_at bigint NOT NULL DEFAULT (extract(epoch from now()) * 1000),
  last_sync_at bigint,
  last_sync_status text,              -- 'ok' | 'error' | 'expired' (UI tells user to reconnect)
  last_sync_error text
);

CREATE TABLE IF NOT EXISTS whoop_cycles (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day text NOT NULL,                  -- YYYY-MM-DD in user's local time
  -- Whoop daily summary metrics
  strain real,                        -- 0-21 scale
  recovery_pct integer,               -- 0-100
  hrv_ms real,                        -- root-mean-square HRV
  rhr_bpm integer,                    -- resting heart rate
  kcal real,                          -- estimated total daily energy expenditure
  respiratory_rate_bpm real,
  -- Provenance
  whoop_cycle_id bigint,              -- the upstream id, for dedup + webhook reconciliation
  fetched_at bigint NOT NULL DEFAULT (extract(epoch from now()) * 1000),
  PRIMARY KEY (user_id, day)
);

CREATE INDEX IF NOT EXISTS whoop_cycles_user_day_idx ON whoop_cycles (user_id, day DESC);

CREATE TABLE IF NOT EXISTS whoop_workouts (
  id text PRIMARY KEY,                -- our own id; whoop_workout_id stored separately for clarity
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  whoop_workout_id bigint,            -- upstream id, unique per user
  started_at bigint NOT NULL,         -- ms epoch
  ended_at bigint NOT NULL,
  sport_name text,                    -- 'running', 'strength', 'padel', etc.
  strain real,
  kcal real,
  hr_zone_seconds integer[],          -- per Whoop: [Z1, Z2, Z3, Z4, Z5] in seconds
  avg_hr integer,
  max_hr integer,
  fetched_at bigint NOT NULL DEFAULT (extract(epoch from now()) * 1000)
);

CREATE INDEX IF NOT EXISTS whoop_workouts_user_start_idx ON whoop_workouts (user_id, started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS whoop_workouts_user_upstream_idx
  ON whoop_workouts (user_id, whoop_workout_id) WHERE whoop_workout_id IS NOT NULL;

-- RLS: same defense-in-depth pattern as the rest of the schema.
ALTER TABLE whoop_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE whoop_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE whoop_workouts ENABLE ROW LEVEL SECURITY;

-- whoop_connections: SELECT only (no client-side INSERT/UPDATE/DELETE —
-- the connection routes use service_role for token handling).
CREATE POLICY whoop_connections_select_own ON whoop_connections
  FOR SELECT USING (user_id = auth.uid());

-- whoop_cycles, whoop_workouts: read-only to the user.
CREATE POLICY whoop_cycles_select_own ON whoop_cycles
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY whoop_workouts_select_own ON whoop_workouts
  FOR SELECT USING (user_id = auth.uid());
