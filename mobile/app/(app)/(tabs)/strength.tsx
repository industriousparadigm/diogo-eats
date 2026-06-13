// Movement landing — "how I moved". An OVERVIEW, not a feed. The flat union
// timeline (a dozen identical "Padel · 112m" cards) buried the two questions
// that matter, so the landing now answers them directly, top to bottom:
//
//   - ONE FRONT DOOR: a single "+ Log movement" hero (amber). A gym sesh is
//     just another movement, picked from the sheet's grid. Resume rides above
//     it only when a session draft exists.
//   - RHYTHM ("am I moving?"): a 28-day calendar grid — filled cell per day
//     moved. Streak/gap at a glance.
//   - BY ACTIVITY ("which, how often?"): ONE rollup card per type — count +
//     Whoop STRAIN (the metric that varies, not the samey duration) +
//     recency. Tap to expand into that type's sessions. A 4-week / 90-day
//     toggle widens the tally without ever becoming an endless scroll.
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
  Pressable,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { palette, radii, borders, fontSize, spacing } from "@/lib/theme";
import { SectionHeader, Button } from "@/components/ui";
import {
  ApiError,
  fetchStrengthOverview,
  fetchActivities,
} from "@/lib/api";
import { getSnapshot, setSnapshot } from "@/lib/snapshot";
import { StrengthOverviewSkeleton } from "@/components/skeletons/StrengthOverviewSkeleton";
import { loadDraft } from "@/lib/draftStorage";
import { mergeTimeline } from "@/lib/movementTimeline";
import {
  buildRhythm,
  activeDayCount,
  buildRollups,
  windowStart,
} from "@/lib/movementRollup";
import { MovementRhythm } from "@/components/MovementRhythm";
import { MovementRollupCard } from "@/components/MovementRollupCard";
import { QuickLogSheet } from "@/components/QuickLogSheet";
import { ActivityDetailSheet } from "@/components/ActivityDetailSheet";
import type { StrengthOverview } from "@/lib/strengthTypes";
import type { Activity } from "@/lib/activityTypes";
import type { TimelineItem } from "@/lib/movementTimeline";

// How many days of activities to pull for the landing (covers the 90-day view).
const ACTIVITY_DAYS = 90;
// The rhythm grid is always the recent 4 weeks — "am I moving lately".
const RHYTHM_DAYS = 28;
// The BY ACTIVITY tally window options (days). Default = 4 weeks.
const WINDOWS = [
  { days: 28, label: "4 wks" },
  { days: 90, label: "90 d" },
];

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
  const [windowDays, setWindowDays] = useState(WINDOWS[0].days);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    // First focus: seed both halves from cache so a returning user sees the
    // overview instantly, then refresh silently.
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
      // blank the gym scoreboard, so it falls back to null (and any cached
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

  function toggleType(type: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }
  function onPressItem(item: TimelineItem) {
    if (item.kind === "session") openSession(item.session.id);
    else setEditing(item.activity);
  }

  const nameById = new Map((overview?.exercises ?? []).map((e) => [e.id, e.name]));
  const sessions = overview?.sessions ?? [];
  const now = Date.now();

  const rhythm = buildRhythm(sessions, activities, now, RHYTHM_DAYS);
  const activeDays = activeDayCount(rhythm);
  // Movements in the rhythm window (28d), for its caption.
  const rhythmFrom = windowStart(now, RHYTHM_DAYS);
  const rhythmMovements = overview
    ? mergeTimeline(sessions, activities).filter((i) => i.at >= rhythmFrom).length
    : 0;
  const rollups = overview ? buildRollups(sessions, activities, now, windowDays) : [];

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

        {/* ONE FRONT DOOR. "+ Log movement" is the single hero — a gym sesh
            is just another movement, picked from the sheet's grid. The
            in-progress gym session is the one exception: "Resume session"
            rides ABOVE it so the gym-floor lifeline stays unmissable. */}
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
            {/* RHYTHM — "am I moving?" answered visually before any list. */}
            <MovementRhythm
              rhythm={rhythm}
              activeDays={activeDays}
              movements={rhythmMovements}
            />

            {/* BY ACTIVITY — one rollup per type (which + how often + strain).
                The window toggle widens the tally without an endless feed. */}
            <SectionHeader
              color={palette.strength.brand}
              style={styles.section}
              trailing={
                <View style={styles.toggle}>
                  {WINDOWS.map((w) => {
                    const on = w.days === windowDays;
                    return (
                      <Pressable
                        key={w.days}
                        onPress={() => setWindowDays(w.days)}
                        style={[styles.toggleChip, on && styles.toggleChipOn]}
                        accessibilityLabel={`show last ${w.label}`}
                      >
                        <Text style={[styles.toggleText, on && styles.toggleTextOn]}>
                          {w.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              }
            >
              BY ACTIVITY
            </SectionHeader>

            {rollups.length === 0 ? (
              <Text style={styles.empty}>
                Nothing logged yet. Start a session or log a movement.
              </Text>
            ) : (
              <View style={styles.rollups}>
                {rollups.map((r) => (
                  <MovementRollupCard
                    key={r.type}
                    rollup={r}
                    expanded={expanded.has(r.type)}
                    now={now}
                    onToggle={() => toggleType(r.type)}
                    onPressItem={onPressItem}
                    exerciseNamesFor={(ids) => ids.map((id) => nameById.get(id) ?? id)}
                  />
                ))}
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
        onStartSession={startSession}
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

  // One front door (+ the resume lifeline above it when a draft exists)
  heroResume: { marginBottom: spacing.sm },

  section: { marginTop: spacing.sm },

  // BY ACTIVITY window toggle (4 wks / 90 d)
  toggle: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  toggleChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
    borderWidth: borders.hairline,
    borderColor: palette.hairline,
  },
  toggleChipOn: {
    backgroundColor: palette.strength.brandSoft,
    borderColor: palette.strength.brand,
  },
  toggleText: {
    fontSize: fontSize.label,
    fontWeight: "700",
    color: palette.textSubtle,
    letterSpacing: 0.2,
  },
  toggleTextOn: { color: palette.strength.brandBright },

  // BY ACTIVITY rollups
  rollups: { gap: spacing.md },
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
