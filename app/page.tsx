"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionBar } from "./components/ActionBar";
import { ConfirmSheet } from "./components/ConfirmSheet";
import { DailyHeadline } from "./components/DailyHeadline";
import { History } from "./components/History";
import { MealCard } from "./components/MealCard";
import { Pulse } from "./components/Pulse";
import { SettingsSheet } from "./components/SettingsSheet";
import { TextSheet } from "./components/TextSheet";
import { todayStart, ymd, isSameDay, dayLabel } from "@/lib/date";
import {
  deleteMeal as apiDeleteMeal,
  fetchMealsForDay,
  parsePhoto,
  parseText,
} from "@/lib/api";
import type { Meal } from "@/lib/types";

export default function Home() {
  const router = useRouter();
  const [viewDate, setViewDate] = useState<Date>(() => todayStart());
  const [meals, setMeals] = useState<Meal[]>([]);
  const [busy, setBusy] = useState(false);
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

  async function loadMeals(d: Date = viewDate) {
    const data = await fetchMealsForDay(d);
    setMeals(data);
  }

  useEffect(() => {
    loadMeals(viewDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewDate]);

  function shiftDay(deltaDays: number) {
    const next = new Date(viewDate);
    next.setDate(next.getDate() + deltaDays);
    next.setHours(0, 0, 0, 0);
    // Don't allow stepping into the future.
    if (next.getTime() > todayStart().getTime()) return;
    setViewDate(next);
  }

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setError(null);
    setCaption("");
    // Hard-cap at 4 to match server. Anything beyond gets dropped silently
    // — the iOS chooser already discourages mass selection.
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

  async function submitPending() {
    if (pendingFiles.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await parsePhoto(pendingFiles, caption);
      // Jump to today since the new meal is timestamped now.
      const today = todayStart();
      setViewDate(today);
      await loadMeals(today);
      setHistoryVersion((v) => v + 1);
      setPendingFiles([]);
      setCaption("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function submitText() {
    const text = textInput.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      await parseText(text);
      const today = todayStart();
      setViewDate(today);
      await loadMeals(today);
      setHistoryVersion((v) => v + 1);
      setTextInput("");
      setTextMode(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function cancelText() {
    setTextMode(false);
    setTextInput("");
  }

  async function deleteMealById(id: string) {
    await apiDeleteMeal(id);
    await loadMeals();
    setHistoryVersion((v) => v + 1);
  }

  // Refresh on tab visibility — covers the case where the user came back
  // from /meal/[id] after a save and we need today's row to reflect the
  // new totals. Cheap (single GETs) and only fires on actual focus.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        loadMeals();
        setHistoryVersion((v) => v + 1);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewDate]);

  const totals = meals.reduce(
    (t, m) => ({
      sat_fat_g: t.sat_fat_g + m.sat_fat_g,
      soluble_fiber_g: t.soluble_fiber_g + m.soluble_fiber_g,
      calories: t.calories + m.calories,
      protein_g: t.protein_g + m.protein_g,
      plant_pct_sum: t.plant_pct_sum + m.plant_pct,
    }),
    { sat_fat_g: 0, soluble_fiber_g: 0, calories: 0, protein_g: 0, plant_pct_sum: 0 }
  );

  const plantPct = meals.length ? Math.round(totals.plant_pct_sum / meals.length) : 0;

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

      {/* Smart switch: if today has zero meals, the looking-back surface
          leads — opening the app should feel satisfying, not empty. The
          today section becomes a small prompt below History. Once a meal
          exists for today, today is the action surface again and History
          drops to the supplementary scroll-down position. */}
      {isToday && meals.length === 0 ? (
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
            meals={meals}
            totals={totals}
            plantPct={plantPct}
            isToday={isToday}
            viewDate={viewDate}
          />

          <Pulse totals={totals} plantPct={plantPct} mealCount={meals.length} />

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
        {meals.length === 0 && !busy && (
          <p style={{ color: "#52525b", fontSize: 14, padding: "24px 0" }}>
            {isToday
              ? "Nothing yet. Snap your first meal."
              : "Nothing logged that day."}
          </p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {meals.map((m) => (
            <MealCard
              key={m.id}
              meal={m}
              onDelete={() => deleteMealById(m.id)}
              onEdit={() => router.push(`/meal/${m.id}`)}
            />
          ))}
        </div>

      </section>

      {/* Looking-back lives below today when today has meals (or you're
          viewing a past day). Smart switch promotes it above when today
          is empty — see top of render. */}
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
        <ActionBar
          busy={busy}
          inputId="photo-input"
          onType={() => setTextMode(true)}
        />
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
          busy={busy}
          onCancel={cancelPending}
          onSubmit={submitPending}
        />
      )}

      {textMode && (
        <TextSheet
          value={textInput}
          setValue={setTextInput}
          busy={busy}
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
