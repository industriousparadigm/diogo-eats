-- Whoop v2 returns workout ids as UUID strings, not bigints. Fix the
-- column type so the upsert doesn't silently fail. Cycle ids remain
-- numeric in v2 so no change there.

ALTER TABLE whoop_workouts DROP CONSTRAINT IF EXISTS whoop_workouts_pkey CASCADE;
DROP INDEX IF EXISTS whoop_workouts_user_upstream_idx;
ALTER TABLE whoop_workouts ALTER COLUMN whoop_workout_id TYPE text
  USING whoop_workout_id::text;
ALTER TABLE whoop_workouts ADD PRIMARY KEY (id);
CREATE UNIQUE INDEX whoop_workouts_user_upstream_idx
  ON whoop_workouts (user_id, whoop_workout_id) WHERE whoop_workout_id IS NOT NULL;
