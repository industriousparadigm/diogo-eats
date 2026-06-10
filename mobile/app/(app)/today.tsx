// Today screen — the daily loop.
//
// - Fetches meals for today on mount and on app-foreground resume.
// - Pull-to-refresh for manual reconciliation.
// - Pending cards (optimistic) sit at top while parse is in flight.
// - Completed meal cards below, newest-first.
// - Day totals strip at top.
// - FAB (bottom-right) opens CaptureSheet.

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
import { useRouter } from "expo-router";
import { fetchMeals, deleteMeal, parseMealPhoto, parseMealText, ApiError } from "@/lib/api";
import { computeDayTotals } from "@/lib/types";
import { fmtDayLabel, todayYmd } from "@/lib/format";
import { colors, radii } from "@/lib/colors";
import { MealCard } from "@/components/MealCard";
import { DayTotalsStrip } from "@/components/DayTotalsStrip";
import { PendingCard, type PendingState } from "@/components/PendingCard";
import { CaptureSheet, type CaptureResult } from "@/components/CaptureSheet";
import type { Meal } from "@/lib/types";

export default function TodayScreen() {
  const router = useRouter();
  const [meals, setMeals] = useState<Meal[]>([]);
  const [pending, setPending] = useState<PendingState[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captureOpen, setCaptureOpen] = useState(false);

  const today = todayYmd();

  // Load today's meals.
  const loadMeals = useCallback(
    async (quiet = false) => {
      if (!quiet) setError(null);
      try {
        const data = await fetchMeals(today);
        // Newest-first.
        setMeals([...data].sort((a, b) => b.created_at - a.created_at));
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
    [today]
  );

  useEffect(() => {
    loadMeals();
  }, [loadMeals]);

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

  // Called when user submits from CaptureSheet.
  function handleCaptureSubmit(result: CaptureResult) {
    const ps: PendingState = {
      id: result.pendingId,
      kind: result.kind,
      previewUri: result.previewUri,
      caption: result.caption,
      text: result.text,
      photoCount: result.photoCount,
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
        });
        meal = resp.meal;
      } else if (result.kind === "text" && result.text) {
        const resp = await parseMealText({ text: result.text });
        meal = resp.meal;
      } else {
        throw new Error("Invalid capture result");
      }
      // Insert the new meal and remove the pending card.
      setMeals((prev) => [meal, ...prev]);
      setPending((prev) => prev.filter((p) => p.id !== result.pendingId));
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
    // Reset to processing and re-fire.
    setPending((prev) => prev.map((ps) => (ps.id === id ? { ...ps, status: "processing", errorMessage: undefined } : ps)));
    // Reconstruct the CaptureResult from PendingState.
    // We don't store photoUris on PendingState (they're already resized
    // and would be stale URIs). For photo retries, prompt user to re-pick.
    if (p.kind === "text" && p.text) {
      runParse({ pendingId: id, kind: "text", text: p.text });
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
    | { type: "totals" }
    | { type: "pending"; item: PendingState }
    | { type: "meal"; item: Meal }
    | { type: "empty" }
    | { type: "error" };

  const listData: ListItem[] = [
    { type: "header" },
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
            <Text style={styles.dayLabel}>{fmtDayLabel(today)}</Text>
          </View>
        );
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
        return <MealCard meal={item.item} onDelete={handleDelete} />;
      case "empty":
        return (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Nothing logged yet</Text>
            <Text style={styles.emptyHint}>Tap the button below to log a meal.</Text>
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
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

      <CaptureSheet
        visible={captureOpen}
        onClose={() => setCaptureOpen(false)}
        onSubmit={handleCaptureSubmit}
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
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  dayLabel: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: -0.5,
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
