"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { colors } from "@/lib/styles";

// Small chip near the date in the home header. Hidden when not
// connected (no nag). When connected, shows today's strain + recovery
// with a tap → /settings (deeper info lives there for now).
type Today = {
  connected: boolean;
  today?: {
    strain: number | null;
    recovery_pct: number | null;
  } | null;
};

export function WhoopHomeChip() {
  const [data, setData] = useState<Today | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/whoop/status")
      .then((r) => (r.ok ? r.json() : { connected: false }))
      .then((j) => {
        if (alive) setData(j);
      })
      .catch(() => alive && setData({ connected: false }));
    return () => {
      alive = false;
    };
  }, []);

  if (!data?.connected || !data.today) return null;

  const strain = data.today.strain;
  const recovery = data.today.recovery_pct;
  if (strain == null && recovery == null) return null;

  // Recovery tint: red <34, amber 34-66, green >66 (matches Whoop's
  // own color language, kept restrained to fit our palette).
  const recColor =
    recovery == null
      ? colors.textFaint
      : recovery < 34
        ? colors.bad
        : recovery < 67
          ? colors.warn
          : colors.accentBright;

  return (
    <Link
      href="/settings"
      aria-label="whoop today"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        background: "rgba(132,204,22,0.06)",
        border: `1px solid ${colors.border}`,
        borderRadius: 999,
        padding: "4px 10px",
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: 0.5,
        color: colors.textMuted,
        textDecoration: "none",
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
      }}
    >
      {strain != null && (
        <span>STRAIN <span style={{ color: colors.text }}>{strain.toFixed(1)}</span></span>
      )}
      {strain != null && recovery != null && (
        <span style={{ color: colors.textFaint }}>·</span>
      )}
      {recovery != null && (
        <span>
          RECOVERY <span style={{ color: recColor }}>{recovery}%</span>
        </span>
      )}
    </Link>
  );
}
