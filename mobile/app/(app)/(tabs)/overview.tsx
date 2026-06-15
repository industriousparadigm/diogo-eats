// Looking back — the satisfaction surface, native render of the web's
// History composition. ONE period selector governs the whole page (headline
// window, averages window, signals, both trend charts, the heatmap range).
//
// Order is deliberate and load-bearing (owner feedback, rebuilt):
//   headline (what's working, rule-based)
//   -> averages (logged-days-only, coverage-honest)
//   -> signals (honest day-level counts for the window)
//   -> fiber trend (the lever to KEEP UP)
//   -> sat fat trend (the lever to keep DOWN)
//   -> heatmap + legend (the green squares, now at the BOTTOM)
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
import { deriveSignals } from "@/lib/signals";
import { DEFAULT_TARGETS, type DayAggregate, type Targets } from "@/lib/types";
import { fmt, fmtCal, todayYmd } from "@/lib/format";
import { pickDay } from "@/lib/stores";
import { Heatmap } from "@/components/Heatmap";
import { TrendChart } from "@/components/TrendChart";
import { SignalsRow } from "@/components/SignalsRow";
import { PeriodSelector } from "@/components/PeriodSelector";

// ONE period selector governs the whole page: it sets the fetch size (days)
// and every surface derives from that same window. /api/stats?days=N serves
// arbitrary N from 7 to 365 (clamped server-side). The selector itself (the
// 7d/15d/1mo/3mo/1y options) is the shared PeriodSelector — same control as
// Movement.
const DEFAULT_DAYS = 15;

export default function OverviewScreen() {
  const router = useRouter();
  const [aggs, setAggs] = useState<DayAggregate[] | null>(null);
  const [targets, setTargets] = useState<Targets>(DEFAULT_TARGETS);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [periodDays, setPeriodDays] = useState<number>(DEFAULT_DAYS);
  const loadedOnce = useRef(false);

  const load = useCallback(async () => {
    try {
      const [stats, profile] = await Promise.all([
        fetchStats(periodDays),
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
  }, [periodDays]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Refetch when the period changes (focus already covers the first load).
  const periodMountRef = useRef(true);
  useEffect(() => {
    if (periodMountRef.current) {
      periodMountRef.current = false;
      return;
    }
    load();
  }, [periodDays, load]);

  // Switching the period refetches immediately (don't wait for re-focus).
  function changePeriod(days: number) {
    if (days === periodDays) return;
    setAggs(null);
    setPeriodDays(days);
  }

  function onPickDate(ymd: string) {
    pickDay(ymd);
    router.navigate("/(app)/(tabs)");
  }

  const loading = aggs === null;
  const logged = (aggs ?? []).filter((a) => a.meal_count > 0).length;
  const headline = aggs ? buildHeadline(aggs, targets) : null;
  // The period governs everything: average over ALL logged days in the
  // selected window (logged-days-only semantics + the coverage line stay).
  const averages = aggs ? loggedAverages(aggs, Number.MAX_SAFE_INTEGER) : null;
  // Day-level signals — honest counts over the same window.
  const signals = aggs ? deriveSignals(aggs, { caloriesTarget: targets.calories }) : [];

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
        </View>

        {/* The one period selector — the shared control (food accent here). */}
        <PeriodSelector value={periodDays} onChange={changePeriod} />

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

            {/* Coverage-honest averages — logged days in this window only,
                and says so (the period governs everything). */}
            {averages && averages.loggedDays >= 3 && (
              <Card tone="recessed" style={styles.avgCard}>
                <SectionHeader>AVERAGES · LOGGED DAYS THIS WINDOW</SectionHeader>
                <Text style={styles.avgCoverage}>
                  {`${averages.loggedDays} logged day${averages.loggedDays === 1 ? "" : "s"} in this window`}
                </Text>
                <View style={styles.avgRow}>
                  <StatNumber label="plant" value={`${Math.round(averages.plant_pct)}%`} color={palette.food.accent} align="left" />
                  <StatNumber label="fiber" value={`${fmt(averages.soluble_fiber_g)}g`} align="left" />
                  <StatNumber label="sat fat" value={`${fmt(averages.sat_fat_g)}g`} align="left" />
                  <StatNumber label="kcal" value={fmtCal(averages.calories)} align="left" />
                  <StatNumber label="protein" value={`${fmt(averages.protein_g, 0)}g`} align="left" />
                </View>
              </Card>
            )}

            {/* Day-level signals — honest counts over the window. */}
            {logged >= 3 && <SignalsRow signals={signals} />}

            {/* Trend charts — fiber (keep up), sat fat (keep down). */}
            {logged >= 3 && (
              <>
                <TrendChart
                  aggregates={aggs ?? []}
                  title="SOLUBLE FIBER"
                  target={targets.soluble_fiber_g}
                  pick={(a) => a.soluble_fiber_g}
                  direction="keep_up"
                />
                <TrendChart
                  aggregates={aggs ?? []}
                  title="SAT FAT"
                  target={targets.sat_fat_g}
                  pick={(a) => a.sat_fat_g}
                  direction="keep_down"
                />
              </>
            )}

            {/* The heatmap moves to the BOTTOM of the page (owner feedback). */}
            <Heatmap
              aggregates={aggs ?? []}
              selectedDate={todayYmd()}
              onPickDate={onPickDate}
            />

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
    marginTop: -spacing.sm,
  },
  // The period selector spreads its five options evenly across the row.
  periodToggle: {
    flexDirection: "row",
    backgroundColor: palette.surfaceAlt,
    borderWidth: borders.bold,
    borderColor: palette.ink,
    borderRadius: radii.sm,
    padding: 3,
    gap: 2,
  },
  periodBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.xs,
    borderRadius: radii.xs,
  },
  periodBtnActive: {
    backgroundColor: palette.food.accentSoft,
  },
  periodText: {
    fontSize: fontSize.caption,
    fontWeight: "700",
    color: palette.textSubtle,
    letterSpacing: 0.3,
  },
  periodTextActive: {
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
    gap: spacing.sm,
  },
  avgCoverage: {
    fontSize: fontSize.caption,
    color: palette.textSubtle,
    marginTop: -2,
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
