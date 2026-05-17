"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { colors, inputStyle } from "@/lib/styles";
import { DEFAULT_TARGETS, Targets, resetTargets, saveTargets, useTargets } from "@/lib/targets";
import { WhoopIntegrationCard } from "@/app/components/WhoopIntegrationCard";

// Settings as its own page — replaces the modal sheet that obscured
// the underlying screen. Same shape as the old sheet, just framed in
// a full-page header + sticky save bar.
export default function SettingsPage() {
  const router = useRouter();
  const current = useTargets();
  const [draft, setDraft] = useState<Targets>(current);

  function patch(field: keyof Targets, value: string) {
    const n = parseFloat(value);
    setDraft((d) => ({ ...d, [field]: isFinite(n) && n > 0 ? n : 0 }));
  }

  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await saveTargets(draft);
      router.back();
    } finally {
      setSaving(false);
    }
  }

  async function resetAll() {
    await resetTargets();
    setDraft(DEFAULT_TARGETS);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        maxWidth: 540,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
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
          onClick={() => router.back()}
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
        <div
          style={{
            flex: 1,
            fontSize: 13,
            color: colors.textMuted,
            letterSpacing: 0.5,
            textAlign: "center",
          }}
        >
          SETTINGS · DAILY TARGETS
        </div>
        <button
          onClick={resetAll}
          style={{
            fontSize: 11,
            color: colors.textFaint,
            padding: "6px 10px",
            background: "transparent",
            border: `1px solid ${colors.border}`,
            borderRadius: 999,
            cursor: "pointer",
          }}
        >
          reset
        </button>
      </header>

      <div
        style={{
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: colors.textMuted,
            lineHeight: 1.5,
          }}
        >
          Reference numbers, not gates. The pulse and trend lines scale to
          them; nothing red-alerts when you're over.
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

        <div
          style={{
            marginTop: 16,
            fontSize: 11,
            color: colors.textSubtle,
            letterSpacing: 0.5,
          }}
        >
          INTEGRATIONS
        </div>
        <WhoopIntegrationCard />
      </div>

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
          gap: 8,
          zIndex: 10,
        }}
      >
        <button
          onClick={() => router.back()}
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
          disabled={saving}
          style={{
            flex: 1,
            background: saving ? "#3f3f46" : colors.accent,
            color: "#fff",
            padding: "12px 16px",
            fontSize: 14,
            fontWeight: 500,
            borderRadius: 8,
            border: "none",
            cursor: saving ? "default" : "pointer",
          }}
        >
          {saving ? "saving…" : "save"}
        </button>
      </div>
    </main>
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
