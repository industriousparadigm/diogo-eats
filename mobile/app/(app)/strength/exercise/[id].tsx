// Strength exercise detail — tap an exercise card on the overview to open
// its own page. Loud register (the scoreboard, per-exercise):
//
//   - image hero + the form-cue description
//   - BEST stat (the number to chase)
//   - a max-weight progression sparkline (its own color identity)
//   - chronological per-session history: date + that session's series
//
// All derived client-side from GET /api/strength/sessions (the full log)
// — no new endpoint. Exercise metadata + the BEST stat come from the
// cached overview, with a fetch fallback.

import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { palette, radii, borders, fontSize, spacing, exerciseIdentity, condensedFamily } from "@/lib/theme";
import { Card, StatNumber, SectionHeader } from "@/components/ui";
import { ApiError, fetchStrengthOverview, fetchStrengthSessions } from "@/lib/api";
import { getSnapshot } from "@/lib/snapshot";
import { exerciseImage } from "@/lib/exerciseImages";
import { exerciseHistory, progression } from "@/lib/strengthHistory";
import { fmtBest, fmtSeriesList, fmtSessionDate, weightUnit } from "@/lib/strengthFormat";
import { ProgressionSparkline } from "@/components/ProgressionSparkline";
import { ExerciseDetailSkeleton } from "@/components/skeletons/ExerciseDetailSkeleton";
import type { Exercise, ExerciseBest, StrengthSession } from "@/lib/strengthTypes";

export default function ExerciseDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [best, setBest] = useState<ExerciseBest | null>(null);
  const [sessions, setSessions] = useState<StrengthSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    const cached = await getSnapshot<{
      exercises: Exercise[];
      states: { exercise_id: string; best: ExerciseBest | null }[];
    }>("strength");
    const cachedEx = cached?.exercises?.find((e) => e.id === id) ?? null;
    if (cachedEx) {
      setExercise(cachedEx);
      setBest(cached?.states?.find((s) => s.exercise_id === id)?.best ?? null);
    }
    try {
      const [list, overview] = await Promise.all([
        fetchStrengthSessions(),
        cachedEx ? Promise.resolve(null) : fetchStrengthOverview().catch(() => null),
      ]);
      setSessions(list);
      if (overview) {
        setExercise(overview.exercises.find((e) => e.id === id) ?? null);
        setBest(overview.states.find((s) => s.exercise_id === id)?.best ?? null);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this exercise");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const accent = id ? exerciseIdentity(id).accent : palette.strength.brand;
  const img = exercise ? exerciseImage(exercise.image_key) : null;
  const history = exercise && sessions ? exerciseHistory(sessions, exercise.id) : [];
  const points =
    exercise && sessions ? progression(sessions, exercise.id, exercise.measurement_type) : [];

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.headerBtn}
          accessibilityLabel="back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.headerBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, exercise ? { color: accent } : null]}>
          {(exercise?.name ?? "EXERCISE").toUpperCase()}
        </Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading && !sessions && !error && <ExerciseDetailSkeleton />}

        {error && !sessions && (
          <View style={styles.errorWrap}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={load}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {exercise && sessions && (
          <>
            {/* Image hero + form cue */}
            <Card identity={accent} depth="loud" style={styles.hero}>
              {img && <Image source={img} style={styles.heroImage} />}
              <Text style={styles.heroDesc}>{exercise.description}</Text>
            </Card>

            {/* BEST — the number to chase */}
            {best && (
              <Card identity={accent} depth="loud" style={styles.bestCard}>
                <Text style={styles.bestLabel}>BEST</Text>
                <Text style={[styles.bestValue, { color: accent }]}>
                  {fmtBest(best, exercise.measurement_type)}
                </Text>
              </Card>
            )}

            {/* Progression sparkline */}
            {points.length >= 2 && (
              <Card tone="recessed" style={styles.sparkCard}>
                <ProgressionSparkline
                  points={points}
                  accent={accent}
                  unit={exercise.measurement_type === "bodyweight_reps" ? "" : "kg"}
                />
              </Card>
            )}

            {/* Per-session history */}
            <SectionHeader style={styles.section}>
              {`EVERY SESSION · ${history.length}`}
            </SectionHeader>
            {history.length === 0 ? (
              <Text style={styles.empty}>Not done yet. The first session sets the bar.</Text>
            ) : (
              <View style={styles.historyList}>
                {history.map((h) => (
                  <Card key={h.session_id} tone="recessed" style={styles.historyRow}>
                    <Text style={styles.historyDate}>{fmtSessionDate(h.completed_at)}</Text>
                    <Text style={styles.historyValue}>
                      {fmtSeriesList(h.series, exercise.measurement_type)}
                    </Text>
                  </Card>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: borders.bold,
    borderBottomColor: palette.ink,
  },
  headerBtn: { minWidth: 56, height: 40, alignItems: "center", justifyContent: "center" },
  headerBtnText: { fontSize: 26, color: palette.textMuted, lineHeight: 30 },
  headerTitle: {
    fontSize: fontSize.caption,
    fontWeight: "800",
    color: palette.text,
    letterSpacing: 1,
    flexShrink: 1,
  },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 40 },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
  },
  heroImage: {
    width: 96,
    height: 70,
    borderRadius: radii.sm,
    backgroundColor: palette.white,
    borderWidth: borders.bold,
    borderColor: palette.ink,
  },
  heroDesc: { flex: 1, fontSize: fontSize.caption, color: palette.textMuted, lineHeight: 18 },
  bestCard: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    padding: spacing.lg,
  },
  bestLabel: {
    fontSize: fontSize.label,
    fontWeight: "800",
    color: palette.textSubtle,
    letterSpacing: 1.4,
  },
  bestValue: {
    fontFamily: condensedFamily,
    fontSize: fontSize.displayLg,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    letterSpacing: condensedFamily ? 0.4 : -0.6,
  },
  sparkCard: { padding: spacing.lg },
  section: { marginTop: spacing.sm },
  empty: { fontSize: fontSize.caption, color: palette.textSubtle },
  historyList: { gap: spacing.sm },
  historyRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  historyDate: { fontSize: fontSize.body, fontWeight: "700", color: palette.text },
  historyValue: {
    fontFamily: condensedFamily,
    fontSize: fontSize.bodyLg,
    color: palette.text,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    letterSpacing: condensedFamily ? 0.2 : 0,
    flexShrink: 1,
    textAlign: "right",
  },
  errorWrap: { alignItems: "center", gap: spacing.md, paddingTop: spacing.xxl },
  errorText: { fontSize: fontSize.caption, color: palette.danger, textAlign: "center" },
  retryBtn: {
    backgroundColor: "transparent",
    borderWidth: borders.bold,
    borderColor: palette.ink,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  retryText: { fontSize: fontSize.caption, color: palette.text, fontWeight: "700" },
});
