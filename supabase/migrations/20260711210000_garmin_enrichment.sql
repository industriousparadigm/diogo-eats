-- Richer Garmin data + the columns needed to enrich (not duplicate) manual entries.
-- activities: Garmin's post-workout RPE + feel + training effect (all nullable,
-- only populated for workouts Garmin measured).
alter table public.activities add column if not exists rpe smallint;             -- Garmin directWorkoutRpe, 0-100
alter table public.activities add column if not exists feel smallint;            -- Garmin directWorkoutFeel, 0-100
alter table public.activities add column if not exists training_effect real;     -- Garmin aerobic training effect, 0-5

-- strength_sessions: let a Garmin gym session enrich the manual scoreboard entry
-- (one gym per day; manual is canonical, Garmin adds the measured numbers).
alter table public.strength_sessions add column if not exists source text not null default 'manual';
alter table public.strength_sessions add column if not exists avg_hr smallint;
alter table public.strength_sessions add column if not exists max_hr smallint;
alter table public.strength_sessions add column if not exists kcal integer;
alter table public.strength_sessions add column if not exists strain real;
alter table public.strength_sessions add column if not exists garmin_activity_id text;  -- which Garmin gym enriched/created it (dedupe re-runs)
