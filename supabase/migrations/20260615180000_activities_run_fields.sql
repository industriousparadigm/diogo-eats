-- Richer activity detail (15 Jun 2026): a run is more than type+duration.
-- surface (road/trail/…), elevation gain, and the source screenshot a
-- Strava-style AI parse was read from. All nullable — every field optional.
ALTER TABLE activities ADD COLUMN IF NOT EXISTS surface text
  CHECK (surface IS NULL OR surface IN ('road','trail','track','treadmill','gravel','indoor','mixed'));
ALTER TABLE activities ADD COLUMN IF NOT EXISTS elevation_m integer
  CHECK (elevation_m IS NULL OR (elevation_m >= 0 AND elevation_m <= 30000));
ALTER TABLE activities ADD COLUMN IF NOT EXISTS photo_filename text;
