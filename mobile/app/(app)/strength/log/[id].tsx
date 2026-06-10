// Strength session detail — tap a row in the SESSIONS list to open a
// completed session in full. The loud register (it's the scoreboard):
//
//   - header: date + time, and the session note if there is one
//   - the beats achieved THAT session (the payoff — amber, leads when ≥1)
//   - each exercise's logged series, in its own color identity
//
// The session + its beats come from GET /api/strength/sessions/[id] (the
// beats reuse the same pure engine the highlights do — never recomputed
// client-side). Exercise metadata (names, images, measurement types) is
// read from the cached strength overview, with a fetch fallback.

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
import { Card, Chip, SectionHeader } from "@/components/ui";
import { ApiError, fetchStrengthOverview, fetchStrengthSession } from "@/lib/api";
import { getSnapshot } from "@/lib/snapshot";
import { exerciseImage } from "@/lib/exerciseImages";
import { groupSetsByExercise } from "@/lib/strengthHistory";
import { fmtBeat, fmtSeries, fmtSessionDateTime } from "@/lib/strengthFormat";
import { SessionDetailSkeleton } from "@/components/skeletons/SessionDetailSkeleton";
import type { Exercise, SessionDetail } from "@/lib/strengthTypes";

export default function SessionDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    // Exercise metadata: prefer the cached overview (the user just came
    // from it), fall back to a fetch so a cold open still renders names.
    const cached = await getSnapshot<{ exercises: Exercise[] }>("strength");
    if (cached?.exercises?.length) setExercises(cached.exercises);
    try {
      const [d, catalog] = await Promise.all([
        fetchStrengthSession(id),
        cached?.exercises?.length
          ? Promise.resolve(null)
          : fetchStrengthOverview().catch(() => null),
      ]);
      setDetail(d);
      if (catalog?.exercises?.length) setExercises(catalog.exercises);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this session");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const byId = new Map(exercises.map((e) => [e.id, e]));
  const beatsByExercise = new Map((detail?.beats ?? []).map((b) => [b.exercise_id, b]));

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
        <Text style={styles.headerTitle}>SESSION</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading && !detail && !error && <SessionDetailSkeleton />}

        {error && !detail && (
          <View style={styles.errorWrap}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={load}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {detail && (
          <>
            <Text style={styles.dateLine}>{fmtSessionDateTime(detail.session.completed_at)}</Text>
            {detail.session.note ? (
              <Text style={styles.note}>“{detail.session.note}”</Text>
            ) : null}

            {/* Beats — the payoff. Amber. Only when there's at least one. */}
            {detail.beats.length > 0 && (
              <>
                <SectionHeader color={palette.strength.brand} style={styles.section}>
                  {detail.beats.length === 1 ? "1 NUMBER BEATEN" : `${detail.beats.length} NUMBERS BEATEN`}
                </SectionHeader>
                <Card identity={palette.strength.brand} depth="loud" style={styles.beatsCard}>
                  {detail.beats.map((b) => {
                    const ex = byId.get(b.exercise_id);
                    return (
                      <View key={b.exercise_id} style={styles.beatRow}>
                        <Text style={styles.beatName}>{ex?.name ?? b.exercise_id}</Text>
                        <Text style={styles.beatValue}>{fmtBeat(b)}</Text>
                      </View>
                    );
                  })}
                </Card>
              </>
            )}

            {/* Per-exercise logged series, in each exercise's identity. */}
            <SectionHeader style={styles.section}>WHAT YOU LOGGED</SectionHeader>
            <View style={styles.cardList}>
              {groupSetsByExercise(detail.session).map((group) => {
                const ex = byId.get(group.exercise_id);
                const accent = exerciseIdentity(group.exercise_id).accent;
                const beat = beatsByExercise.get(group.exercise_id);
                const img = ex ? exerciseImage(ex.image_key) : null;
                return (
                  <Card key={group.exercise_id} identity={accent} depth="loud" style={styles.exCard}>
                    <View style={styles.exHeader}>
                      {img && <Image source={img} style={styles.exImage} />}
                      <View style={styles.exHeaderText}>
                        <Text style={[styles.exName, { color: accent }]}>
                          {ex?.name ?? group.exercise_id}
                        </Text>
                        {beat && (
                          <Chip
                            label="beat ↑"
                            tone="accent"
                            identity={palette.strength.brandBright}
                            fill={palette.strength.brandSoft}
                            textColor={palette.strength.brandBright}
                            style={styles.beatChip}
                          />
                        )}
                      </View>
                    </View>
                    <View style={styles.seriesWrap}>
                      {group.series.map((s, i) => (
                        <View key={i} style={styles.seriesRow}>
                          <Text style={styles.seriesLabel}>S{i + 1}</Text>
                          <Text style={styles.seriesValue}>
                            {ex ? fmtSeries(s, ex.measurement_type) : `× ${s.reps}`}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </Card>
                );
              })}
            </View>
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
  headerBtn: {
    minWidth: 56,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerBtnText: { fontSize: 26, color: palette.textMuted, lineHeight: 30 },
  headerTitle: {
    fontSize: fontSize.caption,
    fontWeight: "800",
    color: palette.text,
    letterSpacing: 1,
  },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 40 },
  dateLine: {
    fontSize: fontSize.lead,
    fontWeight: "800",
    color: palette.text,
    letterSpacing: -0.3,
  },
  note: {
    fontSize: fontSize.caption,
    color: palette.textMuted,
    fontStyle: "italic",
    lineHeight: 19,
  },
  section: { marginTop: spacing.sm },
  beatsCard: { padding: spacing.md, gap: spacing.sm, backgroundColor: palette.strength.brandSoft },
  beatRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  beatName: {
    fontSize: fontSize.bodyLg,
    fontWeight: "700",
    color: palette.text,
    flexShrink: 1,
  },
  beatValue: {
    fontFamily: condensedFamily,
    fontSize: fontSize.title,
    fontWeight: "800",
    color: palette.strength.brandBright,
    fontVariant: ["tabular-nums"],
    letterSpacing: condensedFamily ? 0.2 : 0,
  },
  cardList: { gap: spacing.md },
  exCard: { padding: spacing.md, gap: spacing.sm },
  exHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  exImage: {
    width: 56,
    height: 42,
    borderRadius: radii.sm,
    backgroundColor: palette.white,
    borderWidth: borders.bold,
    borderColor: palette.ink,
  },
  exHeaderText: { flex: 1, gap: 4 },
  exName: { fontSize: fontSize.bodyLg, fontWeight: "800", letterSpacing: -0.2 },
  beatChip: { alignSelf: "flex-start" },
  seriesWrap: { gap: spacing.xs },
  seriesRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.md,
  },
  seriesLabel: {
    fontSize: fontSize.micro,
    color: palette.textSubtle,
    letterSpacing: 0.8,
    fontWeight: "700",
    width: 24,
  },
  seriesValue: {
    fontFamily: condensedFamily,
    fontSize: fontSize.bodyLg,
    color: palette.text,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    letterSpacing: condensedFamily ? 0.2 : 0,
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
