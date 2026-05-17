"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AutoGrowTextarea } from "../components/AutoGrowTextarea";
import { colors, inputStyle } from "@/lib/styles";

// New-user onboarding form. Collects optional demographic basics and
// free-form notes, then asks Claude to compute starter targets. After
// success middleware stops sending them here.
export default function OnboardingPage() {
  const router = useRouter();
  const [sex, setSex] = useState<"M" | "F" | "X" | "">("");
  const [age, setAge] = useState<string>("");
  const [weight, setWeight] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rationale, setRationale] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const body = {
        sex: sex || null,
        age: age ? parseInt(age, 10) : null,
        weight_kg: weight ? parseFloat(weight) : null,
        notes: notes.trim() || null,
      };
      const r = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error ?? "couldn't finish onboarding");
        return;
      }
      setRationale(j.rationale ?? null);
      // Short pause so the user sees the rationale, then home.
      setTimeout(() => router.push("/"), 1800);
    } catch (err: any) {
      setError(err?.message ?? "network error");
    } finally {
      setBusy(false);
    }
  }

  if (rationale) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          maxWidth: 540,
          margin: "0 auto",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: 36,
              color: colors.accentBright,
              marginBottom: 16,
            }}
          >
            ✓
          </div>
          <div
            style={{
              fontSize: 14,
              color: colors.text,
              lineHeight: 1.5,
              maxWidth: 320,
            }}
          >
            {rationale}
          </div>
          <div
            style={{
              fontSize: 11,
              color: colors.textFaint,
              marginTop: 12,
            }}
          >
            you can change any of this in Settings →
          </div>
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        maxWidth: 540,
        margin: "0 auto",
        padding: "24px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      <div>
        <h1
          style={{
            fontSize: 16,
            letterSpacing: 3,
            margin: 0,
            marginBottom: 8,
            color: colors.text,
          }}
        >
          WELCOME TO EATS
        </h1>
        <p
          style={{
            fontSize: 13,
            color: colors.textMuted,
            margin: 0,
            lineHeight: 1.6,
          }}
        >
          A couple of basics so I can set sensible starter targets.
          Anything you skip → I'll guess conservatively. You can change
          all of this in Settings later.
        </p>
      </div>

      <Field label="Sex">
        <div style={{ display: "flex", gap: 8 }}>
          {(["M", "F", "X"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setSex((s) => (s === opt ? "" : opt))}
              style={{
                flex: 1,
                background: sex === opt ? colors.accent : "transparent",
                color: sex === opt ? "#fff" : colors.textMuted,
                border: `1px solid ${
                  sex === opt ? colors.accent : colors.borderStrong
                }`,
                borderRadius: 8,
                padding: "10px 12px",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {opt === "M" ? "Male" : opt === "F" ? "Female" : "Skip"}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Age" unit="years">
        <input
          type="number"
          inputMode="numeric"
          value={age}
          onChange={(e) => setAge(e.target.value)}
          placeholder="e.g. 33"
          style={{ ...inputStyle, flex: 1 }}
          min={1}
          max={120}
        />
      </Field>

      <Field label="Weight" unit="kg">
        <input
          type="number"
          inputMode="decimal"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder="e.g. 70"
          style={{ ...inputStyle, flex: 1 }}
          min={20}
          max={400}
          step={0.1}
        />
      </Field>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label
          style={{
            fontSize: 11,
            color: colors.textSubtle,
            letterSpacing: 0.5,
          }}
        >
          ANYTHING ELSE WORTH KNOWING?
        </label>
        <AutoGrowTextarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. high LDL — trying to lower. vegan-leaning. occasional fish. no strength training yet."
          minRows={3}
          maxLength={1000}
        />
        <div style={{ fontSize: 11, color: colors.textFaint, lineHeight: 1.4 }}>
          Conditions, goals, dietary preferences. The more specific, the
          better the starter targets.
        </div>
      </div>

      {error && (
        <div
          style={{
            background: "#7f1d1d",
            padding: 10,
            borderRadius: 8,
            fontSize: 13,
            color: "#fee2e2",
          }}
        >
          {error}
        </div>
      )}

      <button
        onClick={submit}
        disabled={busy}
        style={{
          background: busy ? "#3f3f46" : colors.accent,
          color: "#fff",
          padding: "14px 16px",
          fontSize: 14,
          fontWeight: 500,
          borderRadius: 8,
          border: "none",
          marginTop: 8,
          cursor: busy ? "default" : "pointer",
        }}
      >
        {busy ? "computing your starter targets…" : "set me up"}
      </button>

      <p
        style={{
          fontSize: 11,
          color: colors.textFaint,
          textAlign: "center",
          margin: 0,
          marginTop: 4,
        }}
      >
        You can skip everything and the app will use safe defaults.
      </p>
    </main>
  );
}

function Field({
  label,
  unit,
  children,
}: {
  label: string;
  unit?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label
        style={{
          fontSize: 11,
          color: colors.textSubtle,
          letterSpacing: 0.5,
        }}
      >
        {label.toUpperCase()}
        {unit && <span style={{ color: colors.textFaint }}> · {unit}</span>}
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {children}
      </div>
    </div>
  );
}
