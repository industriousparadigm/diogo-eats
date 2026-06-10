"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { colors, inputStyle, radii } from "@/lib/styles";
import {
  createFood,
  deleteFood,
  fetchFoods,
  foodFromLabel,
  mergeFoods,
  updateFood,
  type Food,
  type Provenance,
} from "@/lib/api";
import { provenanceLabel } from "@/lib/foods";
import type { Per100g } from "@/lib/types";

function parsePer100g(raw: string): Per100g {
  try {
    return JSON.parse(raw);
  } catch {
    return { sat_fat_g: 0, soluble_fiber_g: 0, calories: 0, protein_g: 0 };
  }
}

// First-class, page-first foods library (house rule: no modal). Search,
// list with provenance badges, edit, merge, delete, manual add, and the
// label-photo capture flow that turns a packaged-food panel into a
// deterministic per-100g entry.
export default function FoodsPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [foods, setFoods] = useState<Food[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // editing: name_key of the row whose edit form is open.
  const [editingKey, setEditingKey] = useState<string | null>(null);
  // merge mode: a keep row + a set of selected merge keys.
  const [mergeKeepKey, setMergeKeepKey] = useState<string | null>(null);
  const [mergeSel, setMergeSel] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [labelBusy, setLabelBusy] = useState(false);
  const labelInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchFoods(q, { limit: 100 });
      setFoods(data);
    } catch (err: any) {
      setError(err?.message ?? "load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search.
  useEffect(() => {
    const t = setTimeout(() => load(query), query ? 220 : 0);
    return () => clearTimeout(t);
  }, [query, load]);

  function resetModes() {
    setEditingKey(null);
    setMergeKeepKey(null);
    setMergeSel(new Set());
    setAdding(false);
  }

  async function onLabelPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-pick of the same file
    if (!file) return;
    setLabelBusy(true);
    setError(null);
    try {
      await foodFromLabel(file);
      await load(query);
    } catch (err: any) {
      setError(err?.message ?? "label read failed");
    } finally {
      setLabelBusy(false);
    }
  }

  function toggleMergeSel(key: string) {
    setMergeSel((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function commitMerge() {
    if (!mergeKeepKey || mergeSel.size === 0) return;
    setError(null);
    try {
      await mergeFoods(mergeKeepKey, Array.from(mergeSel));
      resetModes();
      await load(query);
    } catch (err: any) {
      setError(err?.message ?? "merge failed");
    }
  }

  const list = foods ?? [];

  return (
    <main style={{ padding: "20px 16px 120px", maxWidth: 540, margin: "0 auto" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          paddingBottom: 14,
          marginBottom: 14,
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        <button
          onClick={() => router.push("/")}
          aria-label="back"
          style={{
            background: "transparent",
            color: colors.textMuted,
            fontSize: 22,
            padding: 6,
            borderRadius: 6,
          }}
        >
          ‹
        </button>
        <h1
          style={{
            flex: 1,
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: 2,
            color: colors.text,
            margin: 0,
          }}
        >
          FOODS
        </h1>
        <span style={{ fontSize: 11, color: colors.textFaint }}>
          {foods ? `${list.length}${list.length === 100 ? "+" : ""}` : ""}
        </span>
      </header>

      {/* search */}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="search your foods…"
        style={{ ...inputStyle, marginBottom: 12 }}
        autoComplete="off"
      />

      {/* primary actions: add manually + read a label */}
      <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
        <button
          onClick={() => {
            resetModes();
            setAdding((a) => !a);
          }}
          style={secondaryBtn}
        >
          {adding ? "close" : "+ add food"}
        </button>
        <button
          onClick={() => labelInputRef.current?.click()}
          disabled={labelBusy}
          style={{ ...secondaryBtn, opacity: labelBusy ? 0.6 : 1 }}
        >
          {labelBusy ? "reading label…" : "📷 read a label"}
        </button>
        <input
          ref={labelInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onLabelPick}
          style={{ display: "none" }}
        />
      </div>

      {error && (
        <div
          style={{
            background: "#7f1d1d",
            color: colors.text,
            padding: 10,
            borderRadius: radii.sm,
            fontSize: 13,
            margin: "10px 0",
          }}
        >
          {error}
        </div>
      )}

      {adding && (
        <AddFoodForm
          onCancel={() => setAdding(false)}
          onAdded={async () => {
            setAdding(false);
            await load(query);
          }}
        />
      )}

      {/* merge banner when in merge mode */}
      {mergeKeepKey && (
        <div
          style={{
            background: "rgba(132,204,22,0.08)",
            border: `1px solid rgba(132,204,22,0.22)`,
            borderRadius: radii.sm,
            padding: 10,
            margin: "10px 0",
            fontSize: 12,
            color: colors.text,
          }}
        >
          <div style={{ marginBottom: 8, color: colors.accentLight }}>
            Merge into <b>{list.find((f) => f.name_key === mergeKeepKey)?.display_name}</b> — pick the
            duplicates to fold in, then merge.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={commitMerge} disabled={mergeSel.size === 0} style={{ ...primaryBtn, opacity: mergeSel.size === 0 ? 0.5 : 1 }}>
              merge {mergeSel.size > 0 ? `(${mergeSel.size})` : ""}
            </button>
            <button onClick={resetModes} style={secondaryBtn}>
              cancel
            </button>
          </div>
        </div>
      )}

      {/* list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
        {foods === null && loading && (
          <p style={{ color: colors.textFaint, fontSize: 14, padding: "24px 0" }}>loading…</p>
        )}
        {foods !== null && list.length === 0 && (
          <p style={{ color: colors.textFaint, fontSize: 14, padding: "24px 0" }}>
            {query ? "no foods match." : "no foods yet — log a meal or read a label."}
          </p>
        )}
        {list.map((f) =>
          editingKey === f.name_key ? (
            <EditFoodForm
              key={f.name_key}
              food={f}
              onCancel={() => setEditingKey(null)}
              onSaved={async () => {
                setEditingKey(null);
                await load(query);
              }}
              onDeleted={async () => {
                setEditingKey(null);
                await load(query);
              }}
            />
          ) : (
            <FoodCard
              key={f.name_key}
              food={f}
              mergeMode={mergeKeepKey !== null}
              isMergeKeep={mergeKeepKey === f.name_key}
              isMergeSelected={mergeSel.has(f.name_key)}
              onEdit={() => {
                resetModes();
                setEditingKey(f.name_key);
              }}
              onStartMerge={() => {
                resetModes();
                setMergeKeepKey(f.name_key);
              }}
              onToggleMerge={() => toggleMergeSel(f.name_key)}
            />
          )
        )}
      </div>
    </main>
  );
}

const secondaryBtn: React.CSSProperties = {
  background: "transparent",
  color: colors.textMuted,
  border: `1px solid ${colors.borderStrong}`,
  borderRadius: radii.sm,
  padding: "9px 12px",
  fontSize: 13,
  cursor: "pointer",
};
const primaryBtn: React.CSSProperties = {
  background: colors.accent,
  color: "#fff",
  border: "none",
  borderRadius: radii.sm,
  padding: "9px 14px",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
};

function provBadgeStyle(p: Provenance): React.CSSProperties {
  // label_verified = strongest (lime), user_corrected = soft, ai_inferred = faint.
  const map: Record<Provenance, { bg: string; fg: string; bd: string }> = {
    label_verified: { bg: "rgba(132,204,22,0.12)", fg: colors.accentLight, bd: "rgba(132,204,22,0.30)" },
    user_corrected: { bg: colors.surfaceMuted, fg: colors.textMuted, bd: colors.borderStrong },
    ai_inferred: { bg: "transparent", fg: colors.textFaint, bd: colors.border },
  };
  const c = map[p] ?? map.ai_inferred;
  return {
    fontSize: 10,
    color: c.fg,
    background: c.bg,
    border: `1px solid ${c.bd}`,
    borderRadius: 999,
    padding: "2px 8px",
    letterSpacing: 0.3,
    whiteSpace: "nowrap",
  };
}

function FoodCard({
  food,
  mergeMode,
  isMergeKeep,
  isMergeSelected,
  onEdit,
  onStartMerge,
  onToggleMerge,
}: {
  food: Food;
  mergeMode: boolean;
  isMergeKeep: boolean;
  isMergeSelected: boolean;
  onEdit: () => void;
  onStartMerge: () => void;
  onToggleMerge: () => void;
}) {
  const p = parsePer100g(food.per_100g_json);
  return (
    <div
      onClick={mergeMode && !isMergeKeep ? onToggleMerge : undefined}
      style={{
        background: isMergeSelected ? "rgba(132,204,22,0.07)" : colors.surface,
        border: `1px solid ${isMergeSelected ? "rgba(132,204,22,0.30)" : colors.border}`,
        borderRadius: radii.md,
        padding: "12px 14px",
        cursor: mergeMode && !isMergeKeep ? "pointer" : "default",
        opacity: isMergeKeep ? 0.55 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, justifyContent: "space-between" }}>
        <div style={{ fontSize: 14, color: colors.text, lineHeight: 1.35, minWidth: 0 }}>
          {food.is_plant ? "🌱 " : ""}
          {food.display_name}
        </div>
        <span style={provBadgeStyle(food.provenance)}>{provenanceLabel(food.provenance)}</span>
      </div>
      <div
        style={{
          fontSize: 11,
          color: colors.textSubtle,
          marginTop: 6,
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        <span>{Math.round(p.calories)} kcal</span>
        <span>{p.sat_fat_g.toFixed(1)}g sat</span>
        <span>{p.soluble_fiber_g.toFixed(1)}g fib</span>
        <span>{p.protein_g.toFixed(0)}g pro</span>
        <span style={{ color: colors.textFaint }}>· per 100g</span>
        <span style={{ marginLeft: "auto", color: colors.textFaint }}>
          seen {food.times_seen}×
        </span>
      </div>
      {!mergeMode && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button onClick={onEdit} style={miniBtn}>
            edit
          </button>
          <button onClick={onStartMerge} style={miniBtn} title="fold duplicates into this one">
            merge…
          </button>
        </div>
      )}
    </div>
  );
}

const miniBtn: React.CSSProperties = {
  background: "transparent",
  color: colors.textMuted,
  border: `1px solid ${colors.border}`,
  borderRadius: 999,
  padding: "4px 12px",
  fontSize: 11,
  cursor: "pointer",
};

// ---- forms ----

const NUM_FIELDS: { key: keyof Per100g; label: string }[] = [
  { key: "calories", label: "kcal" },
  { key: "sat_fat_g", label: "sat fat g" },
  { key: "soluble_fiber_g", label: "sol. fiber g" },
  { key: "protein_g", label: "protein g" },
];

function NutritionFields({
  values,
  onChange,
  disabled,
}: {
  values: Record<string, string>;
  onChange: (key: string, v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {NUM_FIELDS.map((f) => (
        <label key={f.key} style={{ fontSize: 11, color: colors.textSubtle }}>
          {f.label} (per 100g)
          <input
            type="number"
            inputMode="decimal"
            value={values[f.key] ?? ""}
            onChange={(e) => onChange(f.key, e.target.value)}
            disabled={disabled}
            min={0}
            max={1000}
            style={{ ...inputStyle, marginTop: 4, fontSize: 14, padding: "8px 10px" }}
          />
        </label>
      ))}
    </div>
  );
}

function toPer100g(values: Record<string, string>): Per100g {
  const num = (k: string) => {
    const n = parseFloat(values[k]);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    sat_fat_g: num("sat_fat_g"),
    soluble_fiber_g: num("soluble_fiber_g"),
    calories: num("calories"),
    protein_g: num("protein_g"),
  };
}

function AddFoodForm({ onCancel, onAdded }: { onCancel: () => void; onAdded: () => void }) {
  const [name, setName] = useState("");
  const [isPlant, setIsPlant] = useState(true);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) return setErr("name required");
    setBusy(true);
    setErr(null);
    try {
      await createFood({ display_name: name.trim(), is_plant: isPlant, per_100g: toPer100g(vals) });
      onAdded();
    } catch (e: any) {
      setErr(e?.message ?? "add failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={formCardStyle}>
      <div style={{ fontSize: 11, color: colors.textSubtle, letterSpacing: 0.5 }}>ADD A FOOD</div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Provamel oat milk"
        style={inputStyle}
        autoFocus
      />
      <PlantToggle value={isPlant} onChange={setIsPlant} />
      <NutritionFields values={vals} onChange={(k, v) => setVals((s) => ({ ...s, [k]: v }))} disabled={busy} />
      {err && <div style={{ fontSize: 12, color: colors.bad }}>{err}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={submit} disabled={busy} style={primaryBtn}>
          {busy ? "saving…" : "add"}
        </button>
        <button onClick={onCancel} disabled={busy} style={secondaryBtn}>
          cancel
        </button>
      </div>
    </div>
  );
}

function EditFoodForm({
  food,
  onCancel,
  onSaved,
  onDeleted,
}: {
  food: Food;
  onCancel: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const p = parsePer100g(food.per_100g_json);
  const [name, setName] = useState(food.display_name);
  const [isPlant, setIsPlant] = useState(food.is_plant === 1);
  const [vals, setVals] = useState<Record<string, string>>({
    calories: String(p.calories),
    sat_fat_g: String(p.sat_fat_g),
    soluble_fiber_g: String(p.soluble_fiber_g),
    protein_g: String(p.protein_g),
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) return setErr("name required");
    setBusy(true);
    setErr(null);
    try {
      await updateFood(food.name_key, {
        display_name: name.trim(),
        is_plant: isPlant,
        per_100g: toPer100g(vals),
      });
      onSaved();
    } catch (e: any) {
      setErr(e?.message ?? "save failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete "${food.display_name}" from your foods?`)) return;
    setBusy(true);
    try {
      await deleteFood(food.name_key);
      onDeleted();
    } catch (e: any) {
      setErr(e?.message ?? "delete failed");
      setBusy(false);
    }
  }

  return (
    <div style={{ ...formCardStyle, border: `1px solid ${colors.borderStrong}` }}>
      <div style={{ fontSize: 11, color: colors.textSubtle, letterSpacing: 0.5 }}>EDIT FOOD</div>
      <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
      <PlantToggle value={isPlant} onChange={setIsPlant} />
      <NutritionFields values={vals} onChange={(k, v) => setVals((s) => ({ ...s, [k]: v }))} disabled={busy} />
      {err && <div style={{ fontSize: 12, color: colors.bad }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={save} disabled={busy} style={primaryBtn}>
          {busy ? "saving…" : "save"}
        </button>
        <button onClick={onCancel} disabled={busy} style={secondaryBtn}>
          cancel
        </button>
        <button
          onClick={remove}
          disabled={busy}
          style={{ ...secondaryBtn, marginLeft: "auto", color: colors.textFaint }}
        >
          delete
        </button>
      </div>
    </div>
  );
}

function PlantToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {[
        [true, "🌱 plant"],
        [false, "not plant"],
      ].map(([v, label]) => (
        <button
          key={String(v)}
          onClick={() => onChange(v as boolean)}
          style={{
            flex: 1,
            background: value === v ? "rgba(132,204,22,0.12)" : "transparent",
            color: value === v ? colors.accentLight : colors.textMuted,
            border: `1px solid ${value === v ? "rgba(132,204,22,0.30)" : colors.borderStrong}`,
            borderRadius: radii.sm,
            padding: "8px 10px",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          {label as string}
        </button>
      ))}
    </div>
  );
}

const formCardStyle: React.CSSProperties = {
  background: colors.surfaceAlt,
  border: `1px dashed ${colors.borderDashed}`,
  borderRadius: radii.md,
  padding: 12,
  margin: "10px 0",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};
