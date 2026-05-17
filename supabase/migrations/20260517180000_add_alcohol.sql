-- Track alcohol explicitly. Vision now estimates pure-ethanol grams per
-- item (wine ~10g/100mL, beer ~4g/100mL, spirits ~32g/100mL, fortified
-- ~16g/100mL); per-item per_100g.alcohol_g rolls up into this meal-level
-- column the same way other macros do.
--
-- Default 0 so historical rows are valid without backfill at the SQL
-- layer — the actual values are populated by the alcohol-patch script
-- run separately against meals' items_json.

ALTER TABLE meals ADD COLUMN alcohol_g real NOT NULL DEFAULT 0;
