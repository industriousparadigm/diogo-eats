"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Meal = {
  id: string;
  created_at: number;
  photo_filename: string | null;
  items_json: string;
  sat_fat_g: number;
  soluble_fiber_g: number;
  calories: number;
  protein_g: number;
  is_plant_based: number;
  notes: string | null;
  caption: string | null;
};

type Item = { name: string; estimated_grams: number; confidence: string };

const TARGETS = {
  sat_fat_g: 13,
  soluble_fiber_g: 10,
  calories: 2000,
  protein_g: 90,
};

export default function Home() {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadMeals() {
    const r = await fetch("/api/meals");
    const j = await r.json();
    setMeals(j.meals ?? []);
  }

  useEffect(() => {
    loadMeals();
  }, []);

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
      await loadMeals();
      setPendingFile(null);
      setCaption("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function deleteMeal(id: string) {
    await fetch("/api/meals", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await loadMeals();
  }

  const totals = meals.reduce(
    (t, m) => ({
      sat_fat_g: t.sat_fat_g + m.sat_fat_g,
      soluble_fiber_g: t.soluble_fiber_g + m.soluble_fiber_g,
      calories: t.calories + m.calories,
      protein_g: t.protein_g + m.protein_g,
      plant_count: t.plant_count + (m.is_plant_based ? 1 : 0),
    }),
    { sat_fat_g: 0, soluble_fiber_g: 0, calories: 0, protein_g: 0, plant_count: 0 }
  );

  const plantPct = meals.length ? Math.round((totals.plant_count / meals.length) * 100) : 0;

  return (
    <main style={{ padding: "20px 16px 120px", maxWidth: 540, margin: "0 auto" }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 14, fontWeight: 500, color: "#71717a", letterSpacing: 1 }}>
          EATS · {new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
        </h1>
      </header>

      <Pulse totals={totals} plantPct={plantPct} mealCount={meals.length} />

      {error && (
        <div style={{ background: "#7f1d1d", padding: 12, borderRadius: 8, margin: "16px 0", fontSize: 14 }}>
          {error}
        </div>
      )}

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 12, color: "#71717a", letterSpacing: 1, marginBottom: 12 }}>TODAY</h2>
        {meals.length === 0 && !busy && (
          <p style={{ color: "#52525b", fontSize: 14, padding: "24px 0" }}>
            Nothing yet. Snap your first meal.
          </p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {meals.map((m) => (
            <MealCard key={m.id} meal={m} onDelete={() => deleteMeal(m.id)} />
          ))}
        </div>
      </section>

      <FAB busy={busy} onClick={() => fileInputRef.current?.click()} />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onPhoto}
        style={{ display: "none" }}
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
    </main>
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
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        style={{
          background: "#0a0a0a",
          width: "100%",
          maxWidth: 540,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          padding: 16,
          paddingBottom: "max(16px, env(safe-area-inset-bottom))",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <img
          src={previewUrl}
          alt="meal preview"
          style={{
            width: "100%",
            maxHeight: 280,
            objectFit: "cover",
            borderRadius: 8,
            background: "#18181b",
          }}
        />
        <input
          autoFocus
          type="text"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="describe (optional) — e.g. low-sugar, homemade"
          maxLength={500}
          disabled={busy}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmit();
          }}
          style={{
            width: "100%",
            background: "#18181b",
            color: "#f4f4f5",
            border: "1px solid #27272a",
            borderRadius: 8,
            padding: "12px 14px",
            fontSize: 16,
            outline: "none",
          }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onCancel}
            disabled={busy}
            style={{
              flex: "0 0 auto",
              background: "transparent",
              color: "#a1a1aa",
              padding: "12px 16px",
              fontSize: 14,
              border: "1px solid #27272a",
              borderRadius: 8,
            }}
          >
            cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={busy}
            style={{
              flex: 1,
              background: busy ? "#3f3f46" : "#65a30d",
              color: "#fff",
              padding: "12px 16px",
              fontSize: 14,
              fontWeight: 500,
              borderRadius: 8,
            }}
          >
            {busy ? "reading the plate…" : "log it"}
          </button>
        </div>
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
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 8,
        background: "#18181b",
        padding: 16,
        borderRadius: 12,
      }}
    >
      <Stat label="sat fat" value={totals.sat_fat_g.toFixed(1)} unit="g" target={TARGETS.sat_fat_g} invert />
      <Stat
        label="soluble fiber"
        value={totals.soluble_fiber_g.toFixed(1)}
        unit="g"
        target={TARGETS.soluble_fiber_g}
      />
      <Stat label="plant" value={String(plantPct)} unit="%" target={100} subtle={`${mealCount} meals`} />
      <Stat label="calories" value={Math.round(totals.calories).toString()} unit="" target={TARGETS.calories} />
      <Stat label="protein" value={totals.protein_g.toFixed(0)} unit="g" target={TARGETS.protein_g} fullSpan />
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
      <div style={{ fontSize: 11, color: "#71717a", letterSpacing: 0.5, marginBottom: 4 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ fontSize: 22, fontWeight: 500, color: over ? "#fca5a5" : "#f4f4f5" }}>
        {value}
        <span style={{ fontSize: 13, color: "#71717a", marginLeft: 2 }}>{unit}</span>
      </div>
      <div
        style={{
          height: 2,
          background: "#27272a",
          marginTop: 6,
          borderRadius: 1,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: over ? "#dc2626" : "#65a30d",
            transition: "width 0.3s",
          }}
        />
      </div>
      {subtle && <div style={{ fontSize: 10, color: "#52525b", marginTop: 4 }}>{subtle}</div>}
    </div>
  );
}

function MealCard({ meal, onDelete }: { meal: Meal; onDelete: () => void }) {
  const items: Item[] = JSON.parse(meal.items_json);
  const time = new Date(meal.created_at).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div
      style={{
        background: "#18181b",
        borderRadius: 12,
        overflow: "hidden",
        display: "flex",
        gap: 12,
      }}
    >
      {meal.photo_filename && (
        <img
          src={`/api/photo/${meal.photo_filename}`}
          alt=""
          style={{ width: 96, height: 96, objectFit: "cover", flexShrink: 0 }}
        />
      )}
      <div style={{ flex: 1, padding: "10px 12px 10px 0", minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontSize: 11, color: "#71717a", letterSpacing: 0.5 }}>
            {time} {meal.is_plant_based ? "· 🌱" : ""}
          </div>
          <button
            onClick={onDelete}
            style={{ fontSize: 11, color: "#52525b", padding: "2px 6px" }}
            aria-label="delete"
          >
            ✕
          </button>
        </div>
        <div style={{ fontSize: 14, marginTop: 4, lineHeight: 1.3 }}>
          {items.map((i) => i.name).join(", ")}
        </div>
        {meal.caption && (
          <div style={{ fontSize: 11, color: "#a1a1aa", marginTop: 4 }}>
            “{meal.caption}”
          </div>
        )}
        <div style={{ fontSize: 11, color: "#71717a", marginTop: 6, display: "flex", gap: 12 }}>
          <span>{Math.round(meal.calories)} kcal</span>
          <span>{meal.sat_fat_g.toFixed(1)}g sat</span>
          <span>{meal.soluble_fiber_g.toFixed(1)}g fib</span>
          <span>{meal.protein_g.toFixed(0)}g pro</span>
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

function FAB({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      style={{
        position: "fixed",
        bottom: 32,
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
      }}
      aria-label="snap meal"
    >
      {busy ? "…" : "📷"}
    </button>
  );
}
