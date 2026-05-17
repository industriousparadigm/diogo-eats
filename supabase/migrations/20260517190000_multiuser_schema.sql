-- Multi-user foundation (additive). Adds user_id columns + new tables.
-- All columns/constraints are NULL-tolerant so existing rows don't break;
-- a follow-up migration tightens them once data is backfilled.

-- meals: per-row owner
ALTER TABLE meals ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS meals_user_created_at_idx ON meals (user_id, created_at DESC);

-- food_memory: per-row owner. PK migration deferred to follow-up.
ALTER TABLE food_memory ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS food_memory_user_last_seen_idx ON food_memory (user_id, last_seen DESC);

-- user_profiles: per-user settings + onboarding inputs + derived targets.
-- The raw inputs (sex/age/weight/notes) live alongside the derived
-- targets so we can re-derive on profile change without losing the
-- user's stated context.
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  -- Raw profile inputs (all optional — onboarding lets fields be skipped)
  sex text,                       -- 'M' | 'F' | 'X' | null
  age integer,                    -- years
  weight_kg real,                 -- kg
  notes text,                     -- free-form: goals, conditions, dietary prefs
  -- Derived targets (Claude-computed from the inputs, then editable)
  sat_fat_g real NOT NULL DEFAULT 18,
  soluble_fiber_g real NOT NULL DEFAULT 10,
  calories real NOT NULL DEFAULT 2000,
  protein_g real NOT NULL DEFAULT 90,
  -- Onboarding bookkeeping
  onboarded_at bigint,            -- null until profile completes
  created_at bigint NOT NULL DEFAULT (extract(epoch from now()) * 1000),
  updated_at bigint NOT NULL DEFAULT (extract(epoch from now()) * 1000)
);

-- usage_events: per-user activity log (currently used for the Vision
-- daily-quota check; extensible to other counters later).
CREATE TABLE IF NOT EXISTS usage_events (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,             -- 'parse' for Vision calls; future: 'lookup' etc.
  created_at bigint NOT NULL DEFAULT (extract(epoch from now()) * 1000)
);
CREATE INDEX IF NOT EXISTS usage_events_user_kind_created_at_idx
  ON usage_events (user_id, kind, created_at DESC);

-- Enable RLS on the new tables. No policies yet — phase 3 wires them up.
-- All access for now goes via service_role which bypasses RLS.
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;

-- New per-user upsert RPC for food_memory. The old one (keyed by
-- name_key alone) is kept temporarily so existing service-role callers
-- don't break; the route updates land in phase 3.
CREATE OR REPLACE FUNCTION upsert_food_memory_v2(
  p_user_id uuid,
  p_name_key text,
  p_display_name text,
  p_is_plant integer,
  p_per_100g_json text,
  p_last_seen bigint
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO food_memory (user_id, name_key, display_name, is_plant, per_100g_json, times_seen, last_seen)
  VALUES (p_user_id, p_name_key, p_display_name, p_is_plant, p_per_100g_json, 1, p_last_seen)
  ON CONFLICT (user_id, name_key) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        is_plant = EXCLUDED.is_plant,
        per_100g_json = EXCLUDED.per_100g_json,
        times_seen = food_memory.times_seen + 1,
        last_seen = EXCLUDED.last_seen;
END;
$$;
