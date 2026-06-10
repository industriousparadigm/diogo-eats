"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { colors, inputStyle, radii } from "@/lib/styles";
import { composeMeal, fetchFoods, type Food } from "@/lib/api";
import { composeVibe } from "@/lib/compose";
import { totalsFromItems, type Item } from "@/lib/totals";
import { todayStart } from "@/lib/date";

function parsePer100g(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return { sat_fat_g: 0, soluble_fiber_g: 0, calories: 0, protein_g: 0 };
  }
}

// One composed line in local state: the resolved food + chosen grams.
type Line = { food: Food; grams: number };

export default function ComposePage() {
  return (
    <Suspense fallback={null}>
      <ComposeInner />
    </Suspense>
  );
}

// The "pão com chouriço" flow: type, select a known food, set grams, add
// the next. Zero AI — everything is built from the library's validated
// numbers. Running totals visible; save lands a deterministic meal.
function ComposeInner() {
  const router = useRouter();
  const params = useSearchParams();
  const forDateParam = params?.get("date");
  const forDateYmd = (() => {
    if (forDateParam && /^\d{4}-\d{2}-\d{2}$/.test(forDateParam)) {
      const d = new Date(`${forDateParam}T00:00:00`);
      if (!isNaN(d.getTime()) && d.getTime() <= todayStart().getTime()) return forDateParam;
    }
    return null;
  })();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Food[]>([]);
  const [searching, setSearching] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      setResults(await fetchFoods(q, { limit: 12 }));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => runSearch(query), 200);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  // Live items mirror the server's compose: confidence high, library
  // numbers verbatim. Reused by totalsFromItems + composeVibe for the
  // preview so what the user sees is exactly what saves.
  const liveItems: Item[] = useMemo(
    () =>
      lines.map((l) => ({
        name: l.food.display_name,
        grams: l.grams,
        confidence: "high",
        is_plant: l.food.is_plant === 1,
        per_100g: parsePer100g(l.food.per_100g_json),
      })),
    [lines]
  );
  const totals = useMemo(() => totalsFromItems(liveItems), [liveItems]);
  const vibe = useMemo(() => (liveItems.length ? composeVibe(liveItems) : null), [liveItems]);

  function addFood(food: Food) {
    // Sensible default grams: 100g, or a portion preset if present.
    const preset = food.portion_presets?.[0]?.grams;
    setLines((arr) => [...arr, { food, grams: preset ?? 100 }]);
    setQuery("");
    setResults([]);
    searchRef.current?.focus();
  }

  function setGrams(idx: number, grams: number) {
    setLines((arr) => arr.map((l, i) => (i === idx ? { ...l, grams: Math.max(0, Math.min(5000, grams)) } : l)));
  }
  function removeLine(idx: number) {
    setLines((arr) => arr.filter((_, i) => i !== idx));
  }

  async function save() {
    const valid = lines.filter((l) => l.grams > 0);
    if (valid.length === 0) {
      setError("add at least one food with grams");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await composeMeal(
        valid.map((l) => ({ food_id: l.food.name_key, grams: l.grams })),
        { forDate: forDateYmd ?? undefined }
      );
      const dest = forDateYmd ? `/?date=${forDateYmd}` : "/";
      router.push(dest);
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "save failed");
      setBusy(false);
    }
  }

  const canSave = !busy && lines.some((l) => l.grams > 0);

  return (
    <main
      style={{
        minHeight: "100vh",
        maxWidth: 540,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 120px)",
      }}
    >
      <header
        style={{
          padding: "16px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          borderBottom: `1px solid ${colors.border}`,
        }}
      >
        <button
          onClick={() => router.back()}
          aria-label="back"
          style={{ background: "transparent", color: colors.textMuted, fontSize: 22, padding: 6, border: "none" }}
        >
          ‹
        </button>
        <div style={{ flex: 1, fontSize: 13, color: colors.textMuted, letterSpacing: 0.5, textAlign: "center" }}>
          BUILD FROM LIBRARY
        </div>
        <div style={{ width: 36 }} />
      </header>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {/* search + autocomplete */}
        <div style={{ position: "relative" }}>
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search a food to add…"
            style={inputStyle}
            autoComplete="off"
            autoFocus
          />
          {query.trim() && (
            <div
              style={{
                marginTop: 6,
                border: `1px solid ${colors.border}`,
                borderRadius: radii.sm,
                overflow: "hidden",
                background: colors.surface,
              }}
            >
              {searching && results.length === 0 && (
                <div style={{ padding: 12, fontSize: 13, color: colors.textFaint }}>searching…</div>
              )}
              {!searching && results.length === 0 && (
                <div style={{ padding: 12, fontSize: 13, color: colors.textFaint }}>
                  no match — add it to your foods first
                </div>
              )}
              {results.map((f) => {
                const p = parsePer100g(f.per_100g_json);
                return (
                  <button
                    key={f.name_key}
                    onClick={() => addFood(f)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      background: "transparent",
                      border: "none",
                      borderBottom: `1px solid ${colors.border}`,
                      padding: "10px 12px",
                      cursor: "pointer",
                      color: colors.text,
                    }}
                  >
                    <div style={{ fontSize: 14 }}>
                      {f.is_plant ? "🌱 " : ""}
                      {f.display_name}
                    </div>
                    <div style={{ fontSize: 11, color: colors.textFaint, marginTop: 2 }}>
                      {Math.round(p.calories)} kcal · {p.protein_g.toFixed(0)}g pro · per 100g
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* chosen lines with grams steppers */}
        {lines.length === 0 ? (
          <p style={{ color: colors.textFaint, fontSize: 14, padding: "20px 0", textAlign: "center" }}>
            Search above to add foods, set grams, save. No AI — built from your library.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {lines.map((l, idx) => (
              <div
                key={`${l.food.name_key}-${idx}`}
                style={{
                  background: colors.surfaceAlt,
                  border: `1px solid ${colors.borderStrong}`,
                  borderRadius: radii.sm,
                  padding: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: colors.text, lineHeight: 1.3 }}>
                    {l.food.is_plant === 1 ? "🌱 " : ""}
                    {l.food.display_name}
                  </div>
                  <div style={{ fontSize: 11, color: colors.textFaint, marginTop: 2 }}>
                    {Math.round((l.grams * parsePer100g(l.food.per_100g_json).calories) / 100)} kcal
                  </div>
                </div>
                <input
                  type="number"
                  value={l.grams}
                  onChange={(e) => setGrams(idx, parseFloat(e.target.value) || 0)}
                  inputMode="numeric"
                  min={0}
                  max={5000}
                  style={{
                    width: 80,
                    background: colors.surfaceMuted,
                    color: colors.text,
                    border: `1px solid ${colors.borderStrong}`,
                    borderRadius: 8,
                    padding: "8px 10px",
                    fontSize: 14,
                    outline: "none",
                  }}
                />
                <span style={{ fontSize: 12, color: colors.textSubtle }}>g</span>
                <button
                  onClick={() => removeLine(idx)}
                  aria-label="remove"
                  style={{ background: "transparent", color: colors.textSubtle, border: "none", fontSize: 16, padding: "4px 6px", cursor: "pointer" }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div style={{ background: "#7f1d1d", color: colors.text, padding: 10, borderRadius: radii.sm, fontSize: 13 }}>
            {error}
          </div>
        )}
      </div>

      {/* sticky running totals + save */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: colors.bg,
          borderTop: `1px solid ${colors.border}`,
          padding: "12px 16px",
          paddingBottom: "calc(12px + env(safe-area-inset-bottom))",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          zIndex: 10,
          maxWidth: 540,
          margin: "0 auto",
        }}
      >
        {vibe && (
          <div style={{ fontSize: 11, color: colors.accentLight, textAlign: "center", letterSpacing: 0.2 }}>
            {vibe}
          </div>
        )}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr",
            gap: 6,
            fontSize: 11,
            color: colors.textMuted,
          }}
        >
          <Stat label="kcal" value={Math.round(totals.calories).toString()} />
          <Stat label="sat" value={`${totals.sat_fat_g.toFixed(1)}g`} />
          <Stat label="fib" value={`${totals.soluble_fiber_g.toFixed(1)}g`} />
          <Stat label="pro" value={`${totals.protein_g.toFixed(0)}g`} />
          <Stat label="plant" value={`${totals.plant_pct}%`} />
        </div>
        <button
          onClick={save}
          disabled={!canSave}
          style={{
            background: canSave ? colors.accent : "#3f3f46",
            color: "#fff",
            padding: "12px 16px",
            fontSize: 14,
            fontWeight: 500,
            borderRadius: 8,
            border: "none",
            cursor: canSave ? "pointer" : "default",
          }}
        >
          {busy ? "saving…" : forDateYmd ? "save for that day" : "save meal"}
        </button>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: colors.textFaint, letterSpacing: 0.5, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 14, color: colors.text, fontWeight: 500 }}>{value}</div>
    </div>
  );
}
