// Highlights engine — deterministic stat generators that run at session
// complete. Each generator fires with a ready-to-render line or stays
// silent. "Beats today" is always present; up to 3 highest-priority
// others follow. All arithmetic, no AI.
//
// Calendar concepts ("3rd session this week", rest gaps) bucket
// timestamps through lib/tz.ts (Europe/Lisbon) — Vercel runs UTC and
// server-local Date math is a known, already-fixed bug class here.
// Week starts Monday (see dates.ts).

import { tzYmd } from "../tz";
import { diffDaysYmd, monthNameOfYmd, ordinal, weekStartYmd } from "./dates";
import { computeSessionBeats, sortSessions } from "./engine";
import type {
  Beat,
  Exercise,
  Highlight,
  StrengthSession,
  StrengthSet,
} from "./types";

// How many non-beats highlights to show.
const MAX_SECONDARY = 3;

// Priorities (lower = shown higher). Beats is always first.
const PRIORITY = {
  beats: 0,
  rest_gap: 1,
  streak: 1, // mutually exclusive with rest_gap
  frequency: 2,
  next_target: 3,
} as const;

// Progression constants (spec section 10 + the day-1 numbers):
// when every series at the top weight reaches the rep ceiling, suggest
// one modest weight step; otherwise the lowest-hanging beat is one more
// rep at the same weight. Steps move in tens — +1 step is noise.
const REP_CEILING = 12;
const STEP_CEILING = 60;
const WEIGHT_INCREMENT_KG = 2;
const STEPS_INCREMENT = 10;

export function fmtKg(kg: number): string {
  return Number.isInteger(kg) ? String(kg) : String(Math.round(kg * 10) / 10);
}

type Ctx = {
  exercises: Exercise[];
  prior: StrengthSession[]; // sorted ascending, everything before `session`
  session: StrengthSession;
  beats: Beat[];
};

// ---- beats today (always shown) ----

function beatDetail(beat: Beat, name: string): string {
  const n = name.toLowerCase();
  switch (beat.kind) {
    case "weight":
      return `${n} ${fmtKg(beat.from)}→${fmtKg(beat.to)}kg`;
    case "reps_at_weight":
      return `${n} ${beat.to} reps at ${fmtKg(beat.at_weight_kg ?? 0)}kg (was ${beat.from})`;
    case "total_reps":
      return `${n} ${beat.to} reps (was ${beat.from})`;
    case "steps_at_weight":
      return `${n} ${beat.to} steps at ${fmtKg(beat.at_weight_kg ?? 0)}kg (was ${beat.from})`;
  }
}

function beatsLine(ctx: Ctx): Highlight {
  const nameById = new Map(ctx.exercises.map((e) => [e.id, e.name]));
  let line: string;
  if (ctx.prior.length === 0) {
    line = "First session on the board. Every number from here is a target.";
  } else if (ctx.beats.length === 0) {
    line = "All numbers held. Consolidation day.";
  } else {
    const details = ctx.beats
      .map((b) => beatDetail(b, nameById.get(b.exercise_id) ?? b.exercise_id))
      .join(", ");
    const n = ctx.beats.length;
    line = `You beat ${n} ${n === 1 ? "number" : "numbers"}: ${details}.`;
  }
  return { id: "beats", line, priority: PRIORITY.beats, beats: ctx.beats };
}

// ---- frequency: "3rd session this week" / "5th session in June" ----
// The week line fires from the 2nd session of the week; otherwise the
// month line fires from the 2nd of the month. A "1st session this week"
// line is dead air — stay silent instead.

function frequency(ctx: Ctx): Highlight | null {
  const day = tzYmd(ctx.session.completed_at);
  const week = weekStartYmd(day);
  const all = [...ctx.prior, ctx.session];

  const weekCount = all.filter(
    (s) => weekStartYmd(tzYmd(s.completed_at)) === week
  ).length;
  if (weekCount >= 2) {
    return {
      id: "frequency",
      line: `${ordinal(weekCount)} session this week.`,
      priority: PRIORITY.frequency,
    };
  }

  const month = day.slice(0, 7);
  const monthCount = all.filter(
    (s) => tzYmd(s.completed_at).slice(0, 7) === month
  ).length;
  if (monthCount >= 2) {
    return {
      id: "frequency",
      line: `${ordinal(monthCount)} session in ${monthNameOfYmd(day)}.`,
      priority: PRIORITY.frequency,
    };
  }
  return null;
}

// ---- rest-gap greeter: calendar-day gap of 3+ since the last session ----

