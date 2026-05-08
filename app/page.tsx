"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { History } from "./components/History";
import { SettingsSheet } from "./components/SettingsSheet";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import { useTargets } from "@/lib/targets";

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


function todayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dayLabel(d: Date): string {
  const today = todayStart();
  const diffDays = Math.round((today.getTime() - d.getTime()) / (24 * 3600 * 1000));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  // Older than 1 day: show weekday + short date.
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export default function Home() {
  const [viewDate, setViewDate] = useState<Date>(() => todayStart());
  const [meals, setMeals] = useState<Meal[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
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
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setCaption("");
    setPendingFile(file);
  }

  function cancelPending() {
    setPendingFile(null);
    setCaption("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function submitPending() {
    if (!pendingFile) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("photo", pendingFile);
      if (caption.trim()) fd.append("caption", caption.trim());
      const r = await fetch("/api/parse", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "parse failed");
      // Jump to today since the new meal is timestamped now.
      const today = todayStart();
      setViewDate(today);
      await loadMeals(today);
      setHistoryVersion((v) => v + 1);
      setPendingFile(null);
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

  async function saveEdit(items: Item[]) {
    if (!editingMeal) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/meals/${editingMeal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "save failed");
      await loadMeals();
      setHistoryVersion((v) => v + 1);
      setEditingMeal(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

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
        <button
          onClick={() => setSettingsOpen(true)}
          aria-label="settings"
          title="Settings"
          style={{
            ...dayNavBtnStyle,
            fontSize: 16,
            color: "#52525b",
            position: "absolute",
            right: 16,
            top: 20,
          }}
        >
          ⋯
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
          />
          <div
            style={{
              marginTop: 28,
              padding: "20px 16px",
              textAlign: "center",
              color: "#71717a",
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            Nothing yet today.
            <button
              onClick={() => setTextMode(true)}
              disabled={busy}
              style={{
                display: "block",
                margin: "12px auto 0",
                background: "transparent",
                color: "#a1a1aa",
                fontSize: 13,
                border: "none",
                padding: 6,
                cursor: "pointer",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              or type what you ate →
            </button>
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
              onEdit={() => setEditingMeal(m)}
            />
          ))}
        </div>

        {isToday && (
          <button
            onClick={() => setTextMode(true)}
            disabled={busy}
            style={{
              background: "transparent",
              color: "#71717a",
              fontSize: 13,
              padding: "20px 8px 8px",
              margin: "12px auto 0",
              display: "block",
              textAlign: "center",
              width: "100%",
              border: "none",
              cursor: "pointer",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            or type what you ate →
          </button>
        )}
      </section>

      {/* Looking-back lives below today when today has meals (or you're
          viewing a past day). Smart switch promotes it above when today
          is empty — see top of render. */}
      <div style={{ marginTop: 36 }}>
        <History
          version={historyVersion}
          selectedDate={ymd(viewDate)}
          onPickDate={(d) => setViewDate(new Date(d + "T00:00:00"))}
        />
      </div>
        </>
      )}

      {isToday && <FAB busy={busy} inputId="photo-input" />}
      <input
        ref={fileInputRef}
        id="photo-input"
        type="file"
        accept="image/*"
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

      {pendingFile && (
        <ConfirmSheet
          file={pendingFile}
          caption={caption}
          setCaption={setCaption}
          busy={busy}
          onCancel={cancelPending}
          onSubmit={submitPending}
        />
      )}

      {editingMeal && (
        <EditSheet
          meal={editingMeal}
          busy={busy}
          onCancel={() => setEditingMeal(null)}
          onSave={saveEdit}
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

function FAB({ busy, inputId }: { busy: boolean; inputId: string }) {
  const sharedStyle: React.CSSProperties = {
    position: "fixed",
    bottom: "max(32px, env(safe-area-inset-bottom))",
    left: "50%",
    transform: "translateX(-50%)",
    width: 72,
    height: 72,
    borderRadius: "50%",
    background: busy ? "#3f3f46" : "#65a30d",
    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
    fontSize: 28,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: busy ? "default" : "pointer",
    WebkitTapHighlightColor: "transparent",
    userSelect: "none",
    zIndex: 40,
  };

  if (busy) {
    return (
      <div role="status" aria-label="processing" style={sharedStyle}>
        …
      </div>
    );
  }
  return (
    <label htmlFor={inputId} aria-label="snap meal" style={sharedStyle}>
      📷
    </label>
  );
}

function ConfirmSheet({
  file,
  caption,
  setCaption,
  busy,
  onCancel,
  onSubmit,
}: {
  file: File;
  caption: string;
  setCaption: (v: string) => void;
  busy: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const previewUrl = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(previewUrl), [previewUrl]);

  return (
    <SheetShell onScrimClick={busy ? undefined : onCancel}>
      <img
        src={previewUrl}
        alt="meal preview"
        style={{
          width: "100%",
          maxHeight: 280,
          objectFit: "cover",
          borderRadius: 12,
          background: "#18181b",
        }}
      />
      <textarea
        autoFocus
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="describe (optional) — e.g. at restaurant, small plate, low-sugar"
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

function EditSheet({
  meal,
  busy,
  onCancel,
  onSave,
}: {
  meal: Meal;
  busy: boolean;
  onCancel: () => void;
  onSave: (items: Item[]) => Promise<void> | void;
}) {
  const original = useMemo(() => safeParseItems(meal.items_json) as Item[], [meal.items_json]);
  const [items, setItems] = useState<Item[]>(() => original);
  const [adding, setAdding] = useState(false);
  const [addName, setAddName] = useState("");
  const [addGrams, setAddGrams] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [talkMsg, setTalkMsg] = useState("");
  const [talkBusy, setTalkBusy] = useState(false);
  const [talkError, setTalkError] = useState<string | null>(null);
  const [talkHint, setTalkHint] = useState<string | null>(null);

  async function talkFix() {
    const message = talkMsg.trim();
    if (!message) return;
    setTalkBusy(true);
    setTalkError(null);
    setTalkHint(null);
    try {
      const r = await fetch(`/api/meals/${meal.id}/talk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "fix failed");
      if (!Array.isArray(j.items) || j.items.length === 0) {
        throw new Error("got empty items back");
      }
      setItems(j.items);
      setTalkMsg("");
      setTalkHint("updated — review, then save");
    } catch (err: any) {
      setTalkError(err.message);
    } finally {
      setTalkBusy(false);
    }
  }

  const live = useMemo(() => computeTotals(items), [items]);

  function patchGrams(idx: number, value: string) {
    const grams = Math.max(0, Math.min(5000, parseFloat(value) || 0));
    setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, grams } : it)));
  }

  function patchName(idx: number, value: string) {
    setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, name: value } : it)));
  }

  function removeItem(idx: number) {
    setItems((arr) => arr.filter((_, i) => i !== idx));
  }

  async function addItem() {
    setAddError(null);
    const name = addName.trim();
    const grams = parseFloat(addGrams);
    if (!name) return setAddError("name required");
    if (!grams || grams <= 0) return setAddError("grams required");
    setAddBusy(true);
    try {
      const r = await fetch("/api/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "lookup failed");
      const newItem: Item = {
        name,
        grams,
        confidence: "medium",
        is_plant: !!j.is_plant,
        per_100g: j.per_100g,
      };
      setItems((arr) => [...arr, newItem]);
      setAddName("");
      setAddGrams("");
      setAdding(false);
    } catch (err: any) {
      setAddError(err.message ?? "lookup failed");
    } finally {
      setAddBusy(false);
    }
  }

  const dirty = JSON.stringify(items) !== JSON.stringify(original);
  const canSave = !busy && !addBusy && items.length > 0 && dirty;

  return (
    <SheetShell onScrimClick={busy ? undefined : onCancel} maxHeightVh={92}>
      {meal.photo_filename && (
        <img
          src={`/api/photo/${meal.photo_filename}`}
          alt=""
          style={{
            width: "100%",
            maxHeight: 200,
            objectFit: "cover",
            borderRadius: 8,
            background: "#18181b",
          }}
        />
      )}
      {meal.caption && (
        <div style={{ fontSize: 12, color: "#a1a1aa", fontStyle: "italic" }}>
          “{meal.caption}”
        </div>
      )}

      <div
        style={{
          background: "#0f0f10",
          border: "1px solid #1f1f22",
          borderRadius: 8,
          padding: 10,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div style={{ fontSize: 11, color: "#71717a", letterSpacing: 0.5 }}>
          QUICK FIX — TELL CLAUDE
        </div>
        <textarea
          value={talkMsg}
          onChange={(e) => setTalkMsg(e.target.value)}
          placeholder="e.g. it's all plant / smaller portion / add olive oil"
          maxLength={500}
          disabled={talkBusy || busy}
          onKeyDown={(e) => {
            // Enter submits, Shift+Enter inserts a newline.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              talkFix();
            }
          }}
          rows={2}
          style={{ ...textareaStyle, padding: "10px 12px", fontSize: 14 }}
        />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={talkFix}
            disabled={talkBusy || busy || !talkMsg.trim()}
            style={{
              background: talkBusy || !talkMsg.trim() ? "#3f3f46" : "#0c4a6e",
              color: "#fff",
              padding: "8px 12px",
              fontSize: 13,
              borderRadius: 6,
            }}
          >
            {talkBusy ? "thinking…" : "fix it"}
          </button>
          {talkError && (
            <span style={{ fontSize: 11, color: "#fca5a5" }}>{talkError}</span>
          )}
          {talkHint && !talkError && (
            <span style={{ fontSize: 11, color: "#a3e635" }}>{talkHint}</span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", flex: 1, minHeight: 0 }}>
        {items.map((it, idx) => (
          <ItemRow
            key={idx}
            item={it}
            onName={(v) => patchName(idx, v)}
            onGrams={(v) => patchGrams(idx, v)}
            onRemove={() => removeItem(idx)}
            disabled={busy}
          />
        ))}
        {adding ? (
          <div style={{ background: "#0f0f10", border: "1px dashed #3f3f46", borderRadius: 8, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            <textarea
              autoFocus
              value={addName}
              placeholder="e.g. olive oil, avocado, salmon"
              onChange={(e) => setAddName(e.target.value)}
              disabled={addBusy}
              rows={1}
              style={textareaStyle}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="number"
                value={addGrams}
                placeholder="grams"
                onChange={(e) => setAddGrams(e.target.value)}
                disabled={addBusy}
                style={{ ...inputStyle, flex: 1 }}
                min={0}
                max={5000}
                inputMode="numeric"
              />
              <SecondaryButton
                onClick={() => {
                  setAdding(false);
                  setAddName("");
                  setAddGrams("");
                  setAddError(null);
                }}
                disabled={addBusy}
              >
                cancel
              </SecondaryButton>
              <PrimaryButton onClick={addItem} disabled={addBusy}>
                {addBusy ? "looking up…" : "add"}
              </PrimaryButton>
            </div>
            {addError && (
              <div style={{ fontSize: 11, color: "#fca5a5" }}>{addError}</div>
            )}
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            disabled={busy}
            style={{
              background: "transparent",
              color: "#a1a1aa",
              border: "1px dashed #3f3f46",
              borderRadius: 8,
              padding: "10px 12px",
              fontSize: 13,
              textAlign: "left",
            }}
          >
            + add item
          </button>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr",
          gap: 6,
          fontSize: 11,
          color: "#a1a1aa",
          padding: "8px 0 4px",
          borderTop: "1px solid #27272a",
        }}
      >
        <LiveStat label="kcal" value={Math.round(live.calories).toString()} />
        <LiveStat label="sat" value={`${live.sat_fat_g.toFixed(1)}g`} />
        <LiveStat label="fib" value={`${live.soluble_fiber_g.toFixed(1)}g`} />
        <LiveStat label="pro" value={`${live.protein_g.toFixed(0)}g`} />
        <LiveStat label="plant" value={`${live.plant_pct}%`} />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <SecondaryButton onClick={onCancel} disabled={busy}>
          cancel
        </SecondaryButton>
        <PrimaryButton onClick={() => onSave(items)} disabled={!canSave} flex>
          {busy ? "saving…" : "save"}
        </PrimaryButton>
      </div>
    </SheetShell>
  );
}

function ItemRow({
  item,
  onName,
  onGrams,
  onRemove,
  disabled,
}: {
  item: Item;
  onName: (v: string) => void;
  onGrams: (v: string) => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const dot =
    item.confidence === "low"
      ? { color: "#f97316", title: "low confidence — Vision was guessing" }
      : item.confidence === "medium"
      ? { color: "#a16207", title: "medium confidence — reasonable estimate" }
      : null;
  return (
    <div
      style={{
        background: "#0f0f10",
        border: "1px solid #27272a",
        borderRadius: 8,
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {dot && (
          <span
            title={dot.title}
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: dot.color,
              flexShrink: 0,
            }}
          />
        )}
        <textarea
          value={item.name}
          onChange={(e) => onName(e.target.value)}
          disabled={disabled}
          rows={1}
          style={{
            ...textareaStyle,
            padding: "8px 10px",
            fontSize: 14,
            flex: 1,
            minHeight: 36,
          }}
        />
        <button
          onClick={onRemove}
          disabled={disabled}
          aria-label="remove item"
          style={{
            color: "#71717a",
            padding: "4px 8px",
            fontSize: 16,
            background: "transparent",
          }}
        >
          ✕
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="number"
          value={item.grams}
          onChange={(e) => onGrams(e.target.value)}
          disabled={disabled}
          inputMode="numeric"
          min={0}
          max={5000}
          style={{
            ...inputStyle,
            padding: "8px 10px",
            fontSize: 14,
            width: 90,
          }}
        />
        <span style={{ fontSize: 12, color: "#71717a" }}>g</span>
        <span style={{ fontSize: 11, color: "#52525b", marginLeft: "auto" }}>
          {Math.round((item.grams * item.per_100g.calories) / 100)} kcal · {(
            (item.grams * item.per_100g.sat_fat_g) /
            100
          ).toFixed(1)}g sat
        </span>
      </div>
    </div>
  );
}

function LiveStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: "#52525b", letterSpacing: 0.5, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 14, color: "#f4f4f5", fontWeight: 500 }}>{value}</div>
    </div>
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

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#18181b",
  color: "#f4f4f5",
  border: "1px solid #27272a",
  borderRadius: 8,
  padding: "12px 14px",
  fontSize: 16,
  outline: "none",
};

// Same look as inputStyle but for <textarea>: wraps long text so the
// caret stays visible on mobile (single-line <input> scrolls horizontally
// and hides what you're typing).
const textareaStyle: React.CSSProperties = {
  width: "100%",
  background: "#18181b",
  color: "#f4f4f5",
  border: "1px solid #27272a",
  borderRadius: 8,
  padding: "12px 14px",
  fontSize: 16,
  outline: "none",
  lineHeight: 1.4,
  minHeight: 44,
  resize: "none",
};

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
