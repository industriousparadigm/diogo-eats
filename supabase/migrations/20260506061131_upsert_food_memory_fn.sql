-- Upsert one row in food_memory, incrementing times_seen on conflict.
-- PostgREST's built-in upsert can't do "times_seen = times_seen + 1" with
-- a SET clause that references the existing row, so we wrap it in an RPC.
CREATE OR REPLACE FUNCTION upsert_food_memory(
  p_name_key text,
  p_display_name text,
  p_is_plant integer,
  p_per_100g_json text,
  p_last_seen bigint
) RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO food_memory (name_key, display_name, is_plant, per_100g_json, times_seen, last_seen)
  VALUES (p_name_key, p_display_name, p_is_plant, p_per_100g_json, 1, p_last_seen)
  ON CONFLICT (name_key) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    is_plant = EXCLUDED.is_plant,
    per_100g_json = EXCLUDED.per_100g_json,
    times_seen = food_memory.times_seen + 1,
    last_seen = EXCLUDED.last_seen;
$$;
