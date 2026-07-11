// Garmin → prompt context. The Garmin replacement for whoopContext (Whoop was
// retired Jul 2026). Feeds the Vision meal-parse prompts a terse training block
// so per-meal notes can reference the day's load when genuinely relevant
// (a good refuel after a hard session; under-fuelling on a heavy-strain day).
//
// Pure (no DB / no HTTP) — the DB lookup lives in garminContextServer. Strain
// is the app's own 0-21 model (garmin_daily.strain); "recovery" is the Garmin
// sleep score (0-100), same scale as Whoop recovery so the tiers carry over.

export type StrainTier = "rest" | "moderate" | "high" | "very_high" | null;
export type RecoveryTier = "low" | "amber" | "green" | null;

export type GarminDailyRow = {
  day: string; // YYYY-MM-DD
  strain: number | null;
  recovery: number | null; // Garmin sleep score 0-100
  active_kcal: number | null;
};

export type GarminActivityRow = {
  type: string;
  label: string | null;
  duration_min: number;
  strain: number | null;
  distance_km: number | null;
};

export type TrainingSummary = {
  hasData: boolean;
  today?: {
    strain: number | null;
    recovery: number | null;
    strainTier: StrainTier;
    recoveryTier: RecoveryTier;
    kcalBurn: number | null;
    activities: { sport: string; strain: number | null; minutes: number; distanceKm: number | null }[];
  };
  yesterday?: {
    strain: number | null;
    strainTier: StrainTier;
  };
};

// Same 0-21 tiers as Whoop's scale (the app's strain model targets it):
// 0-9 light/rest, 10-13 moderate, 14-17 high, 18-21 very high.
export function strainTier(s: number | null): StrainTier {
  if (s == null) return null;
  if (s < 10) return "rest";
  if (s < 14) return "moderate";
  if (s < 18) return "high";
  return "very_high";
}

// Sleep score 0-100: <34 poor, 34-66 middling, 67-100 good.
export function recoveryTier(r: number | null): RecoveryTier {
  if (r == null) return null;
  if (r < 34) return "low";
  if (r < 67) return "amber";
  return "green";
}

export function buildTrainingSummary(
  todayYmd: string,
  yesterdayYmd: string,
  daily: GarminDailyRow[],
  todayActivities: GarminActivityRow[]
): TrainingSummary {
  const today = daily.find((d) => d.day === todayYmd);
  const yesterday = daily.find((d) => d.day === yesterdayYmd);
  if (!today && !yesterday) return { hasData: false };

  return {
    hasData: true,
    today: today
      ? {
          strain: today.strain,
          recovery: today.recovery,
          strainTier: strainTier(today.strain),
          recoveryTier: recoveryTier(today.recovery),
          kcalBurn: today.active_kcal,
          activities: todayActivities.map((a) => ({
            sport: (a.label ?? a.type).toLowerCase(),
            strain: a.strain,
            minutes: a.duration_min,
            distanceKm: a.distance_km,
          })),
        }
      : undefined,
    yesterday: yesterday
      ? { strain: yesterday.strain, strainTier: strainTier(yesterday.strain) }
      : undefined,
  };
}

// Plain-text block for Vision prompts. "" when there's nothing useful, so
// callers can blindly concat. Terse so it doesn't dominate the prompt.
export function trainingPromptBlock(s: TrainingSummary): string {
  if (!s.hasData) return "";
  const lines: string[] = ["**User's training context (Garmin, today):**"];

  if (s.today) {
    const t = s.today;
    const parts: string[] = [];
    if (t.strain != null) parts.push(`strain ${t.strain.toFixed(1)} (${tierLabel(t.strainTier)})`);
    if (t.recovery != null)
      parts.push(`recovery — sleep score ${t.recovery} (${recoveryLabel(t.recoveryTier)})`);
    if (t.kcalBurn != null) parts.push(`~${Math.round(t.kcalBurn)} kcal active burn`);
    if (parts.length > 0) lines.push(`- ${parts.join(" · ")}`);

    if (t.activities.length > 0) {
      const at = t.activities
        .map(
          (a) =>
            `${a.sport} ${a.minutes}min${a.distanceKm != null ? ` ${a.distanceKm.toFixed(1)}km` : ""}${a.strain != null ? ` (strain ${a.strain.toFixed(1)})` : ""}`
        )
        .join(", ");
      lines.push(`- workouts: ${at}`);
    }
  }
  if (s.yesterday?.strain != null) {
    lines.push(`- yesterday: strain ${s.yesterday.strain.toFixed(1)} (${tierLabel(s.yesterday.strainTier)})`);
  }

  lines.push("");
  lines.push(
    "Use this context ONLY when it's genuinely relevant to the meal you're parsing. Examples: a post-workout meal with good protein → mention it. A recovery-supportive meal on a low-recovery day → mention it. A modest meal on a heavy-strain day → flag undereating concern in the notes. Do NOT shoehorn — silence is fine. Never moralize."
  );
  return lines.join("\n");
}

function tierLabel(t: StrainTier): string {
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

function recoveryLabel(t: RecoveryTier): string {
  switch (t) {
    case "low":
      return "poor sleep";
    case "amber":
      return "middling sleep";
    case "green":
      return "well-rested";
    default:
      return "unknown";
  }
}

// Short headline-suffix for home surfaces. null when no mention is warranted.
export function trainingHeadlineSuffix(s: TrainingSummary): string | null {
  if (!s.hasData || !s.today) return null;
  const t = s.today;
  if (t.strainTier === "very_high") {
    const sport = t.activities[0]?.sport;
    return sport ? `after a very-high-strain ${sport}` : "after a very-high-strain day";
  }
  if (t.recoveryTier === "low") return "low recovery today — fuel kindly";
  if (t.strainTier === "high") {
    const sport = t.activities[0]?.sport;
    return sport ? `after a heavy ${sport}` : "high-strain day";
  }
  if (t.strainTier === "moderate" && t.activities.length > 0) {
    return `with a ${t.activities[0].sport} earlier`;
  }
  if (t.recoveryTier === "green" && t.strainTier === "rest") return "well-recovered rest day";
  return null;
}
