// Looking back — the satisfaction surface, native render of the web's
// History composition. Order is deliberate and load-bearing:
//   headline (what's working, rule-based) -> calendar -> averages ->
//   fiber trend (the lever to KEEP UP) -> sat fat trend (keep down).
// No streaks, no badges, no grades — identity language only.

import { useCallback, useEffect, useRef, useState } from "react";
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
import { Card, SectionHeader, StatNumber } from "@/components/ui";
import { OverviewSkeleton } from "@/components/skeletons/OverviewSkeleton";
import { ApiError, fetchProfile, fetchStats } from "@/lib/api";
import { buildHeadline, loggedAverages } from "@/lib/headline";
import { DEFAULT_TARGETS, type DayAggregate, type Targets } from "@/lib/types";
import { fmt, fmtCal, todayYmd } from "@/lib/format";
import { pickDay } from "@/lib/stores";
import { Heatmap } from "@/components/Heatmap";
import { TrendChart } from "@/components/TrendChart";

// Overview window options — a month vs a quarter. Drives both the fetch
// size and how much of the heatmap / trends the screen renders.
const WINDOWS = [
  { days: 30, label: "1M" },
  { days: 90, label: "3M" },
] as const;

export default function OverviewScreen() {
  const router = useRouter();
  const [aggs, setAggs] = useState<DayAggregate[] | null>(null);
  const [targets, setTargets] = useState<Targets>(DEFAULT_TARGETS);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [windowDays, setWindowDays] = useState<number>(90);
  const loadedOnce = useRef(false);

  const load = useCallback(async () => {
    try {
      const [stats, profile] = await Promise.all([
        fetchStats(windowDays),
        fetchProfile().catch(() => null),
      ]);
      setAggs(stats);
      if (profile) {
        setTargets({
          sat_fat_g: numOr(profile.sat_fat_g, DEFAULT_TARGETS.sat_fat_g),
          soluble_fiber_g: numOr(profile.soluble_fiber_g, DEFAULT_TARGETS.soluble_fiber_g),
          calories: numOr(profile.calories, DEFAULT_TARGETS.calories),
          protein_g: numOr(profile.protein_g, DEFAULT_TARGETS.protein_g),
        });
      }
      setError(null);
      loadedOnce.current = true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load history");
      if (!loadedOnce.current) setAggs([]);
    } finally {
      setRefreshing(false);
    }
  }, [windowDays]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Refetch when the window changes (focus already covers the first load).
  const windowMountRef = useRef(true);
  useEffect(() => {
    if (windowMountRef.current) {
      windowMountRef.current = false;
      return;
    }
    load();
  }, [windowDays, load]);

  // Switching the window refetches immediately (don't wait for re-focus).
  function changeWindow(days: number) {
    if (days === windowDays) return;
    setAggs(null);
    setWindowDays(days);
  }

  function onPickDate(ymd: string) {
    pickDay(ymd);
    router.navigate("/(app)/(tabs)");
  }

  const loading = aggs === null;
  const logged = (aggs ?? []).filter((a) => a.meal_count > 0).length;
  const headline = aggs ? buildHeadline(aggs, targets) : null;
  const averages = aggs ? loggedAverages(aggs, 14) : null;

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
            tintColor={palette.food.accent}
            colors={[palette.food.accent]}
          />
        }
      >
        <View style={styles.headerRow}>
          <Text style={styles.title}>Looking back</Text>
          <View style={styles.windowToggle}>
            {WINDOWS.map((w) => {
              const active = w.days === windowDays;
              return (
                <TouchableOpacity
                  key={w.days}
                  onPress={() => changeWindow(w.days)}
                  style={[styles.windowBtn, active && styles.windowBtnActive]}
                  accessibilityLabel={`show ${w.label}`}
                >
                  <Text style={[styles.windowText, active && styles.windowTextActive]}>
                    {w.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        {!loading && (
          <Text style={styles.loggedCount}>
            {logged} day{logged === 1 ? "" : "s"} logged in this window
          </Text>
        )}

        {loading ? (
          <OverviewSkeleton />
        ) : (
          <>
            {/* Headline or first-days copy */}
            {logged < 3 ? (
              <Card style={styles.headlineCard}>
                <Text style={styles.headlineText}>
                  {logged === 0
                    ? "Just getting started. Log a few and you'll start seeing patterns here."
                    : `${logged} day${logged === 1 ? "" : "s"} in. A few more and you'll start seeing patterns.`}
                </Text>
              </Card>
            ) : (
              headline && (
                <Card identity={palette.food.accentDeep} style={styles.headlineCard}>
                  <Text style={styles.headlineText}>{headline}</Text>
                </Card>
              )
            )}

            <Heatmap
              aggregates={aggs ?? []}
              selectedDate={todayYmd()}
              onPickDate={onPickDate}
            />

            {/* Coverage-honest averages — logged days only, and says so */}
            {averages && averages.loggedDays >= 3 && (
              <Card tone="recessed" style={styles.avgCard}>
                <SectionHeader>
                  {`AVERAGES · LAST ${averages.loggedDays} LOGGED DAY${averages.loggedDays === 1 ? "" : "S"}`}
                </SectionHeader>
                <View style={styles.avgRow}>
                  <StatNumber label="plant" value={`${Math.round(averages.plant_pct)}%`} color={palette.food.accent} align="left" />
                  <StatNumber label="fiber" value={`${fmt(averages.soluble_fiber_g)}g`} align="left" />
                  <StatNumber label="sat fat" value={`${fmt(averages.sat_fat_g)}g`} align="left" />
                  <StatNumber label="kcal" value={fmtCal(averages.calories)} align="left" />
                  <StatNumber label="protein" value={`${fmt(averages.protein_g, 0)}g`} align="left" />
                </View>
              </Card>
            )}

            {logged >= 3 && (
              <>
                <TrendChart
                  aggregates={aggs ?? []}
                  title="SOLUBLE FIBER · 7-DAY AVERAGE"
                  target={targets.soluble_fiber_g}
                  pick={(a) => a.soluble_fiber_g}
                  direction="keep_up"
                />
                <TrendChart
                  aggregates={aggs ?? []}
                  title="SAT FAT · 7-DAY AVERAGE"
                  target={targets.sat_fat_g}
                  pick={(a) => a.sat_fat_g}
                  direction="keep_down"
                />
              </>
            )}

            {error && (
              <View style={styles.errorRow}>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity onPress={load} style={styles.retryBtn}>
                  <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function numOr(v: unknown, fallback: number): number {
  return typeof v === "number" && isFinite(v) && v > 0 ? v : fallback;
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: spacing.sm,
  },
  title: {
    fontSize: fontSize.display,
    fontWeight: "800",
    color: palette.text,
    letterSpacing: -0.5,
  },
  loggedCount: {
    fontSize: fontSize.caption,
    color: palette.textSubtle,
  },
  windowToggle: {
    flexDirection: "row",
    backgroundColor: palette.surfaceAlt,
    borderWidth: borders.bold,
    borderColor: palette.ink,
    borderRadius: radii.sm,
    padding: 3,
    gap: 2,
  },
  windowBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.xs,
  },
  windowBtnActive: {
    backgroundColor: palette.food.accentSoft,
  },
  windowText: {
    fontSize: fontSize.caption,
    fontWeight: "700",
    color: palette.textSubtle,
    letterSpacing: 0.3,
  },
  windowTextActive: {
    color: palette.food.accentBright,
  },
  headlineCard: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  headlineText: {
    fontSize: fontSize.title,
    lineHeight: 24,
    color: palette.text,
    letterSpacing: -0.1,
  },
  avgCard: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  avgRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  errorRow: {
    alignItems: "center",
    gap: spacing.md,
    paddingTop: spacing.sm,
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
