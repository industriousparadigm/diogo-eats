"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { History } from "./components/History";
import { SettingsSheet } from "./components/SettingsSheet";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import { useTargets } from "@/lib/targets";
import { todayStart, ymd, isSameDay, dayLabel, parseYmd } from "@/lib/date";
import { inputStyle, textareaStyle } from "@/lib/styles";

type Per100g = {
  sat_fat_g: number;
  soluble_fiber_g: number;
  calories: number;
  protein_g: number;
};

type Item = {
  name: string;
  grams: number;
  confidence: "low" | "medium" | "high";
  is_plant: boolean;
  per_100g: Per100g;
};

type Meal = {
  id: string;
  created_at: number;
  photo_filename: string | null;
  items_json: string;
  sat_fat_g: number;
  soluble_fiber_g: number;
  calories: number;
  protein_g: number;
  plant_pct: number;
  notes: string | null;
  caption: string | null;
  meal_vibe: string | null;
};


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
    const r = await fetch(`/api/meals?day=${ymd(d)}`);
    const j = await r.json();
    setMeals(j.meals ?? []);
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
      const fd = new FormData();
      // Server reads `form.getAll("photo")` so multiple values under the
      // same key get composited into one image before Vision sees them.
      for (const f of pendingFiles) fd.append("photo", f);
      if (caption.trim()) fd.append("caption", caption.trim());
      const r = await fetch("/api/parse", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "parse failed");
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
      const r = await fetch("/api/parse-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "parse-text failed");
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
    await fetch("/api/meals", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
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

function TextSheet({
  value,
  setValue,
  busy,
  onCancel,
  onSubmit,
}: {
  value: string;
  setValue: (v: string) => void;
  busy: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <SheetShell onScrimClick={busy ? undefined : onCancel}>
      <div style={{ fontSize: 12, color: "#71717a", letterSpacing: 0.5 }}>
        TYPE WHAT YOU ATE
      </div>
      <textarea
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="e.g. two slices of peanut butter cake / a small bowl of oats with banana / takeout pasta with cream sauce"
        maxLength={1000}
        disabled={busy}
        rows={5}
        style={{
          ...inputStyle,
          padding: "12px 14px",
          fontSize: 16,
          lineHeight: 1.4,
          resize: "vertical",
          minHeight: 120,
        }}
      />
      <div style={{ fontSize: 11, color: "#52525b" }}>
        Mention size if it matters (e.g. “two slices”, “a small bowl”). Add “at restaurant” if eating out.
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <SecondaryButton onClick={onCancel} disabled={busy}>
          cancel
        </SecondaryButton>
        <PrimaryButton onClick={onSubmit} disabled={busy || !value.trim()} flex>
          {busy ? "thinking…" : "log it"}
        </PrimaryButton>
      </div>
    </SheetShell>
  );
}

function DailyHeadline({
  meals,
  totals,
  plantPct,
  isToday,
  viewDate,
}: {
  meals: Meal[];
  totals: {
    sat_fat_g: number;
    soluble_fiber_g: number;
    calories: number;
    protein_g: number;
  };
  plantPct: number;
  isToday: boolean;
  viewDate: Date;
}) {
  const targets = useTargets();
  if (meals.length === 0) {
    return (
      <div
        style={{
          padding: "18px 18px",
          marginBottom: 12,
          fontSize: 16,
          color: "#a1a1aa",
          background: "#0f0f10",
          border: "1px solid #1f1f22",
          borderRadius: 14,
        }}
      >
        {isToday ? "Nothing yet today." : "Nothing logged that day."}
      </div>
    );
  }

  // Lead with what's HELPING LDL today: plant share + soluble fiber.
  // Sat fat only earns a callout if it's truly above target across the
  // whole day — single-bite alarms were the previous failure mode.
  const wins: string[] = [];
  if (plantPct >= 80) wins.push("Plant-led day");
  else if (plantPct >= 60) wins.push("Plant-leaning");
  else if (plantPct >= 40) wins.push("Mixed plate");
  else wins.push("Animal-led day");

  const fiber = totals.soluble_fiber_g;
  if (fiber >= targets.soluble_fiber_g)
    wins.push(`${fiber.toFixed(0)}g soluble fiber`);
  else if (fiber >= targets.soluble_fiber_g * 0.5)
    wins.push(`${fiber.toFixed(0)}g fiber so far`);

  // Only a "watch" call when sat fat is meaningfully over.
  const satRatio = totals.sat_fat_g / targets.sat_fat_g;
  const fatNote = satRatio >= 1.2 ? "Sat fat well over target" : null;

  const mealLabel = meals.length === 1 ? "1 meal" : `${meals.length} meals`;
  const dayPart = isToday
    ? "today"
    : viewDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

  // Lead color reflects plant signal. We only shift away from green when
  // the day is really animal-led; mixed plates stay neutral, not yellow.
  const leadColor =
    plantPct >= 60 ? "#a3e635" : plantPct >= 40 ? "#e4e4e7" : "#fca5a5";

  return (
    <div
      style={{
        padding: "18px 18px",
        marginBottom: 12,
        background: "#0f0f10",
        border: "1px solid #1f1f22",
        borderRadius: 14,
      }}
    >
      <div
        style={{
          fontSize: 22,
          fontWeight: 600,
          color: leadColor,
          lineHeight: 1.25,
          letterSpacing: -0.3,
        }}
      >
        {wins.join(". ")}
        {wins.length ? "." : ""}
      </div>
      {fatNote && (
        <div style={{ fontSize: 13, color: "#fcd34d", marginTop: 6 }}>
          {fatNote}
        </div>
      )}
      <div style={{ fontSize: 12, color: "#52525b", marginTop: 10, letterSpacing: 0.3 }}>
        {mealLabel.toUpperCase()} · {dayPart.toUpperCase()}
      </div>
    </div>
  );
}

function Pulse({
  totals,
  plantPct,
  mealCount,
}: {
  totals: { sat_fat_g: number; soluble_fiber_g: number; calories: number; protein_g: number };
  plantPct: number;
  mealCount: number;
}) {
  const targets = useTargets();
  // Pulse order matters — leads with what's HELPING LDL (plant + fiber)
  // and only then surfaces sat fat. Counters the previous "every meal a
  // negotiation about saturated fat" framing.
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 10,
        background: "#161618",
        padding: 18,
        borderRadius: 14,
      }}
    >
      <Stat label="plant" value={String(plantPct)} unit="%" target={100} />
      <Stat
        label="soluble fiber"
        value={totals.soluble_fiber_g.toFixed(1)}
        unit="g"
        target={targets.soluble_fiber_g}
      />
      <Stat label="sat fat" value={totals.sat_fat_g.toFixed(1)} unit="g" target={targets.sat_fat_g} invert />
      <Stat label="calories" value={Math.round(totals.calories).toString()} unit="" target={targets.calories} />
      <Stat label="protein" value={totals.protein_g.toFixed(0)} unit="g" target={targets.protein_g} fullSpan />
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  target,
  invert,
  subtle,
  fullSpan,
}: {
  label: string;
  value: string;
  unit: string;
  target: number;
  invert?: boolean;
  subtle?: string;
  fullSpan?: boolean;
}) {
  const num = parseFloat(value) || 0;
  const pct = Math.min(100, (num / target) * 100);
  const over = invert ? num > target : false;
  return (
    <div style={{ gridColumn: fullSpan ? "span 2" : undefined }}>
      <div
        style={{
          fontSize: 10,
          color: "#71717a",
          letterSpacing: 0.8,
          marginBottom: 6,
          fontWeight: 500,
        }}
      >
        {label.toUpperCase()}
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 600,
          color: over ? "#fca5a5" : "#f4f4f5",
          letterSpacing: -0.5,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.1,
        }}
      >
        {value}
        <span style={{ fontSize: 13, color: "#71717a", marginLeft: 3, fontWeight: 400, letterSpacing: 0 }}>
          {unit}
        </span>
      </div>
      <div
        style={{
          height: 3,
          background: "#27272a",
          marginTop: 8,
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: over ? "#dc2626" : "#65a30d",
            transition: "width 400ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />
      </div>
      {subtle && <div style={{ fontSize: 10, color: "#52525b", marginTop: 4 }}>{subtle}</div>}
    </div>
  );
}

