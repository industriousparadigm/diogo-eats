// Movement landing — "how I moved". Overview first, then the operational
// view, then browse-by-type. Top to bottom:
//
//   - ONE FRONT DOOR: a single "+ Log movement" hero (amber). Resume rides
//     above it only when a session draft exists.
//   - PERIOD: the app's standard selector (7d/15d/1mo/3mo/1y) — same as
//     Looking Back — driving the whole page.
//   - CONSISTENCY: "worked out N of last X days" + a bar per day (height =
//     intensity, gap = rest), the readable answer to "am I moving, and hard?"
//   - RECENT: the latest few movements, newest first, tap any to EDIT — the
//     thing you just did, right where you'd look for it.
//   - BY ACTIVITY: one rollup card per type; tap → that type's own screen
//     (all your runs / padel / …), each editable there.
//
// The per-exercise catalog still lives one tap behind "All exercises". The
// route folder is internally "strength"; the tab presents as Movement.

import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { palette, radii, borders, fontSize, spacing } from "@/lib/theme";
import { SectionHeader, Button } from "@/components/ui";
import { ApiError, fetchStrengthOverview, fetchActivities } from "@/lib/api";
import { getSnapshot, setSnapshot } from "@/lib/snapshot";
import { StrengthOverviewSkeleton } from "@/components/skeletons/StrengthOverviewSkeleton";
import { loadDraft } from "@/lib/draftStorage";
import { mergeTimeline } from "@/lib/movementTimeline";
import { buildRollups } from "@/lib/movementRollup";
import { buildConsistency, countsAsMovement } from "@/lib/movementConsistency";
import { PeriodSelector, DEFAULT_PERIOD_DAYS } from "@/components/PeriodSelector";
import { MovementConsistency } from "@/components/MovementConsistency";
import { MovementByActivity } from "@/components/MovementByActivity";
import { SessionCard, ActivityCard } from "@/components/MovementCard";
import { QuickLogSheet } from "@/components/QuickLogSheet";
import { ActivityDetailSheet } from "@/components/ActivityDetailSheet";
import type { StrengthOverview } from "@/lib/strengthTypes";
import type { Activity } from "@/lib/activityTypes";

// Always pull at least this many days so RECENT stays reliable even on a 7d
// view (your last run might be 9 days ago). Consistency + rollups window down
// to the selected period client-side.
const RECENT_FLOOR_DAYS = 60;
// How many movements RECENT shows before "see all" via the type screens.
const RECENT_CAP = 3;

