"use client";

import type { Item, Meal } from "@/lib/types";
import { isBackfillCreatedAt } from "@/lib/dayReport";

function safeParseItems(raw: string): Item[] {
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr;
  } catch {
    return [];
  }
}

// One row in today's meal list. Tappable card → navigates to the
// edit route. Stops the tap from firing when the user hits the X
// (delete) button via `[data-stop-card-click]`.
//
// "Legacy" meals (logged before per-item nutrition shipped) render
// read-only — the edit page can't make sense of them anyway.
export function MealCard({
  meal,
  onDelete,
  onEdit,
}: {
  meal: Meal;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const items = safeParseItems(meal.items_json);
  const isBackfill = isBackfillCreatedAt(meal.created_at);
  const time = isBackfill
    ? "added later"
    : new Date(meal.created_at).toLocaleTimeString(undefined, {
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
