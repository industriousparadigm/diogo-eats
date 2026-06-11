// Display formatting for strength numbers — pure functions, testable.
//
// One vocabulary across overview, picker, and entry screens:
//   weight_reps      — "32kg × 12"
//   bodyweight_reps  — "12 reps" (series joined with " · ")
//   carry            — "16kg × 60 steps" (kg is per hand)

import type {
  Beat,
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

// A single beat as a short scoreboard phrase, e.g. "39 → 41kg",
// "24 → 30 reps", "12 → 24 reps @ 32kg" (loud register; the verb/exercise
// name is rendered around it by the caller).
export function fmtBeat(beat: Beat): string {
  switch (beat.kind) {
    case "weight":
      return `${beat.from} → ${fmtKg(beat.to)}`;
    case "total_reps":
      return `${beat.from} → ${beat.to} reps`;
    case "reps_at_weight":
      return `${beat.from} → ${beat.to} reps @ ${fmtKg(beat.at_weight_kg ?? 0)}`;
    case "steps_at_weight":
      return `${beat.from} → ${beat.to} steps @ ${fmtKg(beat.at_weight_kg ?? 0)}`;
    default:
      return `${beat.from} → ${beat.to}`;
  }
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

// The stat-strip's "last session" cell value. A compact "10 Jun" (no
// weekday — the strip is tight and the number, not the day-name, is the
// point); an em-free "none yet" when the user has never logged. Pass the
// `lastSessionAt` from strengthStats (null = no sessions).
export function fmtLastSession(ms: number | null): string {
  if (ms == null) return "none yet";
  return new Date(ms).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

// "Tue 10 Jun · 18:00" for the session-detail header.
export function fmtSessionDateTime(ms: number): string {
  const d = new Date(ms);
  const date = d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} · ${time}`;
}

// Units for the entry screen, by measurement type.
export function repsUnit(type: MeasurementType): string {
  return type === "carry" ? "steps" : "reps";
}

export function weightUnit(type: MeasurementType): string {
  return type === "carry" ? "kg / hand" : "kg";
}

// Plain-language label for a measurement type — the same wording the
// add-new form uses, reused on the alternatives sheet's "or add:" cards so
// a suggested new exercise reads in human terms, not a raw enum.
export function fmtMeasurementType(type: MeasurementType): string {
  if (type === "bodyweight_reps") return "bodyweight reps";
  if (type === "carry") return "carry: kg per hand + steps";
  return "weight × reps";
}
