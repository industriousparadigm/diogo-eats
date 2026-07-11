// Body — the comprehensive Garmin screen. The GarminChip on the Today
// header is a glance; this is the full picture behind it: today's
// strain/recovery + every wellness component, a 7-day trend, and the
// recent activities Garmin (or manual logging) measured.
//
// Read-only: a Pi cron keeps garmin_daily fresh (Garmin blocks datacenter
// IPs, so there's no sync-from-app path). Register: loud, like strength —
// this is a vitals scoreboard, not a food surface.
//
// Route: /(app)/garmin?day=YYYY-MM-DD (day defaults to today; the chip
// passes whatever day is currently being viewed on the Today tab). The
// 7-day trend and recent activities are always "the last N days ending
// today", independent of the viewed day.

import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { palette, borders, radii, spacing, fontSize, condensedFamily } from "@/lib/theme";
import { Card, SectionHeader, StatNumber, SkeletonCard, SkeletonBlock } from "@/components/ui";
import { ActivityCard } from "@/components/MovementCard";
import { ActivityDetailSheet } from "@/components/ActivityDetailSheet";
import {
  ApiError,
  fetchGarminStatus,
  fetchGarminHistory,
  fetchActivities,
  type GarminDailyRow,
} from "@/lib/api";
import { todayYmd, dayNavLabel } from "@/lib/format";
import type { Activity } from "@/lib/activityTypes";

const TREND_DAYS = 7;
const RECENT_LOOKBACK_DAYS = 14;
const RECENT_LIMIT = 5;
const BAR_MAX_HEIGHT = 64;

// Recovery (sleep score) tint — the same restrained tri-color scale the
// chip and the Today header use.
function recoveryColor(recovery: number | null): string {
  if (recovery == null) return palette.textSubtle;
  if (recovery < 34) return palette.danger;
  if (recovery < 67) return palette.warn;
  return palette.food.accentBright;
}

// "MON" — a short weekday label for the trend strip's x-axis.
function fmtWeekdayShort(ymd: string): string {
  const [y, mo, d] = ymd.split("-").map(Number);
  const date = new Date(y, mo - 1, d);
  return date.toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase();
}

