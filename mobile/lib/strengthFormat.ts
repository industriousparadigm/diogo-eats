// Display formatting for strength numbers — pure functions, testable.
//
// One vocabulary across overview, picker, and entry screens:
//   weight_reps      — "32kg × 12"
//   bodyweight_reps  — "12 reps" (series joined with " · ")
//   carry            — "16kg × 60 steps" (kg is per hand)

import type {
  ExerciseBest,
  MeasurementType,
  SeriesNumbers,
} from "./strengthTypes";

// Trim trailing zeros: 32 -> "32", 32.5 -> "32.5".
export function fmtKg(weight: number): string {
  return `${parseFloat(weight.toFixed(1))}kg`;
}

export function fmtSeries(s: SeriesNumbers, type: MeasurementType): string {
  if (type === "bodyweight_reps") {
    return `${s.reps} reps`;
  }
  if (type === "carry") {
    return s.weight_kg == null ? `${s.reps} steps` : `${fmtKg(s.weight_kg)} × ${s.reps} steps`;
  }
  return s.weight_kg == null ? `× ${s.reps}` : `${fmtKg(s.weight_kg)} × ${s.reps}`;
}

// All series of a "last time" payload on one line, e.g.
// "32kg × 12 · 39kg × 12". Collapses identical series to "2 × (32kg × 12)".
export function fmtSeriesList(series: SeriesNumbers[], type: MeasurementType): string {
  if (series.length === 0) return "";
  const all = series.map((s) => fmtSeries(s, type));
  const allSame = all.every((s) => s === all[0]);
  if (allSame && series.length > 1) {
    return `${series.length} × (${all[0]})`;
  }
  return all.join("  ·  ");
}

export function fmtBest(best: ExerciseBest, type: MeasurementType): string {
  if (best.kind === "total_reps") {
    return `${best.reps} reps total`;
  }
  if (type === "carry") {
    return `${fmtKg(best.weight_kg)} × ${best.reps} steps`;
  }
  return `${fmtKg(best.weight_kg)} × ${best.reps}`;
}

// "Tue 10 Jun" for the session history list.
export function fmtSessionDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

// Units for the entry screen, by measurement type.
export function repsUnit(type: MeasurementType): string {
  return type === "carry" ? "steps" : "reps";
}

export function weightUnit(type: MeasurementType): string {
  return type === "carry" ? "kg / hand" : "kg";
}
