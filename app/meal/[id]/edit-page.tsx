"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Item, Meal } from "@/lib/types";
import { colors, inputStyle, radii, textareaStyle } from "@/lib/styles";
import { computeTotals } from "@/lib/computeTotals";
import { deleteMeal, lookupFood, patchMealItems, talkFixMeal } from "@/lib/api";
import { ItemRow } from "@/app/components/ItemRow";

function safeParseItems(raw: string): Item[] {
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr;
  } catch {
    return [];
  }
}

// Full-screen meal editor. Replaces the modal sheet that used to sit on
// top of the home page — gives every interaction a dedicated viewport,
// kills the iOS leak-through entirely, and uses real Next.js routing.
//
// State:
//   - items: the working copy. Edits are local until "save".
//   - addBusy / talkBusy: separate spinners so quick-fix and add-item
//     can run in parallel without false coupling.
//   - busy: the final save spinner.
export function EditPage({ meal }: { meal: Meal }) {
  const router = useRouter();
  const original = useMemo(() => safeParseItems(meal.items_json), [meal.items_json]);
  const [items, setItems] = useState<Item[]>(() => original);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [addName, setAddName] = useState("");
  const [addGrams, setAddGrams] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [talkMsg, setTalkMsg] = useState("");
  const [talkBusy, setTalkBusy] = useState(false);
  const [talkError, setTalkError] = useState<string | null>(null);
  const [talkHint, setTalkHint] = useState<string | null>(null);

  const isLegacy = items.length > 0 && (items[0] as any)?.per_100g === undefined;
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
      const result = await lookupFood(name);
      const newItem: Item = {
        name,
        grams,
        confidence: "medium",
        is_plant: result.is_plant,
        per_100g: result.per_100g,
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

  async function talkFix() {
    const message = talkMsg.trim();
    if (!message) return;
    setTalkBusy(true);
    setTalkError(null);
    setTalkHint(null);
    try {
      const updated = await talkFixMeal(meal.id, message);
      setItems(updated);
      setTalkMsg("");
      setTalkHint("updated — review, then save");
    } catch (err: any) {
      setTalkError(err.message);
    } finally {
      setTalkBusy(false);
    }
  }

  async function save() {
    if (items.length === 0) {
      setError("at least one item required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await patchMealItems(meal.id, items);
      router.push("/");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!confirm("Delete this meal?")) return;
    setBusy(true);
    try {
      await deleteMeal(meal.id);
      router.push("/");
      router.refresh();
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  const dirty = JSON.stringify(items) !== JSON.stringify(original);
  const canSave = !busy && !addBusy && !talkBusy && items.length > 0 && dirty;

  const time = new Date(meal.created_at).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <main
      style={{
        minHeight: "100vh",
        maxWidth: 540,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        // Reserve safe-area at the bottom for the sticky save bar.
        paddingBottom: "calc(env(safe-area-inset-bottom) + 96px)",
      }}
    >
      <header
        style={{
          padding: "16px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          position: "sticky",
          top: 0,
          background: colors.bg,
          zIndex: 10,
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
        <div style={{ flex: 1, fontSize: 13, color: colors.textMuted, letterSpacing: 0.5 }}>
          {time.toUpperCase()}
        </div>
        <button
          onClick={onDelete}
          disabled={busy}
          style={{
            background: "transparent",
            color: colors.textFaint,
            fontSize: 12,
            padding: "6px 10px",
          }}
        >
          delete
        </button>
      </header>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        {meal.photo_filename && (
          <img
            src={`/api/photo/${meal.photo_filename}`}
            alt=""
            style={{
              width: "100%",
              maxHeight: "60vh",
              objectFit: "contain",
              borderRadius: radii.md,
              background: colors.surfaceMuted,
            }}
          />
        )}

        {meal.caption && (
          <div
            style={{
              fontSize: 13,
              color: colors.textMuted,
              fontStyle: "italic",
              padding: "0 4px",
              lineHeight: 1.5,
            }}
          >
            “{meal.caption}”
          </div>
        )}

        {meal.meal_vibe && (
          <div
            style={{
              display: "inline-block",
              alignSelf: "flex-start",
              fontSize: 11,
              fontWeight: 500,
              color: colors.accentLight,
              background: "rgba(132,204,22,0.10)",
              border: `1px solid rgba(132,204,22,0.20)`,
              padding: "3px 10px",
              borderRadius: 999,
              letterSpacing: 0.1,
            }}
          >
            {meal.meal_vibe}
          </div>
        )}

        {meal.notes && (
          <div
            style={{
              fontSize: 12,
              color: colors.textMuted,
              fontStyle: "italic",
              padding: "0 4px",
              lineHeight: 1.5,
            }}
          >
            {meal.notes}
          </div>
        )}

        {isLegacy ? (
          <div
            style={{
              padding: 16,
              background: colors.surface,
              border: `1px solid ${colors.border}`,
              borderRadius: radii.md,
              fontSize: 14,
              color: colors.textMuted,
              lineHeight: 1.5,
            }}
          >
            This meal predates per-item nutrition. Delete and re-log to edit.
          </div>
        ) : (
          <>
            <div
              style={{
                background: colors.surfaceAlt,
                border: `1px solid ${colors.border}`,
                borderRadius: radii.sm,
                padding: 10,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div style={{ fontSize: 11, color: colors.textSubtle, letterSpacing: 0.5 }}>
                QUICK FIX — TELL CLAUDE
              </div>
              <textarea
                value={talkMsg}
                onChange={(e) => setTalkMsg(e.target.value)}
                placeholder="e.g. it's all plant / smaller portion / add olive oil"
                maxLength={500}
                disabled={talkBusy || busy}
                onKeyDown={(e) => {
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
                  <span style={{ fontSize: 11, color: colors.accentBright }}>
                    {talkHint}
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
                <div
                  style={{
                    background: colors.surfaceAlt,
                    border: `1px dashed ${colors.borderDashed}`,
                    borderRadius: 8,
                    padding: 10,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
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
                    <button
                      onClick={() => {
                        setAdding(false);
                        setAddName("");
                        setAddGrams("");
                        setAddError(null);
                      }}
                      disabled={addBusy}
                      style={{
                        background: "transparent",
                        color: colors.textMuted,
                        padding: "12px 16px",
                        fontSize: 14,
                        border: `1px solid ${colors.borderStrong}`,
                        borderRadius: 8,
                      }}
                    >
                      cancel
                    </button>
                    <button
                      onClick={addItem}
                      disabled={addBusy}
                      style={{
                        background: addBusy ? "#3f3f46" : colors.accent,
                        color: "#fff",
                        padding: "12px 16px",
                        fontSize: 14,
                        fontWeight: 500,
                        borderRadius: 8,
                      }}
                    >
                      {addBusy ? "looking up…" : "add"}
                    </button>
                  </div>
                  {addError && <div style={{ fontSize: 11, color: "#fca5a5" }}>{addError}</div>}
                </div>
              ) : (
                <button
                  onClick={() => setAdding(true)}
                  disabled={busy}
                  style={{
                    background: "transparent",
                    color: colors.textMuted,
                    border: `1px dashed ${colors.borderDashed}`,
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
          </>
        )}

        {error && (
          <div
            style={{
              background: "#7f1d1d",
              padding: 12,
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}
      </div>

      {!isLegacy && (
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
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr",
              gap: 6,
              fontSize: 11,
              color: colors.textMuted,
            }}
          >
            <LiveStat label="kcal" value={Math.round(live.calories).toString()} />
            <LiveStat label="sat" value={`${live.sat_fat_g.toFixed(1)}g`} />
            <LiveStat label="fib" value={`${live.soluble_fiber_g.toFixed(1)}g`} />
            <LiveStat label="pro" value={`${live.protein_g.toFixed(0)}g`} />
            <LiveStat label="plant" value={`${live.plant_pct}%`} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => router.push("/")}
              disabled={busy}
              style={{
                background: "transparent",
                color: colors.textMuted,
                padding: "12px 16px",
                fontSize: 14,
                border: `1px solid ${colors.borderStrong}`,
                borderRadius: 8,
              }}
            >
              cancel
            </button>
            <button
              onClick={save}
              disabled={!canSave}
              style={{
                flex: 1,
                background: !canSave ? "#3f3f46" : colors.accent,
                color: "#fff",
                padding: "12px 16px",
                fontSize: 14,
                fontWeight: 500,
                borderRadius: 8,
              }}
            >
              {busy ? "saving…" : dirty ? "save" : "no changes"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function LiveStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 9,
          color: colors.textFaint,
          letterSpacing: 0.5,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 14, color: colors.text, fontWeight: 500 }}>{value}</div>
    </div>
  );
}
