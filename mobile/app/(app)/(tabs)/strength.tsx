// Strength overview — the scoreboard's home. Most opens are NOT session
// days; this screen is for checking progress: last + best per exercise,
// session history with beats counts, and an unmissable Start session.
//
// Unlike the food surfaces, strength is EXPLICITLY a scoreboard — beats
// and streak language live here by design (different emotional contract
// from food, same design system).

import { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { palette, radii, borders, fontSize, spacing, exerciseIdentity, condensedFamily } from "@/lib/theme";
import { Card, Chip, SectionHeader, Button } from "@/components/ui";
import { ApiError, fetchStrengthOverview } from "@/lib/api";
import { getSnapshot, setSnapshot } from "@/lib/snapshot";
import { StrengthOverviewSkeleton } from "@/components/skeletons/StrengthOverviewSkeleton";
import { loadDraft } from "@/lib/draftStorage";
import { exerciseImage } from "@/lib/exerciseImages";
import { fmtBest, fmtSeriesList, fmtSessionDate } from "@/lib/strengthFormat";
import type { StrengthOverview } from "@/lib/strengthTypes";

export default function StrengthScreen() {
  const router = useRouter();
  const [overview, setOverview] = useState<StrengthOverview | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // True only while the FIRST load is in flight with no cached scoreboard
  // to stand in — that's when the skeleton shows. A cache hit clears it.
  const [loading, setLoading] = useState(true);
  const seededRef = useRef(false);

  const load = useCallback(async () => {
    // First focus: seed from the cached scoreboard so a returning user sees
    // their numbers instantly, then refresh silently. A cold cache keeps
    // the skeleton up until the fetch lands.
    if (!seededRef.current) {
      seededRef.current = true;
      const cached = await getSnapshot<StrengthOverview>("strength");
      if (cached) {
        setOverview(cached);
        setLoading(false);
      }
    }
    try {
      const data = await fetchStrengthOverview();
      setOverview(data);
      setError(null);
      setSnapshot("strength", undefined, data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load strength data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      loadDraft().then((d) => setHasDraft(d !== null));
    }, [load])
  );

  function startSession() {
    router.push("/(app)/strength/session");
  }

  function openExercise(exerciseId: string) {
    router.push(`/(app)/strength/exercise/${exerciseId}`);
  }

  function openSession(sessionId: string) {
    router.push(`/(app)/strength/log/${sessionId}`);
  }

  const byId = new Map((overview?.exercises ?? []).map((e) => [e.id, e]));

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={palette.strength.brand}
            colors={[palette.strength.brand]}
          />
        }
      >
        <Text style={styles.title}>Strength</Text>

        {/* Start / resume — the screen's one unmissable action */}
        <Button
          label={hasDraft ? "Resume session" : "Start session"}
          hint={hasDraft ? "a session is in progress" : undefined}
          onPress={startSession}
          variant="primary"
          accent={palette.strength.brand}
          size="lg"
          accessibilityLabel={hasDraft ? "resume session" : "start session"}
          style={styles.startBtn}
        />

        {/* Cold start, no cached scoreboard yet: skeleton stands in. */}
        {loading && !overview && !error && <StrengthOverviewSkeleton />}

        {error && !overview && (
          <View style={styles.errorWrap}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={load}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {overview && (
          <>
            {/* Per-exercise scoreboard */}
            <SectionHeader color={palette.strength.brand} style={styles.section}>
              THE NUMBERS TO BEAT
            </SectionHeader>
            <View style={styles.cardList}>
              {overview.states.map((state) => {
                const ex = byId.get(state.exercise_id);
                if (!ex) return null;
                const accent = exerciseIdentity(ex.id).accent;
                const img = exerciseImage(ex.image_key);
                return (
                  <Card
                    key={ex.id}
                    identity={accent}
                    depth="loud"
                    style={styles.exCard}
                    onPress={() => openExercise(ex.id)}
                    accessibilityLabel={`${ex.name} detail`}
                  >
                    {img && <Image source={img} style={styles.exImage} />}
                    <View style={styles.exBody}>
                      <Text style={[styles.exName, { color: accent }]}>{ex.name}</Text>
                      {state.last ? (
                        <>
                          <View style={styles.numRow}>
                            <Text style={styles.numKey}>LAST</Text>
                            <Text style={styles.numValue}>
                              {fmtSeriesList(state.last.series, ex.measurement_type)}
                            </Text>
                          </View>
                          {state.best && (
                            <View style={styles.numRow}>
                              <Text style={styles.numKey}>BEST</Text>
                              <Text style={styles.numValue}>
                                {fmtBest(state.best, ex.measurement_type)}
                              </Text>
                            </View>
                          )}
                        </>
                      ) : (
                        <Text style={styles.neverDone}>not done yet</Text>
                      )}
                    </View>
                  </Card>
                );
              })}
            </View>

            {/* Session history */}
            <SectionHeader style={styles.section}>SESSIONS</SectionHeader>
            {overview.sessions.length === 0 ? (
              <Text style={styles.emptyHistory}>
                No sessions yet. The first one sets the numbers to beat.
              </Text>
            ) : (
              <View style={styles.historyList}>
                {overview.sessions.map((s) => (
                  <Card
                    key={s.id}
                    tone="recessed"
                    style={styles.historyRow}
                    onPress={() => openSession(s.id)}
                    accessibilityLabel={`session ${fmtSessionDate(s.completed_at)}`}
                  >
                    <View style={styles.historyMain}>
                      <Text style={styles.historyDate}>
                        {fmtSessionDate(s.completed_at)}
                      </Text>
                      <Text style={styles.historyDetail} numberOfLines={1}>
                        {s.exercise_ids.length} exercise
                        {s.exercise_ids.length === 1 ? "" : "s"}
                        {s.note ? ` · ${s.note}` : ""}
                      </Text>
                    </View>
                    <Chip
                      label={`${s.beats_count} beat${s.beats_count === 1 ? "" : "s"}`}
                      tone={s.beats_count === 0 ? "neutral" : "accent"}
                      identity={palette.strength.brandBright}
                      fill={s.beats_count === 0 ? palette.surfaceMuted : palette.strength.brandSoft}
                      textColor={s.beats_count === 0 ? palette.textMuted : palette.strength.brandBright}
                    />
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
  safe: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: 40,
  },
  title: {
    fontSize: fontSize.display,
    fontWeight: "800",
    color: palette.text,
    letterSpacing: -0.5,
    paddingTop: spacing.sm,
  },
  startBtn: {
    marginTop: spacing.xs,
  },
  section: {
    marginTop: spacing.sm,
  },
  cardList: {
    gap: spacing.md,
  },
  exCard: {
    flexDirection: "row",
    padding: spacing.md,
    gap: spacing.md,
    alignItems: "center",
  },
  exImage: {
    width: 64,
    height: 48,
    borderRadius: radii.sm,
    backgroundColor: palette.white,
    borderWidth: borders.bold,
    borderColor: palette.ink,
  },
  exBody: {
    flex: 1,
    gap: 3,
  },
  exName: {
    fontSize: fontSize.bodyLg,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  numRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
  },
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
  historyList: {
    gap: spacing.sm,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  historyMain: {
    flex: 1,
    gap: 2,
  },
  historyDate: {
    fontSize: fontSize.body,
    fontWeight: "700",
    color: palette.text,
  },
  historyDetail: {
    fontSize: fontSize.caption,
    color: palette.textSubtle,
  },
  emptyHistory: {
    fontSize: fontSize.caption,
    color: palette.textSubtle,
  },
  errorWrap: {
    alignItems: "center",
    gap: spacing.md,
    paddingTop: spacing.lg,
  },
  errorText: {
    fontSize: fontSize.caption,
    color: palette.danger,
    textAlign: "center",
  },
  retryBtn: {
    backgroundColor: "transparent",
    borderWidth: borders.bold,
    borderColor: palette.ink,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  retryText: {
    fontSize: fontSize.caption,
    color: palette.text,
    fontWeight: "700",
  },
});
