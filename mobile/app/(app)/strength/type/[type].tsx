// Per-type movement screen — "click into Run, see my runs" (and Padel, Walk,
// Gym, …). Tapping a By-activity rollup on the Movement landing lands here:
// every session of that one type over the selected window, newest first, each
// tappable to edit (activities) or open its session detail (gym).
//
// Route: /(app)/strength/type/[type]?days=N. `days` mirrors the landing's
// period selector so the list matches what the rollup summarised.

import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { palette, borders, fontSize, spacing } from "@/lib/theme";
import { ApiError, fetchActivities, fetchStrengthOverview } from "@/lib/api";
import { getSnapshot, setSnapshot } from "@/lib/snapshot";
import { StrengthOverviewSkeleton } from "@/components/skeletons/StrengthOverviewSkeleton";
import { SessionCard, ActivityCard } from "@/components/MovementCard";
import { ActivityDetailSheet } from "@/components/ActivityDetailSheet";
import { movementType } from "@/lib/movementTypes";
import { windowStart } from "@/lib/movementRollup";
import type { Activity } from "@/lib/activityTypes";
import type { StrengthOverview, SessionSummary } from "@/lib/strengthTypes";

const DEFAULT_DAYS = 90;

export default function MovementTypeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string; days?: string }>();
  const type = (params.type ?? "other").toString();
  const days = Math.max(1, Math.min(365, Number(params.days) || DEFAULT_DAYS));
  const isGym = type === "gym";
  const name = movementType(type).name;

  const [activities, setActivities] = useState<Activity[]>([]);
  const [overview, setOverview] = useState<StrengthOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Activity | null>(null);
  const seededRef = useRef(false);

  const load = useCallback(async () => {
    if (!seededRef.current) {
      seededRef.current = true;
      if (isGym) {
        const cached = await getSnapshot<StrengthOverview>("strength");
        if (cached) {
          setOverview(cached);
          setLoading(false);
        }
      } else {
        const cached = await getSnapshot<Activity[]>("activities");
        if (cached) {
          setActivities(cached);
          setLoading(false);
        }
      }
    }
    try {
      if (isGym) {
        const data = await fetchStrengthOverview();
        setOverview(data);
        setSnapshot("strength", undefined, data);
      } else {
        const acts = await fetchActivities(Math.max(days, 90));
        setActivities(acts);
        setSnapshot("activities", undefined, acts);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isGym, days]);

  useEffect(() => {
    load();
  }, [load]);

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

  const now = Date.now();
  const from = windowStart(now, days);
  const nameById = new Map((overview?.exercises ?? []).map((e) => [e.id, e.name]));

  const gymSessions: SessionSummary[] = isGym
    ? (overview?.sessions ?? [])
        .filter((s) => s.completed_at >= from)
        .sort((a, b) => b.completed_at - a.completed_at)
    : [];
  const typeActivities: Activity[] = !isGym
    ? activities
        .filter((a) => a.type === type && a.started_at >= from)
        .sort((a, b) => b.started_at - a.started_at)
    : [];

  const count = isGym ? gymSessions.length : typeActivities.length;
  const hasData = count > 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="back" hitSlop={12}>
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{name}</Text>
        <View style={styles.headerSpacer} />
      </View>

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
        {loading && !hasData && !error && <StrengthOverviewSkeleton />}

        {error && !hasData && (
          <View style={styles.center}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {!loading && !hasData && !error && (
          <Text style={styles.empty}>No {name.toLowerCase()} logged in this window.</Text>
        )}

        <View style={styles.list}>
          {isGym
            ? gymSessions.map((s) => (
                <SessionCard
                  key={s.id}
                  session={s}
                  exerciseNames={s.exercise_ids.map((id) => nameById.get(id) ?? id)}
                  onPress={() => router.push(`/(app)/strength/log/${s.id}`)}
                />
              ))
            : typeActivities.map((a) => (
                <ActivityCard key={a.id} activity={a} onPress={() => setEditing(a)} />
              ))}
        </View>
      </ScrollView>

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
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: borders.bold,
    borderBottomColor: palette.ink,
  },
  back: { fontSize: 30, color: palette.text, fontWeight: "700", width: 32, lineHeight: 32 },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: fontSize.lead,
    fontWeight: "800",
    color: palette.text,
    letterSpacing: -0.3,
  },
  headerSpacer: { width: 32 },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 40 },
  list: { gap: spacing.md },
  center: { alignItems: "center", paddingTop: spacing.xl },
  errorText: { fontSize: fontSize.caption, color: palette.danger, textAlign: "center" },
  empty: { fontSize: fontSize.caption, color: palette.textSubtle, paddingTop: spacing.lg },
});
