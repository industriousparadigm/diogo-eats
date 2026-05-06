-- Eats v1 schema. Mirrors the SQLite schema we've been running locally so
-- the code change is mechanical: same column names, same shapes, just
-- swapping the driver from better-sqlite3 to supabase-js.
--
-- Storage: photos live in a private 'photos' bucket (created separately via
-- the storage API or dashboard). DB only stores filenames.
--
-- Auth model for v1: there's no client-side direct DB access. All reads and
-- writes go through Next.js API routes using the service_role key, which
-- bypasses RLS. We still ENABLE RLS on the tables (with no policies) so
-- the anon key cannot accidentally read user data if the URL is exposed.

CREATE TABLE meals (
  id text PRIMARY KEY,
  created_at bigint NOT NULL,
  photo_filename text,
  items_json text NOT NULL,
  sat_fat_g real NOT NULL DEFAULT 0,
  soluble_fiber_g real NOT NULL DEFAULT 0,
  calories real NOT NULL DEFAULT 0,
  protein_g real NOT NULL DEFAULT 0,
  plant_pct real NOT NULL DEFAULT 0,
  notes text,
  caption text,
  meal_vibe text
);

CREATE INDEX meals_created_at_idx ON meals (created_at DESC);

CREATE TABLE food_memory (
  name_key text PRIMARY KEY,
  display_name text NOT NULL,
  is_plant integer NOT NULL,
  per_100g_json text NOT NULL,
  times_seen integer NOT NULL DEFAULT 1,
  last_seen bigint NOT NULL
);

CREATE INDEX food_memory_last_seen_idx ON food_memory (last_seen DESC);

ALTER TABLE meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_memory ENABLE ROW LEVEL SECURITY;
