// Strength exercise LIBRARY — the full catalog, moved off the landing.
//
// The landing is a dashboard now (start, stat strip, recent sessions); the
// catalog lives here, one tap behind an "All exercises" row. This screen
// browses the whole movement list and must scale toward 1000 exercises, so:
//   - a search Input at the top (strength accent), client-side contains-match
//     over the names already in the overview payload (no server round-trip)
//   - one compact card per exercise: image thumb + name + a LAST / BEST
//     subline when the exercise has been trained ("not done yet" otherwise)
//   - tapping a card opens the CAREER detail (browsing → the long view, per
//     DESIGN.md "Context-aware exercise detail"; no `from=session`).
//
// Data: the catalog + per-exercise states come from the cached strength
// overview (the user just came from the landing, which warmed it), with a
// fetch fallback so a cold deep-link still renders. The search is a pure
// helper (lib/strengthLibrary) so the field stays declarative.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  palette,
  radii,
  borders,
  fontSize,
  spacing,
  exerciseIdentity,
  condensedFamily,
} from "@/lib/theme";
import { Card, Input, KeyboardAwareScrollView } from "@/components/ui";
import { ApiError, fetchStrengthOverview } from "@/lib/api";
import { getSnapshot } from "@/lib/snapshot";
import { ExerciseImage } from "@/components/ExerciseImage";
import { StrengthOverviewSkeleton } from "@/components/skeletons/StrengthOverviewSkeleton";
import { libraryRows, searchExercises } from "@/lib/strengthLibrary";
import { fmtBest, fmtSeriesList } from "@/lib/strengthFormat";
import type { Exercise, ExerciseState } from "@/lib/strengthTypes";

export default function ExerciseLibraryScreen() {
  const router = useRouter();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [states, setStates] = useState<ExerciseState[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seededRef = useRef(false);

  const load = useCallback(async () => {
    // Warm from the cached overview first (the landing just wrote it), so the
    // catalog is on screen instantly; then refresh silently.
    if (!seededRef.current) {
      seededRef.current = true;
      const cached = await getSnapshot<{ exercises: Exercise[]; states: ExerciseState[] }>(
        "strength"
      );
      if (cached?.exercises?.length) {
        setExercises(cached.exercises);
        setStates(cached.states ?? []);
        setLoading(false);
      }
    }
    try {
      const data = await fetchStrengthOverview();
      setExercises(data.exercises);
      setStates(data.states);
      setError(null);
    } catch (err) {
      // Only surface the error if there's nothing cached to browse.
      setError((prev) =>
        exercises.length
          ? prev
          : err instanceof ApiError
            ? err.message
            : "Could not load exercises"
      );
    } finally {
      setLoading(false);
    }
  }, [exercises.length]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => searchExercises(exercises, query), [exercises, query]);
  const rows = useMemo(() => libraryRows(filtered, states), [filtered, states]);

  function openExercise(exerciseId: string) {
    // No `from` → CAREER detail (the long view, the browsing destination).
    router.push(`/(app)/strength/exercise/${exerciseId}`);
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityLabel="back"
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.backBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>ALL EXERCISES</Text>
        <Text style={styles.headerCount}>{exercises.length ? String(exercises.length) : ""}</Text>
      </View>

      <KeyboardAwareScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="search exercises…"
          autoComplete="off"
          autoCorrect={false}
          accent={palette.strength.brand}
          accessibilityLabel="search exercises"
        />

        {/* Cold start, nothing cached: skeleton, never a blank list. */}
        {loading && exercises.length === 0 && !error && <StrengthOverviewSkeleton />}

        {error && exercises.length === 0 && (
          <View style={styles.errorWrap}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={load}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {exercises.length > 0 && rows.length === 0 && (
          <Text style={styles.emptyText}>No exercises match “{query.trim()}”.</Text>
        )}

        <View style={styles.list}>
          {rows.map(({ exercise, state }) => {
            const accent = exerciseIdentity(exercise.id).accent;
            return (
              <Card
                key={exercise.id}
                identity={accent}
                depth="loud"
                style={styles.row}
                onPress={() => openExercise(exercise.id)}
                accessibilityLabel={`${exercise.name} detail`}
              >
                <ExerciseImage imageKey={exercise.image_key} style={styles.thumb} />
                <View style={styles.rowBody}>
                  <Text style={[styles.name, { color: accent }]} numberOfLines={1}>
                    {exercise.name}
                  </Text>
                  {state?.last && state.last.series.length > 0 ? (
                    <View style={styles.numRow}>
                      <Text style={styles.numKey}>LAST</Text>
                      <Text style={styles.numValue} numberOfLines={1}>
                        {fmtSeriesList(state.last.series, exercise.measurement_type)}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.neverDone}>not done yet</Text>
                  )}
                  {state?.best && (
                    <View style={styles.numRow}>
                      <Text style={styles.numKey}>BEST</Text>
                      <Text style={styles.numValue} numberOfLines={1}>
                        {fmtBest(state.best, exercise.measurement_type)}
                      </Text>
                    </View>
                  )}
                </View>
              </Card>
            );
          })}
        </View>
      </KeyboardAwareScrollView>
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
  backBtn: { minWidth: 56, height: 40, alignItems: "center", justifyContent: "center" },
  backBtnText: { fontSize: 26, color: palette.textMuted, lineHeight: 30 },
  headerTitle: {
    fontSize: fontSize.caption,
    fontWeight: "800",
    color: palette.text,
    letterSpacing: 1,
  },
  headerCount: {
    minWidth: 56,
    textAlign: "right",
    paddingRight: spacing.sm,
    fontSize: fontSize.caption,
    color: palette.textSubtle,
    fontWeight: "700",
  },
  body: { flex: 1 },
  bodyContent: { padding: spacing.lg, gap: spacing.md, paddingBottom: 40 },

  list: { gap: spacing.md },
  row: {
    flexDirection: "row",
    padding: spacing.md,
    gap: spacing.md,
    alignItems: "center",
  },
  thumb: {
    width: 64,
    height: 48,
    borderRadius: radii.sm,
    backgroundColor: palette.white,
    borderWidth: borders.bold,
    borderColor: palette.ink,
  },
  rowBody: { flex: 1, gap: 3 },
  name: {
    fontSize: fontSize.bodyLg,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  numRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  numKey: {
    fontSize: fontSize.micro,
    color: palette.textSubtle,
    letterSpacing: 0.8,
    fontWeight: "700",
    width: 30,
  },
  numValue: {
    fontFamily: condensedFamily,
    fontSize: fontSize.bodyLg,
    color: palette.text,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    letterSpacing: condensedFamily ? 0.2 : 0,
    flexShrink: 1,
  },
  neverDone: {
    fontSize: fontSize.caption,
    color: palette.textSubtle,
    fontStyle: "italic",
  },

  emptyText: {
    fontSize: fontSize.caption,
    color: palette.textSubtle,
    paddingTop: spacing.sm,
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
