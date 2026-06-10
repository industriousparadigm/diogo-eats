// Typed strength fixtures — the day-1 baseline from the spec, shaped
// exactly like GET /api/strength/overview. Used by tests, and served at
// runtime only when EXPO_PUBLIC_STRENGTH_MOCK=1 (development before the
// strength backend reached prod). Never active in published bundles.

import type {
  CompleteSessionResult,
  Exercise,
  SessionDetail,
  SessionPayload,
  StrengthOverview,
} from "./strengthTypes";

export const FIXTURE_EXERCISES: Exercise[] = [
  {
    id: "leg-press",
    name: "Leg press",
    description:
      "Feet mid-platform, shoulder-width. Lower slow, push. Don't snap knees straight.",
    measurement_type: "weight_reps",
    image_key: "leg-press",
    sort_order: 1,
  },
  {
    id: "back-extension",
    name: "Back extension",
    description:
      "Arms crossed. Bow down, lift to a straight line (not beyond), squeeze the butt.",
    measurement_type: "bodyweight_reps",
    image_key: "back-extension",
    sort_order: 2,
  },
  {
    id: "chest-press",
    name: "Chest press",
    description: "Handles at mid-chest. Push out, return slow, don't lock elbows.",
    measurement_type: "weight_reps",
    image_key: "chest-press",
    sort_order: 3,
  },
  {
    id: "seated-row",
    name: "Seated row",
    description: "Sit tall, pull to belly, squeeze shoulder blades. No yanking.",
    measurement_type: "weight_reps",
    image_key: "seated-row",
    sort_order: 4,
  },
  {
    id: "farmers-carry",
    name: "Farmer's carry",
    description: "Heavy-ish dumbbell each hand. Stand tall, walk, turn, walk back.",
    measurement_type: "carry",
    image_key: "farmers-carry",
    sort_order: 5,
  },
];

// 10 Jun 2026, 18:00 local-ish — the real first gym session.
const DAY1_COMPLETED_AT = new Date("2026-06-10T18:00:00").getTime();
const DAY1_SESSION_ID = "fixture-day1";

export function mockStrengthOverview(): StrengthOverview {
  return {
    exercises: FIXTURE_EXERCISES,
    picker_order: [
      "leg-press",
      "back-extension",
      "chest-press",
      "seated-row",
      "farmers-carry",
    ],
    states: [
      {
        exercise_id: "leg-press",
        last: {
          session_id: DAY1_SESSION_ID,
          completed_at: DAY1_COMPLETED_AT,
          series: [
            { weight_kg: 32, reps: 12 },
            { weight_kg: 39, reps: 12 },
          ],
        },
        best: { kind: "weight", weight_kg: 39, reps: 12 },
        prefill: {
          series: [
            { weight_kg: 32, reps: 12 },
            { weight_kg: 39, reps: 12 },
          ],
          never_done: false,
        },
      },
      {
        exercise_id: "back-extension",
        last: {
          session_id: DAY1_SESSION_ID,
          completed_at: DAY1_COMPLETED_AT,
          series: [
            { weight_kg: null, reps: 12 },
            { weight_kg: null, reps: 12 },
          ],
        },
        best: { kind: "total_reps", reps: 24 },
        prefill: {
          series: [
            { weight_kg: null, reps: 12 },
            { weight_kg: null, reps: 12 },
          ],
          never_done: false,
        },
      },
      {
        exercise_id: "chest-press",
        last: {
          session_id: DAY1_SESSION_ID,
          completed_at: DAY1_COMPLETED_AT,
          series: [
            { weight_kg: 32, reps: 12 },
            { weight_kg: 32, reps: 12 },
          ],
        },
        best: { kind: "weight", weight_kg: 32, reps: 12 },
        prefill: {
          series: [
            { weight_kg: 32, reps: 12 },
            { weight_kg: 32, reps: 12 },
          ],
          never_done: false,
        },
      },
      {
        exercise_id: "seated-row",
        last: {
          session_id: DAY1_SESSION_ID,
          completed_at: DAY1_COMPLETED_AT,
          series: [
            { weight_kg: 25, reps: 12 },
            { weight_kg: 32, reps: 12 },
          ],
        },
        best: { kind: "weight", weight_kg: 32, reps: 12 },
        prefill: {
          series: [
            { weight_kg: 25, reps: 12 },
            { weight_kg: 32, reps: 12 },
          ],
          never_done: false,
        },
      },
      {
        exercise_id: "farmers-carry",
        last: {
          session_id: DAY1_SESSION_ID,
          completed_at: DAY1_COMPLETED_AT,
          series: [
            { weight_kg: 16, reps: 60 },
            { weight_kg: 16, reps: 60 },
          ],
        },
        best: { kind: "weight", weight_kg: 16, reps: 60 },
        prefill: {
          series: [
            { weight_kg: 16, reps: 60 },
            { weight_kg: 16, reps: 60 },
          ],
          never_done: false,
        },
      },
    ],
    sessions: [
      {
        id: DAY1_SESSION_ID,
        started_at: DAY1_COMPLETED_AT - 50 * 60 * 1000,
        completed_at: DAY1_COMPLETED_AT,
        note: "10min warmup run, 22min run after, ~10min banho turco.",
        exercise_ids: [
          "leg-press",
          "back-extension",
          "chest-press",
          "seated-row",
          "farmers-carry",
        ],
        beats_count: 0,
      },
    ],
  };
}