function safeParseItems(raw: string): Item[] {
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr;
  } catch {
    return [];
  }
}

function MealCard({
  meal,
  onDelete,
  onEdit,
}: {
  meal: Meal;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const items = safeParseItems(meal.items_json);
  const time = new Date(meal.created_at).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const lowOrMed = items.some((i) => i.confidence !== "high");
  const isLegacy = items.length > 0 && items[0].per_100g === undefined;

  return (
    <div
      data-pressable={!isLegacy ? "true" : undefined}
      className="fade-in"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-stop-card-click]")) return;
        if (!isLegacy) onEdit();
      }}
      style={{
        background: "#161618",
        borderRadius: 14,
        overflow: "hidden",
        display: "flex",
        gap: 0,
        cursor: isLegacy ? "default" : "pointer",
        transition: "background 120ms ease",
      }}
    >
      {meal.photo_filename ? (
        <img
          src={`/api/photo/${meal.photo_filename}`}
          alt=""
          style={{ width: 120, height: 120, objectFit: "cover", flexShrink: 0 }}
        />
      ) : (
        <div
          aria-hidden
          style={{
            width: 4,
            background: "linear-gradient(180deg, #27272a, #18181b)",
            flexShrink: 0,
          }}
        />
      )}
      <div
        style={{
          flex: 1,
          padding: meal.photo_filename ? "12px 14px 12px 4px" : "12px 14px",
          minWidth: 0,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontSize: 11, color: "#71717a", letterSpacing: 0.5 }}>
            {time}
            {meal.plant_pct >= 100 ? " · 🌱" : ""}
            {lowOrMed && (
              <span style={{ marginLeft: 6, color: "#a16207" }} title="some portions are estimates">
                ≈
              </span>
            )}
          </div>
          <button
            data-stop-card-click
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            style={{ fontSize: 11, color: "#52525b", padding: "2px 6px" }}
            aria-label="delete"
          >
            ✕
          </button>
        </div>
        {meal.meal_vibe && (
          <div
            style={{
              display: "inline-block",
              fontSize: 11,
              fontWeight: 500,
              color: "#bef264",
              background: "rgba(132,204,22,0.10)",
              border: "1px solid rgba(132,204,22,0.20)",
              padding: "3px 10px",
              borderRadius: 999,
              marginTop: 6,
              letterSpacing: 0.1,
            }}
          >
            {meal.meal_vibe}
          </div>
        )}
        <div
          style={{
            fontSize: 14,
            marginTop: 6,
            lineHeight: 1.4,
            color: "#e4e4e7",
          }}
        >
          {items.map((i) => i.name).join(", ")}
        </div>
        {meal.caption && (
          <div
            style={{
              fontSize: 12,
              color: "#a1a1aa",
              marginTop: 6,
              lineHeight: 1.4,
              fontStyle: "italic",
            }}
          >
            “{meal.caption}”
          </div>
        )}
        <div
          style={{
            fontSize: 11,
            color: "#71717a",
            marginTop: 8,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <span>{Math.round(meal.calories)} kcal</span>
          <span>{meal.sat_fat_g.toFixed(1)}g sat</span>
          <span>{meal.soluble_fiber_g.toFixed(1)}g fib</span>
          <span>{meal.protein_g.toFixed(0)}g pro</span>
          <span>{Math.round(meal.plant_pct)}% plant</span>
        </div>
        {meal.notes && (
          <div style={{ fontSize: 11, color: "#a1a1aa", marginTop: 6, fontStyle: "italic" }}>
            {meal.notes}
          </div>
        )}
      </div>
    </div>
  );
}

