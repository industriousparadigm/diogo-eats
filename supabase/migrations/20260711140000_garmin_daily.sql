-- Daily Garmin wellness rollup: a lightweight Whoop-cycle analog.
-- One row per user per local day. Strain (0-21) and recovery (sleep score) are
-- computed at pull time by the residential-IP Garmin pull (garminconnect); the app
-- only reads this table. Day grain + RLS mirror whoop_cycles.
create table if not exists public.garmin_daily (
  user_id uuid not null,
  day text not null,
  strain numeric,
  recovery int,
  resting_hr int,
  sleep_hours numeric,
  sleep_score int,
  intensity_moderate_min int,
  intensity_vigorous_min int,
  intensity_load int,
  body_battery_drained int,
  body_battery_high int,
  body_battery_low int,
  steps int,
  active_kcal int,
  max_hr int,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.garmin_daily enable row level security;

drop policy if exists "garmin_daily_select_own" on public.garmin_daily;
create policy "garmin_daily_select_own" on public.garmin_daily
  for select using (user_id = auth.uid());
