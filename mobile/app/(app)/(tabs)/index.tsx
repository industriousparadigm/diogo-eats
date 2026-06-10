// Day screen — the daily food loop, anchored to today.
//
// - Day navigation: chevrons walk to previous days; the label taps back
//   to today; the forward chevron disables at today.
// - Fetches the viewed day's meals on mount, on day change, on focus,
//   and on app-foreground resume.
// - Pending cards (optimistic) sit at top while a parse is in flight.
// - Tap a meal -> detail/edit screen. Long-press -> quick delete.
// - FAB opens CaptureSheet; when viewing a past day the capture is
//   logged INTO that day (for_date backfill).

import { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  AppState,
  type AppStateStatus,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { fetchMeals, deleteMeal, parseMealPhoto, parseMealText, ApiError } from "@/lib/api";
import { computeDayTotals } from "@/lib/types";
import { dayNavLabel, shiftYmd, todayYmd } from "@/lib/format";
import { colors, radii } from "@/lib/colors";
import { consumePendingDay, onDayPicked, stashMeal } from "@/lib/stores";
import { MealCard } from "@/components/MealCard";
import { DayTotalsStrip } from "@/components/DayTotalsStrip";
import { PendingCard, type PendingState } from "@/components/PendingCard";
import { CaptureSheet, type CaptureResult } from "@/components/CaptureSheet";
import { WhoopChip } from "@/components/WhoopChip";
import type { Meal } from "@/lib/types";

export default function DayScreen() {
  const router = useRouter();
  const [day, setDay] = useState(todayYmd());
  const [meals, setMeals] = useState<Meal[]>([]);
  const [pending, setPending] = useState<PendingState[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);

  const isToday = day === todayYmd();
  const dayRef = useRef(day);
  dayRef.current = day;

  // Load the viewed day's meals.
  const loadMeals = useCallback(
    async (quiet = false) => {
      if (!quiet) {
        setError(null);
        setLoading(true);
      }
      try {
        const data = await fetchMeals(day);
        // Newest-first.
        setMeals([...data].sort((a, b) => b.created_at - a.created_at));
        if (quiet) setError(null);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError("Could not load meals");
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [day]
  );

  useEffect(() => {
    loadMeals();
  }, [loadMeals]);

  // On re-focus (returning from the edit screen, switching back to this
  // tab): consume a day picked on the overview heatmap, else reload
  // quietly. The FIRST focus is skipped — the mount effect above already
  // loads, and double-fetching makes error states flicker.
  const loadRef = useRef(loadMeals);
  loadRef.current = loadMeals;
  const firstFocusRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      const picked = consumePendingDay();
      if (picked && picked !== dayRef.current) {
        firstFocusRef.current = false;
        setDay(picked); // day change triggers a full load via the effect
        return;
      }
      if (firstFocusRef.current) {
        firstFocusRef.current = false;
        return;
      }
      loadRef.current(true);
    }, [])
  );

  // Heatmap taps while this tab is mounted-but-blurred land here too.
  useEffect(() => {
    return onDayPicked((ymd) => {
      if (ymd !== dayRef.current) setDay(ymd);
    });
  }, []);

  // Refetch on app foreground — reconcile any meals parsed while
  // the app was backgrounded or killed mid-parse.
  const appStateRef = useRef(AppState.currentState);
  useEffect(() => {
    function handleAppState(next: AppStateStatus) {
      if (appStateRef.current.match(/inactive|background/) && next === "active") {
        loadMeals(true);
      }
      appStateRef.current = next;
    }
    const sub = AppState.addEventListener("change", handleAppState);
    return () => sub.remove();
  }, [loadMeals]);

  function onRefresh() {
    setRefreshing(true);
    loadMeals(true);
  }

  function shiftDay(delta: number) {
    const next = shiftYmd(day, delta);
    if (next > todayYmd()) return;
    setDay(next);
  }

  async function handleDelete(id: string) {
    // Optimistically remove from state immediately.
    setMeals((prev) => prev.filter((m) => m.id !== id));
    try {
      await deleteMeal(id);
    } catch {
      // Re-fetch on failure — the optimistic remove might be wrong.
      loadMeals(true);
    }
  }

  function openMeal(meal: Meal) {
    stashMeal(meal);
    router.push(`/(app)/meal/${meal.id}`);
  }

  // Called when user submits from CaptureSheet.
  function handleCaptureSubmit(result: CaptureResult) {
    const ps: PendingState = {
      id: result.pendingId,
      kind: result.kind,
      previewUri: result.previewUri,
      caption: result.caption,
      text: result.text,
      photoCount: result.photoCount,
      forDate: result.forDate,
      status: "processing",
    };
    setPending((prev) => [ps, ...prev]);
    runParse(result);
  }

  async function runParse(result: CaptureResult) {
    try {
      let meal: Meal;
      if (result.kind === "photo" && result.photoUris) {
        const resp = await parseMealPhoto({
          photos: result.photoUris,
          caption: result.caption,
          forDate: result.forDate,
        });
        meal = resp.meal;
      } else if (result.kind === "text" && result.text) {
        const resp = await parseMealText({
          text: result.text,
          forDate: result.forDate,
        });
        meal = resp.meal;
      } else {
        throw new Error("Invalid capture result");
      }
      setPending((prev) => prev.filter((p) => p.id !== result.pendingId));
      // Insert only if the user is still viewing the day the meal landed
      // on (they may have navigated while the parse ran).
      const targetDay = result.forDate ?? todayYmd();
      if (dayRef.current === targetDay) {
        setMeals((prev) =>
          [meal, ...prev].sort((a, b) => b.created_at - a.created_at)
        );
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Parse failed — try again";
      setPending((prev) =>
        prev.map((p) =>
          p.id === result.pendingId ? { ...p, status: "error", errorMessage: msg } : p
        )
      );
    }
  }

  function handleRetry(id: string) {
    const p = pending.find((ps) => ps.id === id);
    if (!p) return;
    setPending((prev) => prev.map((ps) => (ps.id === id ? { ...ps, status: "processing", errorMessage: undefined } : ps)));
    if (p.kind === "text" && p.text) {
      runParse({ pendingId: id, kind: "text", text: p.text, forDate: p.forDate });
    } else {
      // Photo retry: dismiss the pending card and re-open capture.
      setPending((prev) => prev.filter((ps) => ps.id !== id));
      setCaptureOpen(true);
    }
  }

  function handleDismiss(id: string) {
    setPending((prev) => prev.filter((p) => p.id !== id));
  }

  const totals = computeDayTotals(meals);
  const hasMeals = meals.length > 0 || pending.length > 0;

  type ListItem =
    | { type: "header" }
    | { type: "whoop" }
    | { type: "totals" }
    | { type: "pending"; item: PendingState }
    | { type: "meal"; item: Meal }
    | { type: "empty" }
    | { type: "error" };

  const listData: ListItem[] = [
    { type: "header" },
    ...(isToday ? [{ type: "whoop" } as ListItem] : []),
    ...(hasMeals ? [{ type: "totals" } as ListItem] : []),
    ...pending.map((p) => ({ type: "pending" as const, item: p })),
    ...meals.map((m) => ({ type: "meal" as const, item: m })),
    ...(loading ? [] : !hasMeals ? [{ type: "empty" } as ListItem] : []),
    ...(error && !loading ? [{ type: "error" } as ListItem] : []),
  ];

  function renderItem({ item }: { item: ListItem }) {
    switch (item.type) {
      case "header":
        return (
          <View style={styles.headerRow}>
            <TouchableOpacity
              onPress={() => shiftDay(-1)}
              style={styles.navBtn}
              accessibilityLabel="previous day"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.navBtnText}>‹</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.dayLabelWrap}
              onPress={() => !isToday && setDay(todayYmd())}
              disabled={isToday}
              accessibilityLabel={isToday ? "today" : "jump to today"}
            >
              <Text style={styles.dayLabel}>{dayNavLabel(day)}</Text>
              {!isToday && <Text style={styles.dayHint}>tap to jump to today</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => shiftDay(1)}
              style={[styles.navBtn, isToday && styles.navBtnDisabled]}
              disabled={isToday}
              accessibilityLabel="next day"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.navBtnText}>›</Text>
            </TouchableOpacity>
          </View>
        );
      case "whoop":
        return <WhoopChip />;
      case "totals":
        return <DayTotalsStrip totals={totals} />;
      case "pending":
        return (
          <PendingCard
            pending={item.item}
            onRetry={handleRetry}
            onDismiss={handleDismiss}
          />
        );
      case "meal":
        return (
          <MealCard
            meal={item.item}
            onDelete={handleDelete}
            onOpen={() => openMeal(item.item)}
          />
        );
      case "empty":
        return (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>
              {isToday ? "Nothing logged yet" : "Nothing logged this day"}
            </Text>
            <Text style={styles.emptyHint}>
              {isToday
                ? "Tap the button below to log a meal."
                : "Tap the button below to add one to this day."}
            </Text>
          </View>
        );
      case "error":
        return (
          <View style={styles.errorState}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => loadMeals()}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        );
      default:
        return null;
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <FlatList
        data={listData}
        keyExtractor={(item, index) => {
          if (item.type === "meal") return item.item.id;
          if (item.type === "pending") return item.item.id;
          return `${item.type}-${index}`;
        }}
        renderItem={renderItem}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.brand}
            colors={[colors.brand]}
          />
        }
        showsVerticalScrollIndicator={false}
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setCaptureOpen(true)}
        activeOpacity={0.85}
        accessibilityLabel={isToday ? "log a meal" : `log a meal for ${dayNavLabel(day)}`}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

      <CaptureSheet
        visible={captureOpen}
        onClose={() => setCaptureOpen(false)}
        onSubmit={handleCaptureSubmit}
        forDate={isToday ? undefined : day}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 100,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 12,
  },
  navBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  navBtnDisabled: {
    opacity: 0.25,
  },
  navBtnText: {
    fontSize: 28,
    color: colors.textMuted,
    lineHeight: 32,
  },
  dayLabelWrap: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  dayLabel: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: -0.5,
  },
  dayHint: {
    fontSize: 11,
    color: colors.textFaint,
  },
  emptyState: {
    paddingHorizontal: 16,
    paddingTop: 40,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.textMuted,
  },
  emptyHint: {
    fontSize: 14,
    color: colors.textSubtle,
    textAlign: "center",
  },
  errorState: {
    paddingHorizontal: 16,
    paddingTop: 32,
    alignItems: "center",
    gap: 12,
  },
  errorText: {
    fontSize: 14,
    color: colors.bad,
    textAlign: "center",
  },
  retryBtn: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  retryBtnText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: "600",
  },
  fab: {
    position: "absolute",
    bottom: 28,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  fabIcon: {
    fontSize: 32,
    color: colors.bg,
    lineHeight: 36,
    fontWeight: "300",
  },
});
