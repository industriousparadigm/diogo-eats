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
import {
  fetchMeals,
  deleteMeal,
  parseMealPhoto,
  parseMealText,
  repeatMeal,
  ApiError,
} from "@/lib/api";
import { computeDayTotals } from "@/lib/types";
import { dayNavLabel, shiftYmd, todayYmd } from "@/lib/format";
import { palette, radii, borders, fontSize, spacing, offsetShadow } from "@/lib/theme";
import { consumePendingDay, onDayPicked, stashMeal, takeNewMeal } from "@/lib/stores";
import { getSnapshot, setSnapshot } from "@/lib/snapshot";
import { MealCard } from "@/components/MealCard";
import { DayScreenSkeleton } from "@/components/skeletons/DayScreenSkeleton";
import { CopyDayButton } from "@/components/CopyDayButton";
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

  // Load the viewed day's meals. On a non-quiet load (mount / day change)
  // we first try the per-day snapshot: if it hits, render it IMMEDIATELY
  // (no skeleton) and refresh silently underneath. Only a true cold cache
  // shows the skeleton. Every successful fetch writes the snapshot back.
  const loadMeals = useCallback(
    async (quiet = false) => {
      const loadingDay = day;
      if (!quiet) {
        setError(null);
        const cached = await getSnapshot<Meal[]>("day", loadingDay);
        // The user may have navigated days while the snapshot read ran.
        if (dayRef.current === loadingDay) {
          if (cached && cached.length > 0) {
            setMeals([...cached].sort((a, b) => b.created_at - a.created_at));
            setLoading(false); // cache hit: show data, refresh silently
          } else {
            setLoading(true); // cold cache: the skeleton stands in
          }
        }
      }
      try {
        const data = await fetchMeals(loadingDay);
        const sorted = [...data].sort((a, b) => b.created_at - a.created_at);
        // Ignore a result for a day the user has since navigated away from.
        if (dayRef.current === loadingDay) {
          setMeals(sorted);
          setError(null);
        }
        setSnapshot("day", loadingDay, sorted);
      } catch (err) {
        if (dayRef.current === loadingDay) {
          if (err instanceof ApiError) {
            setError(err.message);
          } else {
            setError("Could not load meals");
          }
        }
      } finally {
        if (dayRef.current === loadingDay) setLoading(false);
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
      // A meal created on a pushed screen (composer) lands here. If it
      // belongs to the viewed day, insert it; otherwise jump to its day.
      const created = takeNewMeal();
      if (created) {
        firstFocusRef.current = false;
        if (created.day === dayRef.current) {
          setMeals((prev) =>
            [created.meal, ...prev.filter((m) => m.id !== created.meal.id)].sort(
              (a, b) => b.created_at - a.created_at
            )
          );
        } else {
          setDay(created.day); // day change triggers a full load via the effect
        }
        return;
      }
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

  // Deterministic re-log. On a past day, land the copy on THAT day via
  // for_date so a ↻ in yesterday's list stays in yesterday. Insert the
  // returned meal if the user is still viewing the day it landed on.
  async function repeatMealOnViewedDay(id: string, scale: number) {
    const forDate = isToday ? undefined : day;
    const meal = await repeatMeal(id, { scale, forDate });
    const targetDay = forDate ?? todayYmd();
    if (dayRef.current === targetDay) {
      setMeals((prev) =>
        [meal, ...prev].sort((a, b) => b.created_at - a.created_at)
      );
    }
  }

  // A composed meal (from the capture sheet → composer) lands like a parse
  // result: insert if the user is still on the day it landed on.
  function onComposedMeal(meal: Meal, forDate?: string) {
    const targetDay = forDate ?? todayYmd();
    if (dayRef.current === targetDay) {
      setMeals((prev) =>
        [meal, ...prev].sort((a, b) => b.created_at - a.created_at)
      );
    }
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
    | { type: "skeleton" }
    | { type: "empty" }
    | { type: "error" };

  // Three visually distinct states, never an empty state before the first
  // fetch resolves:
  //   loading (cold cache) → skeleton placeholders shaped like the content
  //   data                 → totals + meal cards
  //   empty (confirmed)    → the friendly copy, only once loading is done
  const listData: ListItem[] = [
    { type: "header" },
    ...(isToday ? [{ type: "whoop" } as ListItem] : []),
    ...(hasMeals ? [{ type: "totals" } as ListItem] : []),
    ...pending.map((p) => ({ type: "pending" as const, item: p })),
    ...meals.map((m) => ({ type: "meal" as const, item: m })),
    ...(loading && !hasMeals ? [{ type: "skeleton" } as ListItem] : []),
    ...(!loading && !hasMeals ? [{ type: "empty" } as ListItem] : []),
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
        return (
          <View>
            {meals.length > 0 && (
              <View style={styles.copyRow}>
                <CopyDayButton meals={meals} ymd={day} />
              </View>
            )}
            <DayTotalsStrip totals={totals} />
          </View>
        );
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
            onRepeat={(scale) => repeatMealOnViewedDay(item.item.id, scale)}
          />
        );
      case "skeleton":
        return <DayScreenSkeleton />;
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
            tintColor={palette.food.accent}
            colors={[palette.food.accent]}
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
        onRepeat={(meal) => onComposedMeal(meal, isToday ? undefined : day)}
        onCompose={() =>
          router.push(isToday ? "/(app)/compose" : `/(app)/compose?date=${day}`)
        }
        forDate={isToday ? undefined : day}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: palette.bg,
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
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
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
    color: palette.textMuted,
    lineHeight: 32,
  },
  dayLabelWrap: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  dayLabel: {
    fontSize: fontSize.display,
    fontWeight: "800",
    color: palette.text,
    letterSpacing: -0.5,
  },
  dayHint: {
    fontSize: fontSize.label,
    color: palette.textFaint,
  },
  copyRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  emptyState: {
    paddingHorizontal: spacing.lg,
    paddingTop: 40,
    alignItems: "center",
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: fontSize.title,
    fontWeight: "700",
    color: palette.text,
  },
  emptyHint: {
    fontSize: fontSize.body,
    color: palette.textSubtle,
    textAlign: "center",
  },
  errorState: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxxl,
    alignItems: "center",
    gap: spacing.md,
  },
  errorText: {
    fontSize: fontSize.body,
    color: palette.danger,
    textAlign: "center",
  },
  retryBtn: {
    backgroundColor: "transparent",
    borderRadius: radii.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderWidth: borders.bold,
    borderColor: palette.ink,
  },
  retryBtnText: {
    fontSize: fontSize.body,
    color: palette.text,
    fontWeight: "700",
  },
  fab: {
    position: "absolute",
    bottom: 28,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: radii.lg,
    backgroundColor: palette.food.accent,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: borders.chunky,
    borderColor: palette.bg,
    ...offsetShadow(palette.food.accentDeep, "loud"),
  },
  fabIcon: {
    fontSize: 32,
    color: palette.onAccent,
    lineHeight: 36,
    fontWeight: "600",
  },
});
