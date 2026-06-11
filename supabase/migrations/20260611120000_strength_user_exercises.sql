-- User-created exercises (11 Jun 2026). The strength catalog stops being
-- a fixed seeded five and becomes free-growth: a user can add their own
-- exercise (a machine the gym has that we didn't seed) and it flows
-- through the same overview/picker/prefill machinery as the seeded ones.
--
-- Additive + idempotent. Two column changes on strength_exercises:
--   created_by — NULL = seeded catalog (shared, every user sees it);
--                a uuid = a user-created exercise, owned by that user.
--   image_key  — was text NOT NULL (a bundled mobile asset key). User
--                exercises have no bundled image, so the column becomes
--                nullable: NULL = "no asset, render a placeholder". Chosen
--                over a 'none' sentinel because a sentinel would lie about
--                the row having an image and force every reader to special-
--                case the magic string; NULL is the honest absence.

ALTER TABLE strength_exercises
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE strength_exercises
  ALTER COLUMN image_key DROP NOT NULL;

-- The seeded five predate created_by; they're the shared catalog, so they
-- stay NULL (the column default). Nothing to backfill — IF NOT EXISTS left
-- them NULL on add. This UPDATE is a documented no-op guard in case a prior
-- partial run set them to something non-NULL.
-- (intentionally none — additive only)

-- RLS: the catalog stays readable by any signed-in user (seeded + every
-- user's own + other users' — the catalog is shared by design, same as
-- before: a user adding "hack squat" makes it available to all). Add an
-- INSERT policy so a signed-in user can create an exercise, but only one
-- stamped with their own uid in created_by (can't forge a row as another
-- user, can't insert a seeded NULL-owner row). No update/delete policy:
-- v1 has no user-facing edit/remove of exercises (service role handles
-- maintenance, as with sessions/sets).
DROP POLICY IF EXISTS strength_exercises_insert_own ON strength_exercises;
CREATE POLICY strength_exercises_insert_own ON strength_exercises
  FOR INSERT WITH CHECK (created_by = auth.uid());
