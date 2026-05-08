"use client";

import { useState } from "react";
import { colors, inputStyle } from "@/lib/styles";
import { DEFAULT_TARGETS, Targets, resetTargets, saveTargets, useTargets } from "@/lib/targets";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";

// Targets are honest defaults, not goals to be hit each day. The user can
// dial them to whatever feels livable — for someone aiming for sustained
// LDL drop the lifestyle-first 13g sat fat target is textbook but harsh in
// practice; 18-22g is more humane for a non-strict-vegan plan.
export function SettingsSheet({ onClose }: { onClose: () => void }) {
  useBodyScrollLock(true);
  const current = useTargets();
  const [draft, setDraft] = useState<Targets>(current);

  function patch(field: keyof Targets, value: string) {
    const n = parseFloat(value);
    setDraft((d) => ({ ...d, [field]: isFinite(n) && n > 0 ? n : 0 }));
  }

  function save() {
    saveTargets(draft);
    onClose();
  }

  function resetAll() {
    resetTargets();
    setDraft(DEFAULT_TARGETS);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
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
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: colors.bg,
          width: "100%",
          maxWidth: 540,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          padding: 16,
          paddingBottom: "max(16px, env(safe-area-inset-bottom))",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          maxHeight: "92vh",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h2
            style={{
              margin: 0,
              fontSize: 13,
              color: colors.textMuted,
              letterSpacing: 1,
              fontWeight: 500,
            }}
          >
            DAILY TARGETS
          </h2>
          <button
            onClick={resetAll}
            style={{ fontSize: 11, color: colors.textFaint, padding: "4px 8px" }}
          >
            reset to defaults
          </button>
        </div>

        <p
          style={{
            margin: 0,
            fontSize: 12,
            color: colors.textFaint,
            lineHeight: 1.5,
          }}
        >
          These are reference numbers, not gates. The pulse and trend line scale
          to them; nothing red-alerts when you're over.
        </p>

        <Field
          label="Saturated fat"
          unit="g"
          value={draft.sat_fat_g}
          onChange={(v) => patch("sat_fat_g", v)}
          hint="Textbook lifestyle-first cap is 13g. 18-22g is a more livable target if you eat fish or moderate dairy."
        />
        <Field
          label="Soluble fiber"
          unit="g"
          value={draft.soluble_fiber_g}
          onChange={(v) => patch("soluble_fiber_g", v)}
          hint="10g+ supports LDL reduction. Oats, beans, psyllium, fruit."
        />
        <Field
          label="Calories"
          unit="kcal"
          value={draft.calories}
          onChange={(v) => patch("calories", v)}
          hint="Loose anchor only — Eats isn't a calorie counter."
        />
        <Field
          label="Protein"
          unit="g"
          value={draft.protein_g}
          onChange={(v) => patch("protein_g", v)}
          hint="~1.2g/kg bodyweight is a fair default once strength training starts."
        />

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button
            onClick={onClose}
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
            style={{
              flex: 1,
              background: colors.accent,
              color: "#fff",
              padding: "12px 16px",
              fontSize: 14,
              fontWeight: 500,
              borderRadius: 8,
            }}
          >
            save
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  unit,
  value,
  onChange,
  hint,
}: {
  label: string;
  unit: string;
  value: number;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 12, color: colors.textSubtle, letterSpacing: 0.4 }}>
        {label.toUpperCase()}
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...inputStyle, flex: 1 }}
          min={0}
        />
        <span style={{ fontSize: 13, color: colors.textFaint, width: 36 }}>{unit}</span>
      </div>
      {hint && (
        <div style={{ fontSize: 11, color: colors.textFaint, lineHeight: 1.4 }}>{hint}</div>
      )}
    </div>
  );
}