// The day-1 baseline session in full — the sets the overview's `last`
// numbers come from, expanded to StrengthSet shape (logged order).
export function mockSessionDetail(_id: string): SessionDetail {
  return {
    session: {
      id: DAY1_SESSION_ID,
      started_at: DAY1_COMPLETED_AT - 50 * 60 * 1000,
      completed_at: DAY1_COMPLETED_AT,
      note: "10min warmup run, 22min run after, ~10min banho turco.",
      sets: [
        { exercise_id: "leg-press", series_index: 1, weight_kg: 32, reps: 12 },
        { exercise_id: "leg-press", series_index: 2, weight_kg: 39, reps: 12 },
        { exercise_id: "back-extension", series_index: 1, weight_kg: null, reps: 12 },
        { exercise_id: "back-extension", series_index: 2, weight_kg: null, reps: 12 },
        { exercise_id: "chest-press", series_index: 1, weight_kg: 32, reps: 12 },
        { exercise_id: "chest-press", series_index: 2, weight_kg: 32, reps: 12 },
        { exercise_id: "seated-row", series_index: 1, weight_kg: 25, reps: 12 },
        { exercise_id: "seated-row", series_index: 2, weight_kg: 32, reps: 12 },
        { exercise_id: "farmers-carry", series_index: 1, weight_kg: 16, reps: 60 },
        { exercise_id: "farmers-carry", series_index: 2, weight_kg: 16, reps: 60 },
      ],
    },
    beats: [], // day 1 — nothing before it to beat
  };
}

export function mockCompleteSession(payload: SessionPayload): CompleteSessionResult {
  return {
    session: {
      id: "fixture-completed",
      started_at: payload.started_at,
      completed_at: payload.completed_at,
      note: payload.note,
      sets: payload.sets,
    },
    highlights: [
      {
        id: "beats",
        line: "You beat 2 numbers: leg press 41kg, row 32kg both sets.",
        priority: 1,
        beats: [
          { exercise_id: "leg-press", kind: "weight", from: 39, to: 41 },
          {
            exercise_id: "seated-row",
            kind: "reps_at_weight",
            from: 12,
            to: 24,
            at_weight_kg: 32,
          },
        ],
      },
      { id: "frequency", line: "2nd session in June.", priority: 3 },
      {
        id: "next_target",
        line: "Next time: 34kg chest press is there for the taking.",
        priority: 4,
      },
    ],
  };
}
