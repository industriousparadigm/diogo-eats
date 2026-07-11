"use client";

import { useEffect, useState } from "react";
import { colors } from "@/lib/styles";

// Lightweight Whoop-style chip under the date header, for whichever day is in
// view. Strain (0-21, derived from intensity load + body-battery drain) and
// recovery (Garmin sleep score). Tap to expand the components. Renders nothing
// on days with no Garmin data. Data comes from garmin_daily (read-only here);
// a residential-IP pull keeps it fresh.
type Day = {
  strain: number | null;
  recovery: number | null;
  resting_hr: number | null;
  sleep_hours: number | null;
  sleep_score: number | null;
  intensity_moderate_min: number | null;
  intensity_vigorous_min: number | null;
  body_battery_drained: number | null;
  body_battery_high: number | null;
  body_battery_low: number | null;
};

export function GarminHomeChip({ date }: { date: string }) {
  const [row, setRow] = useState<Day | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    setRow(null);
    (async () => {
      try {
        const r = await fetch(`/api/garmin/status?date=${date}`);
        if (!alive || !r.ok) return;
        const j = (await r.json()) as { today: Day | null };
        if (alive) setRow(j.today);
      } catch {
        // silent — chip just stays hidden
      }
    })();
    return () => {
      alive = false;
    };
  }, [date]);

  if (!row) return null;
  const { strain, recovery } = row;
  if (strain == null && recovery == null) return null;

  // Recovery tint from sleep score: red <34, amber 34-66, green >66.
  const recColor =
    recovery == null
      ? colors.textFaint
      : recovery < 34
        ? colors.bad
        : recovery < 67
          ? colors.warn
          : colors.accentBright;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="garmin day summary"
        aria-expanded={open}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          background: "rgba(70,130,180,0.07)",
          border: `1px solid ${colors.border}`,
          borderRadius: 999,
          padding: "4px 12px",
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: 0.5,
          color: colors.textMuted,
          cursor: "pointer",
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        }}
      >
        {strain != null && (
          <span>
            STRAIN <span style={{ color: colors.text }}>{strain.toFixed(1)}</span>
          </span>
        )}
        {strain != null && recovery != null && <span style={{ color: colors.textFaint }}>·</span>}
        {recovery != null && (
          <span>
            RECOVERY <span style={{ color: recColor }}>{recovery}%</span>
          </span>
        )}
        <span style={{ color: colors.textFaint, fontSize: 8 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "10px 20px",
            background: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: 12,
            padding: "12px 16px",
            minWidth: 240,
          }}
        >
          <Stat
            label="Sleep"
            value={row.sleep_hours != null ? `${row.sleep_hours.toFixed(1)}h` : "—"}
            sub={row.sleep_score != null ? `score ${row.sleep_score}` : undefined}
          />
          <Stat label="Resting HR" value={row.resting_hr != null ? `${row.resting_hr}` : "—"} sub="bpm" />
          <Stat
            label="Intensity"
            value={`${(row.intensity_moderate_min ?? 0) + (row.intensity_vigorous_min ?? 0)}m`}
            sub={`${row.intensity_vigorous_min ?? 0} vigorous`}
          />
          <Stat
            label="Body battery"
            value={
              row.body_battery_low != null && row.body_battery_high != null
                ? `${row.body_battery_low}→${row.body_battery_high}`
                : "—"
            }
            sub={row.body_battery_drained != null ? `drained ${row.body_battery_drained}` : undefined}
          />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
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
      <div style={{ fontSize: 17, color: colors.text, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 9, color: colors.textFaint }}>{sub}</div>}
    </div>
  );
}