export default function MovementScreen() {
  const router = useRouter();
  const [overview, setOverview] = useState<StrengthOverview | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [hasDraft, setHasDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const seededRef = useRef(false);

  const [logOpen, setLogOpen] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [periodDays, setPeriodDays] = useState<number>(DEFAULT_PERIOD_DAYS);

  const load = useCallback(async () => {
    if (!seededRef.current) {
      seededRef.current = true;
      const cachedOverview = await getSnapshot<StrengthOverview>("strength");
      const cachedActs = await getSnapshot<Activity[]>("activities");
      if (cachedOverview) {
        setOverview(cachedOverview);
        setLoading(false);
      }
      if (cachedActs) setActivities(cachedActs);
    }
    try {
      const [data, acts] = await Promise.all([
        fetchStrengthOverview(),
        fetchActivities(Math.max(periodDays, RECENT_FLOOR_DAYS)).catch(() => null),
      ]);
      setOverview(data);
      setError(null);
      setSnapshot("strength", undefined, data);
      if (acts) {
        setActivities(acts);
        setSnapshot("activities", undefined, acts);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load movement data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [periodDays]);

  useFocusEffect(
    useCallback(() => {
      load();
      loadDraft().then((d) => setHasDraft(d !== null));
    }, [load])
  );

  // Refetch when the period widens past what we have (focus covers first load).
  const periodMountRef = useRef(true);
  useEffect(() => {
    if (periodMountRef.current) {
      periodMountRef.current = false;
      return;
    }
    load();
  }, [periodDays, load]);

  function startSession() {
    router.push("/(app)/strength/session");
  }
  function openSession(sessionId: string) {
    router.push(`/(app)/strength/log/${sessionId}`);
  }
  function openType(type: string) {
    router.push(`/(app)/strength/type/${type}?days=${periodDays}`);
  }

  function onLogged(activity: Activity) {
    setActivities((prev) => {
      const next = [activity, ...prev];
      setSnapshot("activities", undefined, next);
      return next;
    });
  }
  function onUpdated(updated: Activity) {
    setActivities((prev) => {
      const next = prev.map((a) => (a.id === updated.id ? updated : a));
      setSnapshot("activities", undefined, next);
      return next;
    });
  }
  function onDeleted(id: string) {
    setActivities((prev) => {
      const next = prev.filter((a) => a.id !== id);
      setSnapshot("activities", undefined, next);
      return next;
    });
  }

  const nameById = new Map((overview?.exercises ?? []).map((e) => [e.id, e.name]));
  const sessions = overview?.sessions ?? [];
  const now = Date.now();

  // Short walks aren't movements we track — filter them out of every Movement
  // surface (consistency, recent, by-activity), matching the chart's own rule.
  const movementActs = activities.filter(countsAsMovement);
  const consistency = buildConsistency(sessions, movementActs, now, periodDays);
  const rollups = overview ? buildRollups(sessions, movementActs, now, periodDays) : [];
  const recent = overview ? mergeTimeline(sessions, movementActs).slice(0, RECENT_CAP) : [];

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
        <Text style={styles.title}>Movement</Text>

        {hasDraft && (
          <Button
            label="Resume session"
            hint="in progress"
            onPress={startSession}
            variant="primary"
            accent={palette.strength.brand}
            size="lg"
            accessibilityLabel="resume session"
            style={styles.heroResume}
          />
        )}
        <Button
          label="+ Log movement"
          onPress={() => setLogOpen(true)}
          variant="primary"
          accent={palette.strength.brand}
          size="lg"
          accessibilityLabel="log movement"
        />

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
            {/* The app's standard period control — drives the whole page. */}
            <PeriodSelector
              value={periodDays}
              onChange={setPeriodDays}
              activeBg={palette.strength.brandSoft}
              activeText={palette.strength.brandBright}
            />

            {/* CONSISTENCY — "worked out N of last X days" + intensity bars. */}
            <MovementConsistency consistency={consistency} periodDays={periodDays} />

            {/* RECENT — the latest movements, tap to edit. The thing you just
                did, where you'd look for it. */}
            {recent.length > 0 && (
              <>
                <SectionHeader color={palette.strength.brand} style={styles.section}>
                  RECENT
                </SectionHeader>
                <View style={styles.list}>
                  {recent.map((item) =>
                    item.kind === "session" ? (
                      <SessionCard
                        key={`s-${item.session.id}`}
                        session={item.session}
                        exerciseNames={item.session.exercise_ids.map((id) => nameById.get(id) ?? id)}
                        onPress={() => openSession(item.session.id)}
                      />
                    ) : (
                      <ActivityCard
                        key={`a-${item.activity.id}`}
                        activity={item.activity}
                        onPress={() => setEditing(item.activity)}
                      />
                    )
                  )}
                </View>
              </>
            )}

            {/* BY ACTIVITY — one rollup per type; tap → that type's screen. */}
            <SectionHeader color={palette.strength.brand} style={styles.section}>
              BY ACTIVITY
            </SectionHeader>
            {rollups.length === 0 ? (
              <Text style={styles.empty}>
                Nothing logged yet. Start a session or log a movement.
              </Text>
            ) : (
              <MovementByActivity rollups={rollups} onPressType={openType} />
            )}

          </>
        )}
      </ScrollView>

      <QuickLogSheet
        visible={logOpen}
        onClose={() => setLogOpen(false)}
        onLogged={onLogged}
        onStartSession={startSession}
      />
      <ActivityDetailSheet
        key={editing?.id ?? "none"}
        activity={editing}
        visible={editing !== null}
        onClose={() => setEditing(null)}
        onUpdated={onUpdated}
        onDeleted={onDeleted}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 40 },
  title: {
    fontSize: fontSize.display,
    fontWeight: "800",
    color: palette.text,
    letterSpacing: -0.5,
    paddingTop: spacing.sm,
  },
  heroResume: { marginBottom: spacing.sm },
  section: { marginTop: spacing.sm },
  list: { gap: spacing.md },
  empty: { fontSize: fontSize.caption, color: palette.textSubtle },
  errorWrap: { alignItems: "center", gap: spacing.md, paddingTop: spacing.lg },
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
