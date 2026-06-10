// Strength overview — the scoreboard's home. Most opens are NOT session
// days; this screen is for checking progress: last + best per exercise,
// session history with beats counts, and an unmissable Start session.
//
// Unlike the food surfaces, strength is EXPLICITLY a scoreboard — beats
// and streak language live here by design (different emotional contract
// from food, same design system).

import { useCallback, useState } from "react";
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
import { colors, radii, exerciseAccent } from "@/lib/colors";
import { ApiError, fetchStrengthOverview } from "@/lib/api";
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

  const load = useCallback(async () => {
    try {
      const data = await fetchStrengthOverview();
      setOverview(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load strength data");
    } finally {
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
            tintColor={colors.strength.brand}
            colors={[colors.strength.brand]}
          />
        }
      >
        <Text style={styles.title}>Strength</Text>

        {/* Start / resume — the screen's one unmissable action */}
        <TouchableOpacity
          style={styles.startBtn}
          onPress={startSession}
          activeOpacity={0.85}
          accessibilityLabel={hasDraft ? "resume session" : "start session"}
        >
          <Text style={styles.startBtnText}>
            {hasDraft ? "Resume session" : "Start session"}
          </Text>
          {hasDraft && (
            <Text style={styles.startBtnHint}>a session is in progress</Text>
          )}
        </TouchableOpacity>

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
            <Text style={styles.sectionLabel}>THE NUMBERS TO BEAT</Text>
            <View style={styles.cardList}>
              {overview.states.map((state) => {
                const ex = byId.get(state.exercise_id);
                if (!ex) return null;
                const accent = exerciseAccent(ex.id);
                const img = exerciseImage(ex.image_key);
                return (
                  <View
                    key={ex.id}
                    style={[styles.exCard, { borderColor: accent }]}
                  >
                    {img && <Image source={img} style={styles.exImage} />}
                    <View style={styles.exBody}>
                      <Text style={[styles.exName, { color: accent }]}>
                        {ex.name}
                      </Text>
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
                  </View>
                );
              })}
            </View>

            {/* Session history */}
            <Text style={styles.sectionLabel}>SESSIONS</Text>
            {overview.sessions.length === 0 ? (
              <Text style={styles.emptyHistory}>
                No sessions yet. The first one sets the numbers to beat.
              </Text>
            ) : (
              <View style={styles.historyList}>
                {overview.sessions.map((s) => (
                  <View key={s.id} style={styles.historyRow}>
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
                    <View
                      style={[
                        styles.beatsBadge,
                        s.beats_count === 0 && styles.beatsBadgeZero,
                      ]}
                    >
                      <Text
                        style={[
                          styles.beatsText,
                          s.beats_count === 0 && styles.beatsTextZero,
                        ]}
                      >
                        {s.beats_count} beat{s.beats_count === 1 ? "" : "s"}
                      </Text>
                    </View>
                  </View>
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
    backgroundColor: colors.bg,
  },
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 40,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: -0.5,
    paddingTop: 8,
  },
  startBtn: {
    backgroundColor: colors.strength.brand,
    borderRadius: radii.lg,
    paddingVertical: 18,
    alignItems: "center",
    gap: 2,
  },
  startBtnText: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.bg,
    letterSpacing: -0.2,
  },
  startBtnHint: {
    fontSize: 11,
    color: "rgba(10,10,10,0.7)",
    fontWeight: "600",
  },
  sectionLabel: {
    fontSize: 11,
    color: colors.textSubtle,
    letterSpacing: 1,
    fontWeight: "500",
    marginTop: 10,
  },
  cardList: {
    gap: 10,
  },
  exCard: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 2,
    padding: 12,
    gap: 12,
    alignItems: "center",
  },
  exImage: {
    width: 64,
    height: 48,
    borderRadius: radii.sm,
    backgroundColor: "#fff",
  },
  exBody: {
    flex: 1,
    gap: 3,
  },
  exName: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  numRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  numKey: {
    fontSize: 9,
    color: colors.textSubtle,
    letterSpacing: 0.8,
    width: 30,
  },
  numValue: {
    fontSize: 13,
    color: colors.text,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
    flexShrink: 1,
  },
  neverDone: {
    fontSize: 12,
    color: colors.textSubtle,
    fontStyle: "italic",
  },
  historyList: {
    gap: 8,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  historyMain: {
    flex: 1,
    gap: 2,
  },
  historyDate: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
  historyDetail: {
    fontSize: 12,
    color: colors.textSubtle,
  },
  beatsBadge: {
    backgroundColor: colors.strength.brandDim,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  beatsBadgeZero: {
    backgroundColor: colors.surfaceMuted,
  },
  beatsText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.strength.brandBright,
  },
  beatsTextZero: {
    color: colors.textMuted,
  },
  emptyHistory: {
    fontSize: 13,
    color: colors.textSubtle,
  },
  errorWrap: {
    alignItems: "center",
    gap: 10,
    paddingTop: 16,
  },
  errorText: {
    fontSize: 13,
    color: colors.bad,
    textAlign: "center",
  },
  retryBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  retryText: {
    fontSize: 13,
    color: colors.text,
    fontWeight: "600",
  },
});