// Bottom-fixed action bar. Two equally-weighted buttons: photo and write.
// The single jade FAB used to occlude content when scrolled and quietly
// nudged users toward photo even when the type-flow was the one they
// wanted. Two equal buttons makes the choice symmetric.
//
// On a busy state (parse in progress) the bar collapses to a single
// status indicator so neither input can fire mid-parse.
function ActionBar({
  busy,
  inputId,
  onType,
}: {
  busy: boolean;
  inputId: string;
  onType: () => void;
}) {
  const wrap: React.CSSProperties = {
    position: "fixed",
    bottom: "max(28px, env(safe-area-inset-bottom))",
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    gap: 14,
    zIndex: 40,
  };
  const btn: React.CSSProperties = {
    width: 64,
    height: 64,
    borderRadius: "50%",
    background: busy ? "#3f3f46" : "#65a30d",
    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
    fontSize: 26,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: busy ? "default" : "pointer",
    WebkitTapHighlightColor: "transparent",
    userSelect: "none",
    color: "#fff",
    border: "none",
  };

  if (busy) {
    return (
      <div style={wrap}>
        <div role="status" aria-label="processing" style={btn}>
          …
        </div>
      </div>
    );
  }
  return (
    <div style={wrap}>
      <label htmlFor={inputId} aria-label="snap meal" style={btn}>
        📷
      </label>
      <button onClick={onType} aria-label="type a meal" style={btn}>
        ✏️
      </button>
    </div>
  );
}

