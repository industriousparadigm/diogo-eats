"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { colors } from "@/lib/styles";

// Small chip near the date in the home header. Hidden when not
// connected (no nag). When connected, shows today's strain + recovery
// with a tap → /settings (deeper info lives there for now).
type Today = {
  connected: boolean;
  last_sync_at?: number | null;
  today?: {
    strain: number | null;
    recovery_pct: number | null;
  } | null;
};

// Trigger an auto-sync if cached data is older than this. The /sync
// route enforces its own 1-min floor, so this is just the staleness
// threshold for UX freshness — not a hard guarantee.
const STALE_AFTER_MS = 15 * 60 * 1000;

export function WhoopHomeChip() {
  const [data, setData] = useState<Today | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await fetch("/api/whoop/status");
      if (!alive) return;
      if (!r.ok) {
        setData({ connected: false });
        return;
      }
      const initial = (await r.json()) as Today;
      setData(initial);

      if (!initial.connected) return;
      const last = initial.last_sync_at ?? 0;
      if (Date.now() - last > STALE_AFTER_MS) {
        // Background sync; refresh status when it returns. Failures
        // are silent — the chip just shows the last-known data.
        try {
          await fetch("/api/whoop/sync", { method: "POST" });
          const r2 = await fetch("/api/whoop/status");
          if (alive && r2.ok) setData(await r2.json());
        } catch {
          // ignore
        }
      }
    })();
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
