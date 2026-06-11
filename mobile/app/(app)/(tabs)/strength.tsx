// Strength landing — a DASHBOARD, not a catalog (redesigned). Most opens are
// NOT session days; this screen is the scoreboard's home glance. Top to
// bottom: the unmissable Start/Resume action, a loud stat strip (sessions +
// beats this month, last-session date), the promoted RECENT SESSIONS list,
// and a single "All exercises" row into the library.
//
// What LEFT: the per-exercise "THE NUMBERS TO BEAT" list. At 1000 exercises a
// full per-exercise scoreboard on the landing is noise; that job is done
// better by the in-session picker (the numbers you're about to beat) and by
// the library + career detail (browsing the long view). The landing stays a
// glance.
//
// Strength is EXPLICITLY a scoreboard — beats + month counts live here by
// design (a different emotional contract from the calm food side, same design
// system, loud register).

import { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { palette, radii, borders, fontSize, spacing } from "@/lib/theme";
import { Card, Chip, StatNumber, SectionHeader, Button } from "@/components/ui";
import { ApiError, fetchStrengthOverview } from "@/lib/api";
import { getSnapshot, setSnapshot } from "@/lib/snapshot";
import { StrengthOverviewSkeleton } from "@/components/skeletons/StrengthOverviewSkeleton";
import { loadDraft } from "@/lib/draftStorage";
import { strengthStats } from "@/lib/strengthStats";
import { fmtLastSession, fmtSessionDate } from "@/lib/strengthFormat";
import type { StrengthOverview } from "@/lib/strengthTypes";

// Recent sessions cap — the landing is a glance, not the full archive (the
// library + each exercise's career timeline hold the long view).
const RECENT_CAP = 10;

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

  function openSession(sessionId: string) {
    router.push(`/(app)/strength/log/${sessionId}`);
  }

  function openLibrary() {
    router.push("/(app)/strength/exercises");
  }

  const nameById = new Map((overview?.exercises ?? []).map((e) => [e.id, e.name]));
  const stats = overview ? strengthStats(overview.sessions, Date.now()) : null;
  const recent = (overview?.sessions ?? []).slice(0, RECENT_CAP);

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

        {/* Start / resume — the screen's one unmissable action, the hero. */}
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

        {overview && stats && (
          <>
            {/* Stat strip — the scoreboard glance. Loud register, condensed
                numerals. A flat Card (it's a supporting strip, not a content
                card — the offset block stays the signal for the session
                rows). */}
            <Card flat depth="loud" style={styles.statStrip} accessibilityLabel="month stats">
              <StatNumber
                value={String(stats.sessionsThisMonth)}
                label="sessions · mo"
                color={palette.strength.brandBright}
                flex
              />
              <View style={styles.statDivider} />
              <StatNumber
                value={String(stats.beatsThisMonth)}
                label="beats · mo"
                color={palette.strength.brandBright}
                flex
              />
              <View style={styles.statDivider} />
              <StatNumber
                value={fmtLastSession(stats.lastSessionAt)}
                label="last session"
                flex
              />
            </Card>

            {/* Recent sessions — promoted to the landing's body. Newest
                first, capped; date + exercise names + beats badge → detail. */}
            <SectionHeader color={palette.strength.brand} style={styles.section}>
              RECENT SESSIONS
            </SectionHeader>
            {recent.length === 0 ? (
              <Text style={styles.emptyHistory}>
                No sessions yet. The first one sets the numbers to beat.
              </Text>
            ) : (
              <View style={styles.historyList}>
                {recent.map((s) => {
                  const names = s.exercise_ids
                    .map((id) => nameById.get(id) ?? id)
                    .join(" · ");
                  return (
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
                          {names || `${s.exercise_ids.length} exercises`}
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
                  );
                })}
              </View>
            )}

            {/* The catalog lives one tap away — browsing belongs in the
                library, not on the landing (and it scales to 1000). */}
            <TouchableOpacity
              style={styles.libraryRow}
              onPress={openLibrary}
              accessibilityLabel="all exercises"
            >
              <Text style={styles.libraryLabel}>All exercises</Text>
              <Text style={styles.libraryChevron}>›</Text>
            </TouchableOpacity>
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

  // Stat strip
  statStrip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  statDivider: {
    width: borders.hairline,
    alignSelf: "stretch",
    marginVertical: spacing.xs,
    backgroundColor: palette.hairline,
  },

  // Recent sessions
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

  // "All exercises" row → library
  libraryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    marginTop: spacing.xs,
  },
  libraryLabel: {
    fontSize: fontSize.body,
    fontWeight: "700",
    color: palette.textMuted,
    letterSpacing: 0.2,
  },
  libraryChevron: {
    fontSize: fontSize.lead,
    color: palette.textSubtle,
    fontWeight: "700",
  },

  // Errors
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
