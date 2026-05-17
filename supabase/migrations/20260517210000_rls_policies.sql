-- RLS policies: each user can only access their own rows. Defense in
-- depth — the application layer already filters by user_id via
-- requireUser() + per-call user_id args. These policies make sure that
-- IF anyone ever uses the anon key against this DB, they still can't
-- see anyone else's data.
--
-- Service role continues to bypass RLS, so cron/admin scripts and
-- legacy backfills aren't affected.

-- meals
CREATE POLICY meals_select_own ON meals
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY meals_insert_own ON meals
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY meals_update_own ON meals
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY meals_delete_own ON meals
  FOR DELETE USING (user_id = auth.uid());

-- food_memory
CREATE POLICY food_memory_select_own ON food_memory
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY food_memory_insert_own ON food_memory
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY food_memory_update_own ON food_memory
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY food_memory_delete_own ON food_memory
  FOR DELETE USING (user_id = auth.uid());

-- user_profiles
CREATE POLICY user_profiles_select_own ON user_profiles
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY user_profiles_insert_own ON user_profiles
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY user_profiles_update_own ON user_profiles
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- usage_events: append-only from the user's perspective. No update or
-- delete by the user; service role can prune if ever needed.
CREATE POLICY usage_events_select_own ON usage_events
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY usage_events_insert_own ON usage_events
  FOR INSERT WITH CHECK (user_id = auth.uid());
