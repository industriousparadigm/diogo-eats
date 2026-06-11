// Strength exercise detail — ONE context-aware screen (see DESIGN.md
// "Context-aware exercise detail"). The image is the hero: full-width,
// framed in the exercise's identity color, the loudest Card in the app.
// A `from` route param flips which content sits under the hero:
//
//   from=session  → GYM-NOW. "LAST TIME" big (the numbers to beat),
//     today's logged sets for this exercise if any, and a primary
//     "Log this" that drops straight into the session entry. No career
//     clutter — at 06:30 you want the number to beat and the way in.
//   (default)     → CAREER. BEST (big), last-done date, the max-weight
//     progression sparkline, then the full chronological timeline
//     (date · series) — the scoreboard's long view.
//
// Data: exercise metadata + BEST + LAST come from the cached overview
// snapshot (the user just came from it), with a fetch fallback. The full
// history + sparkline derive client-side from GET /api/strength/sessions
// (career only). Today's in-progress sets come from the live draft.
//
// COLD-CACHE GUARD: deep-linking into a brand-new exercise with an empty
// snapshot used to render blank. Now: a skeleton while metadata resolves,
// and an honest "couldn't find this exercise" state if it never does.

import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  palette,
  radii,
  borders,
  fontSize,
  spacing,
  exerciseIdentity,
  condensedFamily,
} from "@/lib/theme";
import { Card, StatNumber, SectionHeader, Button } from "@/components/ui";
import { ApiError, fetchStrengthOverview, fetchStrengthSessions } from "@/lib/api";
import { getSnapshot } from "@/lib/snapshot";
import { loadDraft } from "@/lib/draftStorage";
import { stashLogExercise } from "@/lib/stores";
import { confirmedCount } from "@/lib/strengthSession";
import { ExerciseImage } from "@/components/ExerciseImage";
import { exerciseHistory, progression } from "@/lib/strengthHistory";
import {
  fmtBest,
  fmtSeries,
  fmtSeriesList,
  fmtSessionDate,
} from "@/lib/strengthFormat";
import { ProgressionSparkline } from "@/components/ProgressionSparkline";
import { ExerciseDetailSkeleton } from "@/components/skeletons/ExerciseDetailSkeleton";
import type {
  Exercise,
  ExerciseBest,
  ExerciseLast,
  SeriesNumbers,
  StrengthSession,
} from "@/lib/strengthTypes";

