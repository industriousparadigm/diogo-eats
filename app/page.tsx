"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ActionBar } from "./components/ActionBar";
import { DailyHeadline } from "./components/DailyHeadline";
import { History } from "./components/History";
import { MealCard } from "./components/MealCard";
import { PendingMealCard } from "./components/PendingMealCard";
import { Pulse } from "./components/Pulse";
import { HomeSkeleton } from "./components/Skeleton";
import { Topbar } from "./components/Topbar";
import { CopyDayButton } from "./components/CopyDayButton";
import { WhoopHomeChip } from "./components/WhoopHomeChip";
import { todayStart, ymd, isSameDay, dayLabel } from "@/lib/date";
import {
  deleteMeal as apiDeleteMeal,
  fetchMealsForDay,
  parsePhoto,
  parseText,
  repeatMeal as apiRepeatMeal,
} from "@/lib/api";
import type { Meal, PendingTask } from "@/lib/types";
import {
  removePendingTask,
  updatePendingTask,
  usePendingTasks,
} from "@/lib/pendingStore";

// useSearchParams pushes the page into the client-side bailout; Next 16
// requires a Suspense boundary around it. The default export wraps the
// real Home component so the bailout has somewhere to render the
// fallback during the brief CSR prerender.
export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <Home />
    </Suspense>
  );
}

