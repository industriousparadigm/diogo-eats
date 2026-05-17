-- Phase 1 tightening, runs AFTER the backfill script has stamped every
-- existing row with Diogo's user_id. Locks in the multi-tenant
-- invariants: user_id NOT NULL everywhere, food_memory PK becomes
-- (user_id, name_key) so each user has their own memory.

-- meals: every row now owned by someone.
ALTER TABLE meals ALTER COLUMN user_id SET NOT NULL;

-- food_memory: every row owned + composite PK so the same food name
-- can coexist across users with different per-100g values.
ALTER TABLE food_memory ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE food_memory DROP CONSTRAINT food_memory_pkey;
ALTER TABLE food_memory ADD CONSTRAINT food_memory_pkey PRIMARY KEY (user_id, name_key);

-- The old single-key upsert RPC is now defunct — all callers must move
-- to upsert_food_memory_v2. Drop it so a stale call surfaces loudly
-- rather than silently writing rows that violate the new PK.
DROP FUNCTION IF EXISTS upsert_food_memory(text, text, integer, text, bigint);