export default function ExerciseDetailScreen() {
  const router = useRouter();
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const fromSession = from === "session";

  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [best, setBest] = useState<ExerciseBest | null>(null);
  const [last, setLast] = useState<ExerciseLast | null>(null);
  const [sessions, setSessions] = useState<StrengthSession[] | null>(null);
  // Today's confirmed sets for this exercise, read from the live draft
  // (gym-now only). Empty until something is logged.
  const [todaySets, setTodaySets] = useState<SeriesNumbers[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // True once a load attempt has fully completed. Combined with "no
  // exercise + no error", it's the honest cold-cache miss (a deep-link into
  // an id that isn't ours / has been removed) — never a silent blank.
  const [attempted, setAttempted] = useState(false);

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false);
      setAttempted(true);
      return;
    }
    setError(null);

    // Warm from the snapshot first so a returning user sees their numbers
    // immediately (no skeleton flash) — the cold-cache guard only bites
    // when this misses AND the fetch can't fill it.
    const cached = await getSnapshot<{
      exercises: Exercise[];
      states: { exercise_id: string; best: ExerciseBest | null; last: ExerciseLast | null }[];
    }>("strength");
    const cachedEx = cached?.exercises?.find((e) => e.id === id) ?? null;
    const cachedState = cached?.states?.find((s) => s.exercise_id === id) ?? null;
    if (cachedEx) {
      setExercise(cachedEx);
      setBest(cachedState?.best ?? null);
      setLast(cachedState?.last ?? null);
    }

    // Gym-now: pull today's confirmed sets for this exercise from the draft.
    // The career view doesn't need the draft.
    if (fromSession) {
      const draft = await loadDraft();
      const entry = draft?.entries[id];
      if (entry) {
        setTodaySets(
          entry.series
            .filter((s) => s.confirmed)
            .map((s) => ({ weight_kg: s.weight_kg, reps: s.reps }))
        );
      }
    }

    try {
      // The career timeline + sparkline need the full session log; gym-now
      // doesn't, so skip that fetch on the gym floor (flaky network, and
      // the LAST number already came from the cache/overview).
      const [list, overview] = await Promise.all([
        fromSession ? Promise.resolve(null) : fetchStrengthSessions(),
        cachedEx ? Promise.resolve(null) : fetchStrengthOverview().catch(() => null),
      ]);
      if (list) setSessions(list);
      const fetchedEx = overview?.exercises.find((e) => e.id === id) ?? null;
      const fetchedState = overview?.states.find((s) => s.exercise_id === id) ?? null;
      if (fetchedEx) {
        setExercise(fetchedEx);
        setBest(fetchedState?.best ?? null);
        setLast(fetchedState?.last ?? null);
      }
      setError(null);
    } catch (err) {
      // A career fetch failed. If we had nothing cached, surface the error;
      // if we did, keep showing the cached card silently.
      if (!cachedEx) {
        setError(err instanceof ApiError ? err.message : "Could not load this exercise");
      }
    } finally {
      setLoading(false);
      setAttempted(true);
    }
  }, [id, fromSession]);

  useEffect(() => {
    load();
  }, [load]);

  const accent = id ? exerciseIdentity(id).accent : palette.strength.brand;
  const history = exercise && sessions ? exerciseHistory(sessions, exercise.id) : [];
  const points =
    exercise && sessions ? progression(sessions, exercise.id, exercise.measurement_type) : [];

  // "Log this" (gym-now): hand the session screen this exercise to open,
  // then pop back to the picker. detail → picker → entry, back stays sane.
  function logThis() {
    if (!exercise) return;
    stashLogExercise(exercise.id);
    router.back();
  }

  // Cold-cache miss: a load attempt completed, no error was raised, and
  // still no exercise — the id truly doesn't resolve.
  const notFound = attempted && !loading && !exercise && !error;

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
        {/* Cold-start / resolving: skeleton, never a blank screen. */}
        {loading && !exercise && !error && <ExerciseDetailSkeleton />}

        {/* Honest cold-cache miss: the exercise truly didn't resolve. */}
        {notFound && (
          <View style={styles.errorWrap}>
            <Text style={styles.notFoundText}>
              Couldn't find this exercise. It may have been removed.
            </Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => router.back()}>
              <Text style={styles.retryText}>Back</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Fetch error with nothing cached to fall back on. */}
        {error && !exercise && (
          <View style={styles.errorWrap}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={load}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {exercise && (
          <>
            {/* SHARED CORE — the image as a full-width hero, the single
                loudest Card in the app: chunky identity border + the loud
                offset block. Name as display type sits below, then the
                form-cue. Placeholder-safe for a null image_key. */}
            <Card identity={accent} depth="loud" style={styles.hero}>
              <ExerciseImage imageKey={exercise.image_key} style={styles.heroImage} />
            </Card>
            <Text style={[styles.exName, { color: accent }]}>{exercise.name}</Text>
            {exercise.description?.trim() ? (
              <Text style={styles.desc}>{exercise.description}</Text>
            ) : null}

            {fromSession ? (
              <GymNowView
                exercise={exercise}
                last={last}
                todaySets={todaySets}
                accent={accent}
                onLog={logThis}
              />
            ) : (
              <CareerView
                exercise={exercise}
                best={best}
                last={last}
                accent={accent}
                points={points}
                history={history}
              />
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---- GYM-NOW: the number to beat + today + the way in --------------------

function GymNowView({
  exercise,
  last,
  todaySets,
  accent,
  onLog,
}: {
  exercise: Exercise;
  last: ExerciseLast | null;
  todaySets: SeriesNumbers[];
  accent: string;
  onLog: () => void;
}) {
  return (
    <>
      {/* LAST TIME — the numbers to beat, big and loud. */}
      <SectionHeader color={palette.strength.brand} style={styles.section}>
        LAST TIME
      </SectionHeader>
      {last && last.series.length > 0 ? (
        <Card identity={accent} depth="loud" style={styles.lastCard}>
          {last.series.map((s, i) => (
            <View key={i} style={styles.lastRow}>
              <Text style={styles.lastLabel}>S{i + 1}</Text>
              <Text style={[styles.lastValue, { color: accent }]}>
                {fmtSeries(s, exercise.measurement_type)}
              </Text>
            </View>
          ))}
        </Card>
      ) : (
        <Text style={styles.empty}>First time — these numbers set the bar.</Text>
      )}

      {/* TODAY — what's already logged this session, if anything. */}
      {todaySets.length > 0 && (
        <>
          <SectionHeader style={styles.section}>
            {`TODAY · ${todaySets.length} SET${todaySets.length === 1 ? "" : "S"}`}
          </SectionHeader>
          <Card tone="recessed" style={styles.todayCard}>
            {todaySets.map((s, i) => (
              <View key={i} style={styles.lastRow}>
                <Text style={styles.lastLabel}>S{i + 1}</Text>
                <Text style={styles.todayValue}>
                  {fmtSeries(s, exercise.measurement_type)}
                </Text>
              </View>
            ))}
          </Card>
        </>
      )}

      {/* The way in — straight to this exercise's series entry. */}
      <Button
        label={todaySets.length > 0 ? "Log another set" : "Log this"}
        variant="primary"
        accent={accent}
        size="lg"
        onPress={onLog}
        accessibilityLabel="log this exercise"
        style={styles.logBtn}
      />
    </>
  );
}

// ---- CAREER: the scoreboard's long view ----------------------------------

function CareerView({
  exercise,
  best,
  last,
  accent,
  points,
  history,
}: {
  exercise: Exercise;
  best: ExerciseBest | null;
  last: ExerciseLast | null;
  accent: string;
  points: ReturnType<typeof progression>;
  history: ReturnType<typeof exerciseHistory>;
}) {
  return (
    <>
      {/* BEST — the number to chase, big. Last-done date alongside. */}
      {best && (
        <Card identity={accent} depth="loud" style={styles.bestCard}>
          <StatNumber
            value={fmtBest(best, exercise.measurement_type)}
            label="best"
            color={accent}
            size="lg"
            align="left"
          />
          {last && (
            <Text style={styles.lastDone}>last · {fmtSessionDate(last.completed_at)}</Text>
          )}
        </Card>
      )}

      {/* Progression sparkline — needs ≥2 sessions to be a trend. */}
      {points.length >= 2 && (
        <Card tone="recessed" style={styles.sparkCard}>
          <ProgressionSparkline
            points={points}
            accent={accent}
            unit={exercise.measurement_type === "bodyweight_reps" ? "" : "kg"}
          />
        </Card>
      )}

      {/* The full chronological timeline — date · series, one row each. */}
      <SectionHeader style={styles.section}>
        {`EVERY SESSION · ${history.length}`}
      </SectionHeader>
      {history.length === 0 ? (
        <Text style={styles.empty}>Not done yet. The first session sets the bar.</Text>
      ) : (
        <View style={styles.timeline}>
          {history.map((h) => (
            <View key={h.session_id} style={styles.timelineRow}>
              <View style={[styles.timelineDot, { backgroundColor: accent }]} />
              <Text style={styles.timelineDate}>{fmtSessionDate(h.completed_at)}</Text>
              <Text style={styles.timelineValue}>
                {fmtSeriesList(h.series, exercise.measurement_type)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </>
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

  // Shared core
  hero: { padding: spacing.sm },
  heroImage: {
    width: "100%",
    height: 200,
    borderRadius: radii.sm,
    backgroundColor: palette.white,
  },
  exName: {
    fontFamily: condensedFamily,
    fontSize: fontSize.hero,
    fontWeight: "800",
    letterSpacing: condensedFamily ? 0.3 : -0.8,
    marginTop: spacing.xs,
  },
  desc: {
    fontSize: fontSize.body,
    color: palette.textMuted,
    lineHeight: 20,
    marginTop: -spacing.xs,
  },
  section: { marginTop: spacing.sm },
  empty: { fontSize: fontSize.caption, color: palette.textSubtle },

  // Gym-now
  lastCard: { padding: spacing.lg, gap: spacing.sm },
  lastRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.md },
  lastLabel: {
    fontSize: fontSize.micro,
    color: palette.textSubtle,
    letterSpacing: 0.8,
    fontWeight: "700",
    width: 22,
  },
  lastValue: {
    fontFamily: condensedFamily,
    fontSize: fontSize.displayLg,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    letterSpacing: condensedFamily ? 0.3 : -0.5,
  },
  todayCard: { padding: spacing.lg, gap: spacing.sm },
  todayValue: {
    fontFamily: condensedFamily,
    fontSize: fontSize.bodyLg,
    color: palette.text,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    letterSpacing: condensedFamily ? 0.2 : 0,
  },
  logBtn: { marginTop: spacing.sm },

  // Career
  bestCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.lg,
  },
  lastDone: { fontSize: fontSize.caption, color: palette.textSubtle, fontWeight: "600" },
  sparkCard: { padding: spacing.lg },
  timeline: { gap: spacing.sm, marginTop: spacing.xs },
  timelineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: radii.pill,
  },
  timelineDate: {
    fontSize: fontSize.body,
    fontWeight: "700",
    color: palette.text,
    width: 86,
  },
  timelineValue: {
    flex: 1,
    fontFamily: condensedFamily,
    fontSize: fontSize.bodyLg,
    color: palette.textMuted,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    letterSpacing: condensedFamily ? 0.2 : 0,
    textAlign: "right",
  },

  // Errors / not-found
  errorWrap: { alignItems: "center", gap: spacing.md, paddingTop: spacing.xxl },
  errorText: { fontSize: fontSize.caption, color: palette.danger, textAlign: "center" },
  notFoundText: {
    fontSize: fontSize.body,
    color: palette.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
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