function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Initial date comes from ?date=YYYY-MM-DD when present (deep-link from
  // /overview bars or calendar cells), otherwise today.
  const [viewDate, setViewDate] = useState<Date>(() => {
    const q = searchParams?.get("date");
    if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) {
      const d = new Date(`${q}T00:00:00`);
      if (!isNaN(d.getTime()) && d.getTime() <= todayStart().getTime()) {
        return d;
      }
    }
    return todayStart();
  });

  // React to ?date= changing while the page is mounted (back/forward nav
  // from /overview after a bar tap, or after /log handed off).
  useEffect(() => {
    const q = searchParams?.get("date");
    if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) {
      const d = new Date(`${q}T00:00:00`);
      if (!isNaN(d.getTime()) && d.getTime() <= todayStart().getTime()) {
        setViewDate((prev) => (isSameDay(prev, d) ? prev : d));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // null = "haven't loaded yet for this view" → render skeleton.
  // [] = "loaded, day was empty" → render the empty-day surfaces.
  const [meals, setMeals] = useState<Meal[] | null>(null);
  // Pending tasks live in a module-level store now so /log can fire and
  // route here without losing state. Hook subscribes to updates.
  const pendingTasks = usePendingTasks();
  // Bumped after any DB-changing action so the History calendar refetches
  // without us threading state through it.
  const [historyVersion, setHistoryVersion] = useState(0);
  const isToday = isSameDay(viewDate, todayStart());

  async function loadMeals(
    d: Date = viewDate,
    opts: { silent?: boolean } = {}
  ) {
    if (!opts.silent) setMeals(null);
    const data = await fetchMealsForDay(d);
    setMeals(data);
  }

  useEffect(() => {
    loadMeals(viewDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewDate]);

  // When /log finishes a task it fires a window event so we reload.
  useEffect(() => {
    function onSaved() {
      loadMeals(viewDate, { silent: true });
      setHistoryVersion((v) => v + 1);
    }
    window.addEventListener("eats:meal-saved", onSaved);
    return () => window.removeEventListener("eats:meal-saved", onSaved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewDate]);

  function shiftDay(deltaDays: number) {
    const next = new Date(viewDate);
    next.setDate(next.getDate() + deltaDays);
    next.setHours(0, 0, 0, 0);
    if (next.getTime() > todayStart().getTime()) return;
    setViewDate(next);
  }

  // Retry a failed pending task in place. Re-fires the original payload
  // through the same /api/parse{,-text} endpoints used by /log.
  async function retryPendingTask(id: string) {
    const task = pendingTasks.find((t) => t.id === id);
    if (!task) return;
    updatePendingTask(id, (t) => ({
      ...t,
      status: "processing",
      errorMessage: undefined,
      startedAt: Date.now(),
    }));
    try {
      if (task.kind === "photo") {
        await parsePhoto(task.files ?? [], task.caption, task.forDate);
      } else {
        await parseText(task.text ?? "", task.forDate);
      }
      removePendingTask(id);
      window.dispatchEvent(new CustomEvent("eats:meal-saved"));
    } catch (err: any) {
      updatePendingTask(id, (t) => ({
        ...t,
        status: "error",
        errorMessage: err?.message ?? "something went wrong",
      }));
    }
  }

  async function deleteMealById(id: string) {
    await apiDeleteMeal(id);
    await loadMeals(viewDate, { silent: true });
    setHistoryVersion((v) => v + 1);
  }

  // Deterministic re-log. Repeats land on the day currently in view
  // (today when viewing today, the past day when backfilling), so the
  // copy shows up where the user expects it.
  async function repeatMealById(id: string, scale: number) {
    await apiRepeatMeal(id, {
      scale,
      forDate: isToday ? undefined : viewYmd,
    });
    await loadMeals(viewDate, { silent: true });
    setHistoryVersion((v) => v + 1);
  }

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        loadMeals(viewDate, { silent: true });
        setHistoryVersion((v) => v + 1);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewDate]);

  const mealList = meals ?? [];
  const totals = mealList.reduce(
    (t, m) => ({
      sat_fat_g: t.sat_fat_g + m.sat_fat_g,
      soluble_fiber_g: t.soluble_fiber_g + m.soluble_fiber_g,
      calories: t.calories + m.calories,
      protein_g: t.protein_g + m.protein_g,
      plant_pct_sum: t.plant_pct_sum + m.plant_pct,
    }),
    { sat_fat_g: 0, soluble_fiber_g: 0, calories: 0, protein_g: 0, plant_pct_sum: 0 }
  );

  const plantPct = mealList.length
    ? Math.round(totals.plant_pct_sum / mealList.length)
    : 0;

  // Show pending cards on the day they're being logged for. Tasks with
  // no forDate are implicitly "today". Newest first so the most recent
  // action is on top.
  const viewYmd = ymd(viewDate);
  const todayYmd = ymd(todayStart());
  const visiblePending = [...pendingTasks]
    .filter((t: PendingTask) => (t.forDate ?? todayYmd) === viewYmd)
    .reverse();
  const hasContent = mealList.length > 0 || visiblePending.length > 0;

  const logHref = isToday ? "/log" : `/log?date=${viewYmd}`;

  return (
    <main style={{ padding: "20px 16px 120px", maxWidth: 540, margin: "0 auto" }}>
      <Topbar />
      <div
        style={{
          marginBottom: 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <button
          onClick={() => shiftDay(-1)}
          aria-label="previous day"
          style={dayNavBtnStyle}
        >
          ‹
        </button>
        <h1
          suppressHydrationWarning
          onClick={() => setViewDate(todayStart())}
          title={isToday ? undefined : "tap to jump to today"}
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: "#71717a",
            letterSpacing: 1,
            textAlign: "center",
            cursor: isToday ? "default" : "pointer",
            flex: 1,
            margin: 0,
          }}
        >
          {dayLabel(viewDate).toUpperCase()}
        </h1>
        <button
          onClick={() => shiftDay(1)}
          aria-label="next day"
          disabled={isToday}
          style={{ ...dayNavBtnStyle, opacity: isToday ? 0.3 : 1, cursor: isToday ? "default" : "pointer" }}
        >
          ›
        </button>
      </div>
      {/* Whoop chip — only renders when connected AND today has data. */}
      {isToday && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: -12, marginBottom: 18 }}>
          <WhoopHomeChip />
        </div>
      )}

      {/* Three-state render:
          - meals === null: still loading → skeleton.
          - meals === [] && isToday && no pendings: smart-switch — looking-back leads.
          - otherwise: today/day surface, pendings on top, real meals below. */}
      {meals === null ? (
        <HomeSkeleton />
      ) : isToday && !hasContent ? (
        <>
          <History
            version={historyVersion}
            selectedDate={ymd(viewDate)}
            onPickDate={(d) => setViewDate(new Date(d + "T00:00:00"))}
          />
          <div
            style={{
              marginTop: 24,
              padding: "12px 16px 32px",
              textAlign: "center",
              color: "#71717a",
              fontSize: 14,
            }}
          >
            Nothing yet today.
          </div>
        </>
      ) : (
        <>
          <DailyHeadline
            meals={mealList}
            totals={totals}
            plantPct={plantPct}
            isToday={isToday}
            viewDate={viewDate}
          />

          <Pulse totals={totals} plantPct={plantPct} mealCount={mealList.length} />

          <section style={{ marginTop: 28 }}>
            <h2
              style={{
                fontSize: 11,
                color: "#71717a",
                letterSpacing: 1.2,
                marginBottom: 14,
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span>{isToday ? "TODAY" : dayLabel(viewDate).toUpperCase()}</span>
              <span style={{ flex: 1, height: 1, background: "#1f1f22" }} />
              {mealList.length > 0 && (
                <CopyDayButton meals={mealList} date={viewDate} />
              )}
            </h2>
            {!hasContent && isToday && (
              <p style={{ color: "#52525b", fontSize: 14, padding: "24px 0" }}>
                Nothing yet. Hit LOG to start.
              </p>
            )}
            {!hasContent && !isToday && (
              <p style={{ color: "#52525b", fontSize: 14, padding: "24px 0" }}>
                Add one with the LOG button below.
              </p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {visiblePending.map((t) => (
                <PendingMealCard
                  key={t.id}
                  task={t}
                  onRetry={() => retryPendingTask(t.id)}
                  onDismiss={() => removePendingTask(t.id)}
                />
              ))}
              {mealList.map((m) => (
                <MealCard
                  key={m.id}
                  meal={m}
                  onDelete={() => deleteMealById(m.id)}
                  onEdit={() => router.push(`/meal/${m.id}`)}
                  onRepeat={(scale) => repeatMealById(m.id, scale)}
                />
              ))}
            </div>
          </section>

          <div style={{ marginTop: 36 }}>
            <History
              version={historyVersion}
              selectedDate={ymd(viewDate)}
              onPickDate={(d) => setViewDate(new Date(d + "T00:00:00"))}
            />
          </div>
        </>
      )}

      <ActionBar
        href={logHref}
        dayHint={isToday ? undefined : dayLabel(viewDate)}
      />
    </main>
  );
}

const dayNavBtnStyle: React.CSSProperties = {
  background: "transparent",
  color: "#71717a",
  fontSize: 22,
  width: 36,
  height: 36,
  border: "none",
  borderRadius: 6,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  WebkitTapHighlightColor: "transparent",
};