function restGap(ctx: Ctx): Highlight | null {
  const prev = ctx.prior[ctx.prior.length - 1];
  if (!prev) return null;
  const gap = diffDaysYmd(tzYmd(prev.completed_at), tzYmd(ctx.session.completed_at));
  if (gap < 3) return null;
  return {
    id: "rest_gap",
    line: `Welcome back after ${gap} days off.`,
    priority: PRIORITY.rest_gap,
  };
}

// ---- improvement streak: trailing sessions (incl. today) with ≥1 beat ----
// Fires from 2 — "1st session in a row" is not a streak.

function streak(ctx: Ctx): Highlight | null {
  if (ctx.beats.length === 0) return null;
  let count = 1;
  for (let i = ctx.prior.length - 1; i >= 0; i--) {
    const beats = computeSessionBeats(
      ctx.exercises,
      ctx.prior.slice(0, i),
      ctx.prior[i]
    );
    if (beats.length === 0) break;
    count++;
  }
  if (count < 2) return null;
  return {
    id: "streak",
    line: `${ordinal(count)} session in a row with at least one beat.`,
    priority: PRIORITY.streak,
  };
}

// ---- next target: the lowest-hanging beat for next time ----

type Target = {
  exercise: Exercise;
  // 1 = a reps/steps nudge (easiest), 2 = a weight step.
  cost: number;
  line: string;
};

function targetForExercise(
  exercise: Exercise,
  latestSets: StrengthSet[]
): Target | null {
  if (latestSets.length === 0) return null;
  const name = exercise.name.toLowerCase();

  if (exercise.measurement_type === "bodyweight_reps") {
    return {
      exercise,
      cost: 1,
      line: `Next time: one more rep on ${name} is there for the taking.`,
    };
  }

  const w = latestSets.reduce((m, s) => Math.max(m, s.weight_kg ?? 0), 0);
  const atMax = latestSets.filter((s) => (s.weight_kg ?? 0) === w);

  if (exercise.measurement_type === "carry") {
    const ready = atMax.every((s) => s.reps >= STEP_CEILING);
    return ready
      ? {
          exercise,
          cost: 2,
          line: `Next time: ${fmtKg(w + WEIGHT_INCREMENT_KG)}kg ${name} is there for the taking.`,
        }
      : {
          exercise,
          cost: 1,
          line: `Next time: ${STEPS_INCREMENT} more steps at ${fmtKg(w)}kg on ${name} is there for the taking.`,
        };
  }

  // weight_reps: every series at the top weight hit the ceiling → one
  // modest weight step (never two); otherwise one more rep at that weight.
  const ready = atMax.every((s) => s.reps >= REP_CEILING);
  return ready
    ? {
        exercise,
        cost: 2,
        line: `Next time: ${fmtKg(w + WEIGHT_INCREMENT_KG)}kg ${name} is there for the taking.`,
      }
    : {
        exercise,
        cost: 1,
        line: `Next time: one more rep at ${fmtKg(w)}kg on ${name} is there for the taking.`,
      };
}

function nextTarget(ctx: Ctx): Highlight | null {
  const all = sortSessions([...ctx.prior, ctx.session]);
  const targets: Target[] = [];
  for (const exercise of ctx.exercises) {
    // Latest numbers per exercise — today's when done today.
    for (let i = all.length - 1; i >= 0; i--) {
      const sets = all[i].sets
        .filter((s) => s.exercise_id === exercise.id)
        .sort((a, b) => a.series_index - b.series_index);
      if (sets.length > 0) {
        const t = targetForExercise(exercise, sets);
        if (t) targets.push(t);
        break;
      }
    }
  }
  if (targets.length === 0) return null;
  targets.sort(
    (a, b) =>
      a.cost - b.cost || a.exercise.sort_order - b.exercise.sort_order
  );
  return { id: "next_target", line: targets[0].line, priority: PRIORITY.next_target };
}

// ---- entry point ----

// `history` = every completed session EXCLUDING the one being completed.
// Returns: beats line first, then up to MAX_SECONDARY others by priority.
// Rest-gap and streak are mutually exclusive; when both are true the
// rest-gap greeter wins ("in a row" reads wrong right after days off).
export function generateHighlights(
  exercises: Exercise[],
  history: StrengthSession[],
  session: StrengthSession
): Highlight[] {
  const prior = sortSessions(history);
  const beats = computeSessionBeats(exercises, prior, session);
  const ctx: Ctx = { exercises, prior, session, beats };

  const gap = restGap(ctx);
  const secondary = [gap ?? streak(ctx), frequency(ctx), nextTarget(ctx)]
    .filter((h): h is Highlight => h !== null)
    .sort((a, b) => a.priority - b.priority)
    .slice(0, MAX_SECONDARY);

  return [beatsLine(ctx), ...secondary];
}