function ConfirmSheet({
  files,
  onRemoveAt,
  caption,
  setCaption,
  busy,
  onCancel,
  onSubmit,
}: {
  files: File[];
  onRemoveAt: (idx: number) => void;
  caption: string;
  setCaption: (v: string) => void;
  busy: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  // Object URLs for previews; revoked on unmount or file-list change.
  const previewUrls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previewUrls.forEach(URL.revokeObjectURL), [previewUrls]);

  const single = files.length === 1;

  return (
    <SheetShell onScrimClick={busy ? undefined : onCancel}>
      {single ? (
        <img
          src={previewUrls[0]}
          alt="meal preview"
          style={{
            width: "100%",
            maxHeight: 280,
            objectFit: "cover",
            borderRadius: 12,
            background: "#18181b",
          }}
        />
      ) : (
        <>
          <div
            style={{
              display: "flex",
              gap: 8,
              overflowX: "auto",
              paddingBottom: 4,
              WebkitOverflowScrolling: "touch",
            }}
          >
            {previewUrls.map((url, i) => (
              <div
                key={i}
                style={{
                  position: "relative",
                  flexShrink: 0,
                  width: 120,
                  height: 160,
                  borderRadius: 10,
                  overflow: "hidden",
                  background: "#18181b",
                }}
              >
                <img
                  src={url}
                  alt={`photo ${i + 1}`}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
                <button
                  onClick={() => onRemoveAt(i)}
                  disabled={busy}
                  aria-label={`remove photo ${i + 1}`}
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: "rgba(0,0,0,0.65)",
                    color: "#fff",
                    fontSize: 14,
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#71717a", lineHeight: 1.4 }}>
            {files.length} photos will be combined into one image — same Vision
            cost as a single photo. Add nutrition labels here for accuracy.
          </div>
        </>
      )}
      <textarea
        autoFocus
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder={
          single
            ? "describe (optional) — e.g. at restaurant, small plate, low-sugar"
            : "describe (optional) — e.g. toast with guac + cottage cheese (labels included)"
        }
        maxLength={500}
        disabled={busy}
        rows={2}
        style={textareaStyle}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <SecondaryButton onClick={onCancel} disabled={busy}>
          cancel
        </SecondaryButton>
        <PrimaryButton onClick={onSubmit} disabled={busy} flex>
          {busy ? "reading the plate…" : "log it"}
        </PrimaryButton>
      </div>
    </SheetShell>
  );
}


function SheetShell({
  children,
  onScrimClick,
  maxHeightVh,
}: {
  children: React.ReactNode;
  onScrimClick?: () => void;
  maxHeightVh?: number;
}) {
  // Lock body scroll while the sheet is mounted. Without this, iOS Safari
  // scrolls the underlying page when the user drags inside the sheet —
  // background goes first, sheet content second. Disorienting.
  useBodyScrollLock(true);
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 50,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && onScrimClick) onScrimClick();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        style={{
          background: "#0a0a0a",
          width: "100%",
          maxWidth: 540,
          maxHeight: `${maxHeightVh ?? 80}vh`,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          padding: 16,
          paddingBottom: "max(16px, env(safe-area-inset-bottom))",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
        }}
      >
        {children}
      </div>
    </div>
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

// inputStyle + textareaStyle live in lib/styles for cross-component reuse;
// imported at the top of this file.

function PrimaryButton({
  children,
  onClick,
  disabled,
  flex,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  flex?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: flex ? 1 : undefined,
        background: disabled ? "#3f3f46" : "#65a30d",
        color: "#fff",
        padding: "12px 16px",
        fontSize: 14,
        fontWeight: 500,
        borderRadius: 8,
      }}
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: "transparent",
        color: "#a1a1aa",
        padding: "12px 16px",
        fontSize: 14,
        border: "1px solid #27272a",
        borderRadius: 8,
      }}
    >
      {children}
    </button>
  );
}

function computeTotals(items: Item[]) {
  let sat_fat_g = 0;
  let soluble_fiber_g = 0;
  let calories = 0;
  let protein_g = 0;
  let plant_grams = 0;
  let total_grams = 0;
  for (const i of items) {
    if (!i.per_100g) continue;
    const f = i.grams / 100;
    sat_fat_g += i.per_100g.sat_fat_g * f;
    soluble_fiber_g += i.per_100g.soluble_fiber_g * f;
    calories += i.per_100g.calories * f;
    protein_g += i.per_100g.protein_g * f;
    total_grams += i.grams;
    if (i.is_plant) plant_grams += i.grams;
  }
  return {
    sat_fat_g,
    soluble_fiber_g,
    calories,
    protein_g,
    plant_pct: total_grams > 0 ? Math.round((plant_grams / total_grams) * 100) : 0,
  };
}
