-- Whoop strain (0-21) on activities. Nullable: manual rows have no strain
-- (it's a Whoop measurement, not a felt input — effort is the felt field).
-- The whoop importer + future feed set it; it's the Movement tab's headline
-- per-activity metric.
ALTER TABLE activities ADD COLUMN IF NOT EXISTS strain real
  CHECK (strain IS NULL OR (strain >= 0 AND strain <= 21));
