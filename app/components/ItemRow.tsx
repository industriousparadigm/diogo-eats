"use client";

import { colors } from "@/lib/styles";
import type { Item } from "@/lib/types";
import { AutoGrowTextarea } from "./AutoGrowTextarea";

// One item row inside the meal-edit screen. Rendered as a card with two
// rows: name + remove on top, grams + per-item nutrient summary below.
//
// Confidence dot on the left signals when Vision was guessing — a soft
// nudge to verify low/medium portions without alarming about them.
export function ItemRow({
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
        background: colors.surfaceAlt,
        border: `1px solid ${colors.borderStrong}`,
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
        <AutoGrowTextarea
          value={item.name}
          onChange={(e) => onName(e.target.value)}
          disabled={disabled}
          style={{
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
            color: colors.textSubtle,
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
            background: colors.surfaceMuted,
            color: colors.text,
            border: `1px solid ${colors.borderStrong}`,
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 14,
            width: 90,
            outline: "none",
          }}
        />
        <span style={{ fontSize: 12, color: colors.textSubtle }}>g</span>
        <span style={{ fontSize: 11, color: colors.textFaint, marginLeft: "auto" }}>
          {Math.round((item.grams * item.per_100g.calories) / 100)} kcal ·{" "}
          {((item.grams * item.per_100g.sat_fat_g) / 100).toFixed(1)}g sat
        </span>
      </div>
    </div>
  );
}
