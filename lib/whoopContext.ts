// Whoop → prompt context. Two consumers:
//   - Vision parse/parse-text/talk: pure-text block injected ABOVE the
//     user's caption so per-meal notes can reference training when
//     relevant.
//   - DailyHeadline + future home surfaces: structured summary the
//     rule-based headline uses to decide whether to add a training
//     mention.
//
// Pure (no DB / no HTTP) — DB lookup happens in the route. That keeps
// this trivially unit-testable.

export type CycleRow = {
  day: string; // YYYY-MM-DD
  strain: number | null;
  recovery_pct: number | null;
  hrv_ms: number | null;
  rhr_bpm: number | null;
  kcal: number | null;
};

export type WorkoutRow = {
  started_at: number; // ms epoch
  ended_at: number;
  sport_name: string | null;
  strain: number | null;
  kcal: number | null;
};

export type TrainingSummary = {
  hasData: boolean;
  today?: {
    strain: number | null;
    recovery_pct: number | null;
    strainTier: "rest" | "moderate" | "high" | "very_high" | null;
    recoveryTier: "low" | "amber" | "green" | null;
    kcalBurn: number | null;
    workouts: { sport: string; strain: number | null; minutes: number; kcal: number | null }[];
  };
  yesterday?: {
    strain: number | null;
    strainTier: "rest" | "moderate" | "high" | "very_high" | null;
  };
};

// Whoop's official tiers: 0-9 light, 10-13 moderate, 14-17 strenuous,
// 18-21 all-out. We collapse to four labels for readability.
export function strainTier(s: number | null): TrainingSummary["today"] extends infer T
  ? T extends { strainTier: infer R }
    ? R
    : never
  : never {
  if (s == null) return null as any;
  if (s < 10) return "rest" as any;
  if (s < 14) return "moderate" as any;
  if (s < 18) return "high" as any;
  return "very_high" as any;
}

// Whoop recovery: 0-33 red, 34-66 yellow, 67-100 green.
export function recoveryTier(r: number | null): TrainingSummary["today"] extends infer T
  ? T extends { recoveryTier: infer R }
    ? R
    : never
  : never {
  if (r == null) return null as any;
  if (r < 34) return "low" as any;
  if (r < 67) return "amber" as any;
  return "green" as any;
}

export function buildTrainingSummary(
  todayYmd: string,
  yesterdayYmd: string,
  cycles: CycleRow[],
  todayWorkouts: WorkoutRow[]
): TrainingSummary {
  const today = cycles.find((c) => c.day === todayYmd);
  const yesterday = cycles.find((c) => c.day === yesterdayYmd);
  const hasData = !!today || !!yesterday;
  if (!hasData) return { hasData: false };

  return {
    hasData: true,
    today: today
      ? {
          strain: today.strain,
          recovery_pct: today.recovery_pct,
          strainTier: strainTier(today.strain),
          recoveryTier: recoveryTier(today.recovery_pct),
          kcalBurn: today.kcal,
          workouts: todayWorkouts.map((w) => ({
            sport: (w.sport_name ?? "workout").replace(/-/g, " "),
            strain: w.strain,
            minutes: Math.max(0, Math.round((w.ended_at - w.started_at) / 60_000)),
            kcal: w.kcal,
          })),
        }
      : undefined,
    yesterday: yesterday
      ? {
          strain: yesterday.strain,
          strainTier: strainTier(yesterday.strain),
        }
      : undefined,
  };
}

// Plain-text block for Vision prompts. Returns empty string when there's
// nothing useful to say, so callers can blindly concat without adding an
// empty section. Kept terse so it doesn't dominate the prompt.
export function trainingPromptBlock(s: TrainingSummary): string {
  if (!s.hasData) return "";
  const lines: string[] = ["**User's training context (Whoop, today):**"];

  if (s.today) {
    const t = s.today;
    const parts: string[] = [];
    if (t.strain != null)
      parts.push(`strain ${t.strain.toFixed(1)} (${tierLabel(t.strainTier)})`);
    if (t.recovery_pct != null)
      parts.push(`recovery ${t.recovery_pct}% (${recoveryLabel(t.recoveryTier)})`);
    if (t.kcalBurn != null) parts.push(`~${Math.round(t.kcalBurn)} kcal burn so far`);
    if (parts.length > 0) lines.push(`- ${parts.join(" · ")}`);

    if (t.workouts.length > 0) {
      const wt = t.workouts
        .map(
          (w) =>
            `${w.sport} ${w.minutes}min${w.strain != null ? ` (strain ${w.strain.toFixed(1)})` : ""}${w.kcal != null ? ` ~${Math.round(w.kcal)} kcal` : ""}`
        )
        .join(", ");
      lines.push(`- workouts: ${wt}`);
    }
  }
  if (s.yesterday?.strain != null) {
    lines.push(
      `- yesterday: strain ${s.yesterday.strain.toFixed(1)} (${tierLabel(s.yesterday.strainTier)})`
    );
  }

  lines.push("");
  lines.push(
    "Use this context ONLY when it's genuinely relevant to the meal you're parsing. Examples: a post-workout meal with good protein → mention it. A recovery-supportive meal on a low-recovery day → mention it. A modest meal on a heavy-strain day → flag undereating concern in the notes. Do NOT shoehorn — silence is fine. Never moralize."
  );
  return lines.join("\n");
}

function tierLabel(t: string | null): string {
  switch (t) {
    case "rest":
      return "low / rest";
    case "moderate":
      return "moderate";
    case "high":
      return "high";
    case "very_high":
      return "very high";
    default:
      return "unknown";
  }
}

function recoveryLabel(t: string | null): string {
  switch (t) {
    case "low":
      return "red — undertrained or undersleeping";
    case "amber":
      return "yellow — middling";
    case "green":
      return "green — well-recovered";
    default:
      return "unknown";
  }
}

// Short headline-suffix for the home DailyHeadline. Returns null when
// no training mention is warranted. Rule-based and terse so it composes
// with the existing headline string.
export function trainingHeadlineSuffix(s: TrainingSummary): string | null {
  if (!s.hasData || !s.today) return null;
  const t = s.today;

  // Prioritise the loudest signal.
  if (t.strainTier === "very_high") {
    const sport = t.workouts[0]?.sport;
    return sport ? `after a very-high-strain ${sport}` : "after a very-high-strain day";
  }
  if (t.recoveryTier === "low") return "low recovery today — fuel kindly";
  if (t.strainTier === "high") {
    const sport = t.workouts[0]?.sport;
    return sport ? `after a heavy ${sport}` : "high-strain day";
  }
  if (t.strainTier === "moderate" && t.workouts.length > 0) {
    return `with a ${t.workouts[0].sport} earlier`;
  }
  if (t.recoveryTier === "green" && t.strainTier === "rest") {
    return "well-recovered rest day";
  }
  return null;
}
