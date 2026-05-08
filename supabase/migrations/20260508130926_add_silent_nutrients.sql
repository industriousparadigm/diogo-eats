-- Capture more nutrients silently. The UI doesn't show salt/carbs/sugar/fat
-- yet, but Vision can return them and we can store them so future surfaces
-- can light up without backfill. Per-item nutrition is in items_json (no
-- DB schema change there); these columns are the meal-level cached totals.

ALTER TABLE meals ADD COLUMN salt_g real NOT NULL DEFAULT 0;
ALTER TABLE meals ADD COLUMN carbs_g real NOT NULL DEFAULT 0;
ALTER TABLE meals ADD COLUMN sugar_g real NOT NULL DEFAULT 0;
ALTER TABLE meals ADD COLUMN fat_g real NOT NULL DEFAULT 0;
