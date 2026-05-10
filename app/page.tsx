"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionBar } from "./components/ActionBar";
import { ConfirmSheet } from "./components/ConfirmSheet";
import { DailyHeadline } from "./components/DailyHeadline";
import { History } from "./components/History";
import { MealCard } from "./components/MealCard";
import { PendingMealCard } from "./components/PendingMealCard";
import { Pulse } from "./components/Pulse";
import { SettingsSheet } from "./components/SettingsSheet";
import { HomeSkeleton } from "./components/Skeleton";
import { TextSheet } from "./components/TextSheet";
import { todayStart, ymd, isSameDay, dayLabel } from "@/lib/date";
import {
  deleteMeal as apiDeleteMeal,
  fetchMealsForDay,
  parsePhoto,
  parseText,
} from "@/lib/api";
import type { Meal, PendingTask } from "@/lib/types";

export default function Home() {
  const router = useRouter();
  const [viewDate, setViewDate] = useState<Date>(() => todayStart());
  // null = "haven't loaded yet for this view" → render skeleton.
  // [] = "loaded, day was empty" → render the empty-day surfaces.
  const [meals, setMeals] = useState<Meal[] | null>(null);
  // In-flight log tasks. Each renders a PendingMealCard above today's
  // real meals. Multiple can be processing in parallel — submitting a
  // new photo/text while one is mid-flight just appends another card.
  const [pendingTasks, setPendingTasks] = useState<PendingTask[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Multi-photo support: a meal can be 1-4 images (e.g. plate + nutrition
  // labels). The /api/parse route stitches them server-side into one
  // composite before sending to Vision, so it's still one Vision call.
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [caption, setCaption] = useState("");
  const [textMode, setTextMode] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Bumped after any DB-changing action so the History calendar refetches
  // without us threading state through it.
  const [historyVersion, setHistoryVersion] = useState(0);
  const isToday = isSameDay(viewDate, todayStart());
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Revoke any leftover preview URLs when the page unmounts. In normal
  // operation processTask() revokes them when it removes a task, but
  // a hard refresh mid-flight would leak otherwise.
  useEffect(() => {
    return () => {
      for (const t of pendingTasks) {
        if (t.previewUrl) URL.revokeObjectURL(t.previewUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function shiftDay(deltaDays: number) {
    const next = new Date(viewDate);
    next.setDate(next.getDate() + deltaDays);
    next.setHours(0, 0, 0, 0);
    if (next.getTime() > todayStart().getTime()) return;
    setViewDate(next);
  }

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setError(null);
    setCaption("");
    setPendingFiles(files.slice(0, 4));
  }

  function cancelPending() {
    setPendingFiles([]);
    setCaption("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removePendingAt(idx: number) {
    setPendingFiles((arr) => arr.filter((_, i) => i !== idx));
  }

  // Drives one in-flight task to completion. Resolves silently — errors
  // just flip the task's status. Kicked off from confirm/text submit
  // and from the retry button on a failed pending card.
  async function processTask(task: PendingTask) {
    try {
      if (task.kind === "photo") {
        await parsePhoto(task.files ?? [], task.caption);
      } else {
        await parseText(task.text ?? "");
      }
      setPendingTasks((arr) => {
        const idx = arr.findIndex((t) => t.id === task.id);
        if (idx === -1) return arr;
        const t = arr[idx];
        if (t.previewUrl) URL.revokeObjectURL(t.previewUrl);
        return [...arr.slice(0, idx), ...arr.slice(idx + 1)];
      });
      // Silent reload so the new meal pops in without flashing the
      // skeleton over everything else still on screen.
      const today = todayStart();
      // Only force-jump to today if user is currently viewing today.
      // Don't yank them back if they navigated to a past day to read.
      if (isSameDay(viewDate, today)) {
        await loadMeals(today, { silent: true });
      }
      setHistoryVersion((v) => v + 1);
    } catch (err: any) {
      setPendingTasks((arr) =>
        arr.map((t) =>
          t.id === task.id
            ? {
                ...t,
                status: "error" as const,
                errorMessage: err?.message ?? "something went wrong",
              }
            : t
        )
      );
    }
  }

  function submitPending() {
    if (pendingFiles.length === 0) return;
    setError(null);
    // Take a snapshot of the current pending sheet state. The sheet
    // closes before the LLM resolves, so these have to be self-contained.
    const files = pendingFiles.slice();
    const cap = caption.trim();
    const previewUrl = URL.createObjectURL(files[0]);
    const task: PendingTask = {
      id: crypto.randomUUID(),
      kind: "photo",
      files,
      caption: cap || undefined,
      previewUrl,
      photoCount: files.length,
      status: "processing",
      startedAt: Date.now(),
    };
    setPendingTasks((arr) => [...arr, task]);

    // Snap to today so the new card is visible. Cleared sheet state.
    if (!isSameDay(viewDate, todayStart())) setViewDate(todayStart());
    setPendingFiles([]);
    setCaption("");
    if (fileInputRef.current) fileInputRef.current.value = "";

    // Fire and forget. Errors flip the task to error state, not a toast.
    void processTask(task);
  }

  function submitText() {
    const text = textInput.trim();
    if (!text) return;
    setError(null);
    const task: PendingTask = {
      id: crypto.randomUUID(),
      kind: "text",
      text,
      status: "processing",
      startedAt: Date.now(),
    };
    setPendingTasks((arr) => [...arr, task]);

    if (!isSameDay(viewDate, todayStart())) setViewDate(todayStart());
    setTextInput("");
    setTextMode(false);

    void processTask(task);
  }

  function retryPendingTask(id: string) {
    setPendingTasks((arr) => {
      const idx = arr.findIndex((t) => t.id === id);
      if (idx === -1) return arr;
      const t = arr[idx];
      const reset: PendingTask = {
        ...t,
        status: "processing",
        errorMessage: undefined,
        startedAt: Date.now(),
      };
      // Re-fire with the same payload. The task object handed to
      // processTask is stable; the array swap below replaces the entry.
      void processTask(reset);
      return [...arr.slice(0, idx), reset, ...arr.slice(idx + 1)];
    });
  }

  function dismissPendingTask(id: string) {
    setPendingTasks((arr) => {
      const idx = arr.findIndex((t) => t.id === id);
      if (idx === -1) return arr;
      const t = arr[idx];
      if (t.previewUrl) URL.revokeObjectURL(t.previewUrl);
      return [...arr.slice(0, idx), ...arr.slice(idx + 1)];
    });
  }

  function cancelText() {
    setTextMode(false);
    setTextInput("");
  }

  async function deleteMealById(id: string) {
    await apiDeleteMeal(id);
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

  // Pending cards only show on today's view — the meal is always
  // logged with a "now" timestamp, so showing it on a past day would
  // be misleading. Newest first so the most recent action is on top.
  const visiblePending = isToday
    ? [...pendingTasks].reverse()
    : ([] as PendingTask[]);
  const hasContent = mealList.length > 0 || visiblePending.length > 0;

  return (
    <main style={{ padding: "20px 16px 120px", maxWidth: 540, margin: "0 auto" }}>
      <header
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
          EATS · {dayLabel(viewDate).toUpperCase()}
        </h1>
        <button
          onClick={() => shiftDay(1)}
          aria-label="next day"
          disabled={isToday}
          style={{ ...dayNavBtnStyle, opacity: isToday ? 0.3 : 1, cursor: isToday ? "default" : "pointer" }}
        >
          ›
        </button>
      </header>

      {error && (
        <div style={{ background: "#7f1d1d", padding: 12, borderRadius: 8, margin: "16px 0", fontSize: 14 }}>
          {error}
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
            onOpenSettings={() => setSettingsOpen(true)}
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
            </h2>
            {!hasContent && (
              <p style={{ color: "#52525b", fontSize: 14, padding: "24px 0" }}>
                {isToday
                  ? "Nothing yet. Snap your first meal."
                  : "Nothing logged that day."}
              </p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {visiblePending.map((t) => (
                <PendingMealCard
                  key={t.id}
                  task={t}
                  onRetry={() => retryPendingTask(t.id)}
                  onDismiss={() => dismissPendingTask(t.id)}
                />
              ))}
              {mealList.map((m) => (
                <MealCard
                  key={m.id}
                  meal={m}
                  onDelete={() => deleteMealById(m.id)}
                  onEdit={() => router.push(`/meal/${m.id}`)}
                />
              ))}
            </div>
          </section>

          <div style={{ marginTop: 36 }}>
            <History
              version={historyVersion}
              selectedDate={ymd(viewDate)}
              onPickDate={(d) => setViewDate(new Date(d + "T00:00:00"))}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          </div>
        </>
      )}

      {isToday && (
        <ActionBar inputId="photo-input" onType={() => setTextMode(true)} />
      )}
      <input
        ref={fileInputRef}
        id="photo-input"
        type="file"
        accept="image/*"
        multiple
        onChange={onPhoto}
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0,0,0,0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      />

      {pendingFiles.length > 0 && (
        <ConfirmSheet
          files={pendingFiles}
          onRemoveAt={removePendingAt}
          caption={caption}
          setCaption={setCaption}
          onCancel={cancelPending}
          onSubmit={submitPending}
        />
      )}

      {textMode && (
        <TextSheet
          value={textInput}
          setValue={setTextInput}
          onCancel={cancelText}
          onSubmit={submitText}
        />
      )}

      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}
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
