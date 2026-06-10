// Looking back — the satisfaction surface, native render of the web's
// History composition. Order is deliberate and load-bearing:
//   headline (what's working, rule-based) -> calendar -> averages ->
//   fiber trend (the lever to KEEP UP) -> sat fat trend (keep down).
// No streaks, no badges, no grades — identity language only.

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
import { colors, radii } from "@/lib/colors";
import { ApiError, fetchProfile, fetchStats } from "@/lib/api";
import { buildHeadline, loggedAverages } from "@/lib/headline";
import { DEFAULT_TARGETS, type DayAggregate, type Targets } from "@/lib/types";
import { fmt, fmtCal, todayYmd } from "@/lib/format";
import { pickDay } from "@/lib/stores";
import { Heatmap } from "@/components/Heatmap";
import { TrendChart } from "@/components/TrendChart";

export default function OverviewScreen() {
  const router = useRouter();
  const [aggs, setAggs] = useState<DayAggregate[] | null>(null);
  const [targets, setTargets] = useState<Targets>(DEFAULT_TARGETS);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const loadedOnce = useRef(false);

  const load = useCallback(async () => {
    try {
      const [stats, profile] = await Promise.all([
        fetchStats(84),
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
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

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
            tintColor={colors.brand}
            colors={[colors.brand]}
          />
        }
      >
        <View style={styles.headerRow}>
          <Text style={styles.title}>Looking back</Text>
          {!loading && (
            <Text style={styles.loggedCount}>
              {logged} day{logged === 1 ? "" : "s"} logged
            </Text>
          )}
        </View>

        {loading ? (
          <View style={styles.skeleton} />
        ) : (
          <>
            {/* Headline or first-days copy */}
            {logged < 3 ? (
              <View style={styles.headlineCard}>
                <Text style={styles.headlineText}>
                  {logged === 0
                    ? "Just getting started. Log a few and you'll start seeing patterns here."
                    : `${logged} day${logged === 1 ? "" : "s"} in. A few more and you'll start seeing patterns.`}
                </Text>
              </View>
            ) : (
              headline && (
                <View style={styles.headlineCard}>
                  <Text style={styles.headlineText}>{headline}</Text>
                </View>
              )
            )}

            <Heatmap
              aggregates={aggs ?? []}
              selectedDate={todayYmd()}
              onPickDate={onPickDate}
            />

            {/* Coverage-honest averages — logged days only, and says so */}
            {averages && averages.loggedDays >= 3 && (
              <View style={styles.avgCard}>
                <Text style={styles.avgTitle}>
                  AVERAGES · LAST {averages.loggedDays} LOGGED DAY
                  {averages.loggedDays === 1 ? "" : "S"}
                </Text>
                <View style={styles.avgRow}>
                  <AvgStat label="plant" value={`${Math.round(averages.plant_pct)}%`} accent />
                  <AvgStat label="fiber" value={`${fmt(averages.soluble_fiber_g)}g`} />
                  <AvgStat label="sat fat" value={`${fmt(averages.sat_fat_g)}g`} />
                  <AvgStat label="kcal" value={fmtCal(averages.calories)} />
                  <AvgStat label="protein" value={`${fmt(averages.protein_g, 0)}g`} />
                </View>
              </View>
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

function AvgStat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View style={styles.avgStat}>
      <Text style={[styles.avgValue, accent && styles.avgValueAccent]}>{value}</Text>
      <Text style={styles.avgLabel}>{label}</Text>
    </View>
  );
}

function numOr(v: unknown, fallback: number): number {
  return typeof v === "number" && isFinite(v) && v > 0 ? v : fallback;
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingTop: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: -0.5,
  },
  loggedCount: {
    fontSize: 12,
    color: colors.textFaint,
  },
  skeleton: {
    height: 320,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.lg,
    opacity: 0.5,
  },
  headlineCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  headlineText: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.text,
    letterSpacing: -0.1,
  },
  avgCard: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
  },
  avgTitle: {
    fontSize: 11,
    color: colors.textSubtle,
    letterSpacing: 0.5,
    fontWeight: "500",
  },
  avgRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  avgStat: {
    alignItems: "flex-start",
  },
  avgValue: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  avgValueAccent: {
    color: colors.brand,
  },
  avgLabel: {
    fontSize: 10,
    color: colors.textSubtle,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  errorRow: {
    alignItems: "center",
    gap: 10,
    paddingTop: 8,
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
