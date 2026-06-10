-- Foods library: promote food_memory from an invisible auto-recognition
-- table into a first-class, browsable, editable library.
--
-- Additive + idempotent. The composite PK (user_id, name_key) already
-- exists (20260517200000_multiuser_tighten.sql) — every row has a stable
-- identity, so no PK change is needed.

-- provenance: where the nutrition data came from, in increasing
-- authority. 'ai_inferred' = a parse guessed it; 'user_corrected' = the
-- user reviewed/saved a meal containing it (or edited it directly);
-- 'label_verified' = read off a nutrition label (most authoritative).
ALTER TABLE food_memory
  ADD COLUMN IF NOT EXISTS provenance text NOT NULL DEFAULT 'ai_inferred';

-- The CHECK is added separately + guarded so re-running the migration
-- doesn't error on an already-present constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'food_memory_provenance_check'
  ) THEN
    ALTER TABLE food_memory
      ADD CONSTRAINT food_memory_provenance_check
      CHECK (provenance IN ('label_verified', 'user_corrected', 'ai_inferred'));
  END IF;
END $$;

-- Backfill: every row that existed before this migration is there because
-- the user saved/corrected a meal containing it — that is exactly
-- 'user_corrected'. Only touch rows still on the column default so a
-- re-run is a no-op.
UPDATE food_memory
  SET provenance = 'user_corrected'
  WHERE provenance = 'ai_inferred';

-- Optional portion presets, e.g. [{"label":"1 slice","grams":30}].
-- Nullable, no UI requirement this stage — just reserving the shape so a
-- later "quick portion" surface lights up without a migration.
ALTER TABLE food_memory
  ADD COLUMN IF NOT EXISTS portion_presets jsonb;

-- Bump the per-user upsert RPC to set provenance. Meal-save upserts
-- represent a user validation, so they set 'user_corrected' — EXCEPT they
-- must never downgrade a 'label_verified' entry (label data outranks a
-- meal-save inference). New rows from this path are 'user_corrected'.
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
  INSERT INTO food_memory (user_id, name_key, display_name, is_plant, per_100g_json, times_seen, last_seen, provenance)
  VALUES (p_user_id, p_name_key, p_display_name, p_is_plant, p_per_100g_json, 1, p_last_seen, 'user_corrected')
  ON CONFLICT (user_id, name_key) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        is_plant = EXCLUDED.is_plant,
        per_100g_json = EXCLUDED.per_100g_json,
        times_seen = food_memory.times_seen + 1,
        last_seen = EXCLUDED.last_seen,
        provenance = CASE
          WHEN food_memory.provenance = 'label_verified' THEN 'label_verified'
          ELSE 'user_corrected'
        END;
END $$;