export default function GarminScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ day?: string }>();
  const day = (params.day ?? todayYmd()).toString();

  const [today, setToday] = useState<GarminDailyRow | null>(null);
  const [trend, setTrend] = useState<GarminDailyRow[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Activity | null>(null);

  const load = useCallback(async () => {
    try {
      const [status, history, acts] = await Promise.all([
        fetchGarminStatus(day),
        fetchGarminHistory(TREND_DAYS),
        fetchActivities(RECENT_LOOKBACK_DAYS),
      ]);
      setToday(status.today);
      setTrend(history);
      setActivities(acts);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [day]);

  useEffect(() => {
    load();
  }, [load]);

  function onUpdated(updated: Activity) {
    setActivities((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  }
  function onDeleted(id: string) {
    setActivities((prev) => prev.filter((a) => a.id !== id));
  }

  const strain = today?.strain ?? null;
  const recovery = today?.recovery ?? null;
  const recColor = recoveryColor(recovery);
  const intensityMin = (today?.intensity_moderate_min ?? 0) + (today?.intensity_vigorous_min ?? 0);
  const recent = activities.slice(0, RECENT_LIMIT);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="back" hitSlop={12}>
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.title}>Body</Text>
          <Text style={styles.subtitle}>{dayNavLabel(day)}</Text>
        </View>
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
        {loading && !today && !error ? (
          <View style={styles.skeletons}>
            <SkeletonCard identity={palette.strength.brand} depth="loud" style={styles.heroSkeleton}>
              <SkeletonBlock width={120} height={40} />
            </SkeletonCard>
            <SkeletonCard style={styles.gridSkeleton}>
              <SkeletonBlock width="100%" height={80} />
            </SkeletonCard>
          </View>
        ) : null}

        {error && !today ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {!loading && !today && !error ? (
          <Text style={styles.empty}>No Garmin data for {dayNavLabel(day).toLowerCase()}.</Text>
        ) : null}

        {today ? (
          <>
            {/* Hero: the two headline numbers, loud register. */}
            <Card identity={palette.strength.brand} depth="loud" tint={palette.strength.brandSoft} style={styles.hero}>
              <StatNumber
                value={strain != null ? strain.toFixed(1) : "—"}
                label="strain"
                color={palette.strength.brandBright}
                size="lg"
                flex
              />
              <View style={styles.heroDivider} />
              <StatNumber
                value={recovery != null ? `${recovery}%` : "—"}
                label="recovery"
                color={recColor}
                size="lg"
                flex
              />
            </Card>

            {/* Today's components. */}
            <SectionHeader color={palette.strength.brand} style={styles.section}>
              {dayNavLabel(day).toUpperCase()}
            </SectionHeader>
            <Card tone="recessed" flat style={styles.gridCard}>
              <View style={styles.grid}>
                <GridCell
                  label="Sleep"
                  value={today.sleep_hours != null ? `${today.sleep_hours.toFixed(1)}h` : "—"}
                  sub={today.sleep_score != null ? `score ${today.sleep_score}` : undefined}
                />
                <GridCell
                  label="Resting HR"
                  value={today.resting_hr != null ? String(today.resting_hr) : "—"}
                  sub="bpm"
                />
                <GridCell
                  label="Body battery"
                  value={
                    today.body_battery_low != null && today.body_battery_high != null
                      ? `${today.body_battery_low}→${today.body_battery_high}`
                      : "—"
                  }
                  sub={today.body_battery_drained != null ? `drained ${today.body_battery_drained}` : undefined}
                />
                <GridCell
                  label="Steps"
                  value={today.steps != null ? today.steps.toLocaleString("en-GB") : "—"}
                />
                <GridCell
                  label="Active kcal"
                  value={today.active_kcal != null ? String(today.active_kcal) : "—"}
                />
                <GridCell
                  label="Intensity"
                  value={`${intensityMin}m`}
                  sub={`${today.intensity_vigorous_min ?? 0} vigorous`}
                />
              </View>
            </Card>
          </>
        ) : null}

        {/* 7-day trend — always the last 7 days ending today, regardless of
            the viewed day above. */}
        {trend.length > 0 ? (
          <>
            <SectionHeader color={palette.strength.brand} style={styles.section}>
              7-DAY TREND
            </SectionHeader>
            <Card tone="recessed" flat style={styles.trendCard}>
              <View style={styles.trendRow}>
                {trend.map((d) => (
                  <TrendBar key={d.day} day={d} />
                ))}
              </View>
            </Card>
          </>
        ) : null}

        {/* Recent activities — general movement + gym, whatever Garmin or
            manual logging measured, newest first. */}
        <SectionHeader style={styles.section}>RECENT ACTIVITY</SectionHeader>
        {recent.length === 0 ? (
          <Text style={styles.empty}>No activity logged recently.</Text>
        ) : (
          <View style={styles.activityList}>
            {recent.map((a) => (
              <ActivityCard key={a.id} activity={a} onPress={() => setEditing(a)} />
            ))}
          </View>
        )}
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

function GridCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={styles.cell}>
      <Text style={styles.cellLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.cellValue}>{value}</Text>
      {sub ? <Text style={styles.cellSub}>{sub}</Text> : null}
    </View>
  );
}

function TrendBar({ day }: { day: GarminDailyRow }) {
  const strain = day.strain;
  const barHeight = strain != null ? Math.max(6, Math.round((Math.min(strain, 21) / 21) * BAR_MAX_HEIGHT)) : 4;
  return (
    <View style={styles.trendCol}>
      <Text style={styles.trendStrainLabel}>{strain != null ? strain.toFixed(1) : "—"}</Text>
      <View style={styles.trendTrack}>
        <View
          style={[
            styles.trendBar,
            {
              height: barHeight,
              backgroundColor: strain != null ? palette.strength.brand : palette.hairline,
            },
          ]}
        />
      </View>
      <Text style={styles.trendDayLabel}>{fmtWeekdayShort(day.day)}</Text>
      <Text style={[styles.trendRecLabel, { color: recoveryColor(day.recovery) }]}>
        {day.recovery != null ? `${day.recovery}%` : "—"}
      </Text>
    </View>
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
  headerTitleWrap: { flex: 1, alignItems: "center" },
  title: {
    fontSize: fontSize.lead,
    fontWeight: "800",
    color: palette.text,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: fontSize.label,
    color: palette.textSubtle,
    fontWeight: "700",
    marginTop: 1,
  },
  headerSpacer: { width: 32 },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 40 },
  center: { alignItems: "center", paddingTop: spacing.xl },
  errorText: { fontSize: fontSize.caption, color: palette.danger, textAlign: "center" },
  empty: { fontSize: fontSize.caption, color: palette.textSubtle },
  skeletons: { gap: spacing.md },
  heroSkeleton: { height: 100, alignItems: "center", justifyContent: "center" },
  gridSkeleton: { height: 140, padding: spacing.md, justifyContent: "center" },

  hero: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.xl,
  },
  heroDivider: {
    width: borders.hairline,
    height: 48,
    backgroundColor: palette.inkSoft,
  },

  section: { marginTop: spacing.xs },

  gridCard: { padding: spacing.md },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  cell: { width: "45%", gap: 2 },
  cellLabel: {
    fontSize: fontSize.micro,
    letterSpacing: 0.5,
    color: palette.textFaint,
  },
  cellValue: {
    fontFamily: condensedFamily,
    fontSize: fontSize.display,
    fontWeight: "800",
    color: palette.text,
    letterSpacing: condensedFamily ? 0.3 : -0.5,
  },
  cellSub: {
    fontSize: fontSize.micro,
    color: palette.textSubtle,
  },

  trendCard: { padding: spacing.md },
  trendRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  trendCol: { alignItems: "center", flex: 1, gap: 4 },
  trendStrainLabel: {
    fontSize: fontSize.micro,
    fontWeight: "700",
    color: palette.textMuted,
  },
  trendTrack: {
    height: BAR_MAX_HEIGHT,
    width: 16,
    justifyContent: "flex-end",
  },
  trendBar: {
    width: 16,
    borderRadius: radii.xs,
  },
  trendDayLabel: {
    fontSize: fontSize.micro,
    fontWeight: "700",
    letterSpacing: 0.3,
    color: palette.textSubtle,
  },
  trendRecLabel: {
    fontSize: fontSize.micro,
    fontWeight: "800",
  },

  activityList: { gap: spacing.md },
});
