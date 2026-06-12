// Movement landing — "how I moved". The strength scoreboard's dashboard,
// evolved: gym sessions are now ONE kind of movement; general activities
// (padel, runs, walks…) join them in a single union timeline.
//
// Top to bottom:
//   - DUAL HERO: "Start session" (gym — the scoreboard with the deadline
//     anchor, slightly leading) + "+ Log movement" (everything else). Both
//     prominent.
//   - STAT STRIP (loud): sessions·mo, beats·mo, active days·mo (any gym
//     session OR activity that day, phone-local), last moved.
//   - RECENT: the UNION timeline — sessions + activities interleaved
//     newest-first, each an IMAGE-LED card in its type's identity.
//
// The per-exercise catalog still lives one tap behind "All exercises". The
// route folder is internally "strength" (unchanged); the tab presents as
// Movement.

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
import { Card, StatNumber, SectionHeader, Button } from "@/components/ui";
import {
  ApiError,
  fetchStrengthOverview,
  fetchActivities,
} from "@/lib/api";
import { getSnapshot, setSnapshot } from "@/lib/snapshot";
import { StrengthOverviewSkeleton } from "@/components/skeletons/StrengthOverviewSkeleton";
import { loadDraft } from "@/lib/draftStorage";
import { strengthStats } from "@/lib/strengthStats";
import { fmtLastSession } from "@/lib/strengthFormat";
import {
  mergeTimeline,
  activeDaysThisMonth,
  lastMovedAt,
} from "@/lib/movementTimeline";
import { SessionCard, ActivityCard } from "@/components/MovementCard";
import { QuickLogSheet } from "@/components/QuickLogSheet";
import { ActivityDetailSheet } from "@/components/ActivityDetailSheet";
import type { StrengthOverview } from "@/lib/strengthTypes";
import type { Activity } from "@/lib/activityTypes";

// The union timeline is a glance; the long view lives in the library + each
// exercise's career timeline. Cap so a year of movement doesn't render at once.
const RECENT_CAP = 20;
// How many days of activities to pull for the landing.
const ACTIVITY_DAYS = 90;

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

  const load = useCallback(async () => {
    // First focus: seed both halves from cache so a returning user sees the
    // timeline instantly, then refresh silently.
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
      // Activities are a soft dependency: a failed activity fetch must not
      // blank the gym scoreboard, so it falls back to [] (and any cached
      // rows already shown stay put).
      const [data, acts] = await Promise.all([
        fetchStrengthOverview(),
        fetchActivities(ACTIVITY_DAYS).catch(() => null),
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

  // A new activity from the quick-log sheet: prepend so it shows instantly,
  // and refresh the cache.
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
  const stats = overview ? strengthStats(sessions, Date.now()) : null;
  const timeline = overview
    ? mergeTimeline(sessions, activities).slice(0, RECENT_CAP)
    : [];
  const activeDays = activeDaysThisMonth(sessions, activities, Date.now());
  const lastMoved = lastMovedAt(sessions, activities);

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

        {/* DUAL HERO. Gym leads (the scoreboard with the deadline anchor);
            "+ Log movement" sits beside it for everything else. */}
        <View style={styles.heroRow}>
          <Button
            label={hasDraft ? "Resume session" : "Start session"}
            hint={hasDraft ? "in progress" : "gym"}
            onPress={startSession}
            variant="primary"
            accent={palette.strength.brand}
            size="lg"
            accessibilityLabel={hasDraft ? "resume session" : "start session"}
            style={styles.heroPrimary}
          />
          <Button
            label="+ Log movement"
            hint="padel · run · walk…"
            onPress={() => setLogOpen(true)}
            variant="secondary"
            accent={palette.strength.brand}
            size="lg"
            accessibilityLabel="log movement"
            style={styles.heroSecondary}
          />
        </View>

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
            {/* STAT STRIP — the movement glance. Four cells: sessions, beats,
                active days (sessions OR activities), last moved. Flat Card
                (supporting strip — the offset block stays the timeline's). */}
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
                value={String(activeDays)}
                label="active days · mo"
                color={palette.strength.brandBright}
                flex
              />
              <View style={styles.statDivider} />
              <StatNumber value={fmtLastSession(lastMoved)} label="last moved" flex />
            </Card>

            {/* RECENT — the UNION timeline: sessions + activities interleaved
                newest-first, each an image-led card in its identity. */}
            <SectionHeader color={palette.strength.brand} style={styles.section}>
              RECENT
            </SectionHeader>
            {timeline.length === 0 ? (
              <Text style={styles.empty}>
                Nothing logged yet. Start a session or log a movement.
              </Text>
            ) : (
              <View style={styles.timeline}>
                {timeline.map((item) =>
                  item.kind === "session" ? (
                    <SessionCard
                      key={`s-${item.session.id}`}
                      session={item.session}
                      exerciseNames={item.session.exercise_ids.map(
                        (id) => nameById.get(id) ?? id
                      )}
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
            )}

            {/* The exercise catalog, one tap away (browsing belongs there). */}
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

      <QuickLogSheet
        visible={logOpen}
        onClose={() => setLogOpen(false)}
        onLogged={onLogged}
      />
      <ActivityDetailSheet
        // Key by id so the editor re-inits its fields per opened card.
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

  // Dual hero
  heroRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  heroPrimary: { flex: 1.15 },
  heroSecondary: { flex: 1 },

  section: { marginTop: spacing.sm },

  // Stat strip
  statStrip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  statDivider: {
    width: borders.hairline,
    alignSelf: "stretch",
    marginVertical: spacing.xs,
    backgroundColor: palette.hairline,
  },

  // Union timeline
  timeline: { gap: spacing.md },
  empty: { fontSize: fontSize.caption, color: palette.textSubtle },

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
  libraryChevron: { fontSize: fontSize.lead, color: palette.textSubtle, fontWeight: "700" },

  // Errors
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
