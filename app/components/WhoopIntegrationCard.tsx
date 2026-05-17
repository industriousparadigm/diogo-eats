"use client";

import { useEffect, useState } from "react";
import { colors } from "@/lib/styles";

// Settings → Integrations → Whoop card. Renders three states:
//   - loading: spinner-ish
//   - disconnected: "Connect Whoop" CTA
//   - connected: status row + Refresh now + Disconnect
type Status = {
  connected: boolean;
  last_sync_at?: number | null;
  last_sync_status?: string | null;
  today?: {
    strain: number | null;
    recovery_pct: number | null;
    hrv_ms: number | null;
    rhr_bpm: number | null;
    kcal: number | null;
  } | null;
  today_workouts?: { id: string; sport_name: string | null; strain: number | null; kcal: number | null }[];
};

export function WhoopIntegrationCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const r = await fetch("/api/whoop/status");
    if (r.ok) {
      const j = (await r.json()) as Status;
      setStatus(j);
    } else {
      setStatus({ connected: false });
    }
  }

  useEffect(() => {
    load();
    // Surface URL-flagged messages from the callback redirect.
    const q = new URLSearchParams(window.location.search).get("whoop");
    if (q === "connected") setMsg("Connected — syncing your data…");
    else if (q === "denied") setMsg("You declined the Whoop permission. Try again any time.");
    else if (q === "bad_state" || q === "user_mismatch") setMsg("Connection state mismatch — try again.");
    else if (q === "error") setMsg("Something went wrong connecting to Whoop. Try again.");
    if (q) {
      // Strip the param so a refresh doesn't keep showing the message.
      const u = new URL(window.location.href);
      u.searchParams.delete("whoop");
      u.searchParams.delete("reason");
      window.history.replaceState({}, "", u.toString());
    }
  }, []);

  async function refresh() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/whoop/sync", { method: "POST" });
      const j = await r.json();
      if (r.ok) {
        setMsg(`Synced ${j.cycles_upserted} day(s), ${j.workouts_upserted} workout(s).`);
        await load();
      } else {
        setMsg(j.error ?? "sync failed");
      }
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!confirm("Disconnect Whoop? Your synced data stays cached locally until cleaned up.")) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/whoop/disconnect", { method: "POST" });
      if (r.ok) {
        setMsg("Disconnected.");
        await load();
      } else {
        const j = await r.json().catch(() => ({}));
        setMsg(j.error ?? "disconnect failed");
      }
    } finally {
      setBusy(false);
    }
  }

  if (status == null) {
    return (
      <Card>
        <div style={{ fontSize: 13, color: colors.textFaint }}>loading…</div>
      </Card>
    );
  }

  if (!status.connected) {
    return (
      <Card>
        <Header />
        <p style={{ fontSize: 13, color: colors.textMuted, lineHeight: 1.5, margin: 0 }}>
          Connect your Whoop to bring training context into Eats — strain,
          recovery, workouts. We sync once a day; nothing about food is
          analyzed against this yet, it just shows.
        </p>
        <a
          href="/api/whoop/connect"
          style={{
            display: "inline-block",
            background: colors.accent,
            color: "#fff",
            padding: "10px 14px",
            fontSize: 13,
            fontWeight: 500,
            borderRadius: 8,
            textDecoration: "none",
            marginTop: 4,
            alignSelf: "flex-start",
          }}
        >
          connect Whoop
        </a>
        {msg && <Hint>{msg}</Hint>}
      </Card>
    );
  }

  const lastSync = status.last_sync_at
    ? new Date(status.last_sync_at).toLocaleString(undefined, {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  return (
    <Card>
      <Header connected />
      {status.today && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 12,
            padding: "10px 0",
          }}
        >
          <Stat label="STRAIN" value={status.today.strain?.toFixed(1) ?? "—"} />
          <Stat label="RECOVERY" value={status.today.recovery_pct != null ? `${status.today.recovery_pct}%` : "—"} />
          <Stat label="kcal burn" value={status.today.kcal != null ? Math.round(status.today.kcal).toString() : "—"} />
        </div>
      )}
      {status.today_workouts && status.today_workouts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 10, color: colors.textSubtle, letterSpacing: 0.5 }}>TODAY'S WORKOUTS</div>
          {status.today_workouts.map((w) => (
            <div key={w.id} style={{ fontSize: 12, color: colors.textMuted }}>
              {w.sport_name ?? "workout"} · strain {w.strain?.toFixed(1) ?? "—"}
              {w.kcal != null ? ` · ${Math.round(w.kcal)} kcal` : ""}
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: 11, color: colors.textFaint, marginTop: 8 }}>
        last sync · {lastSync}
        {status.last_sync_status && status.last_sync_status !== "ok" && (
          <span style={{ color: colors.bad, marginLeft: 6 }}>
            (sync {status.last_sync_status})
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button
          onClick={refresh}
          disabled={busy}
          style={{
            background: "transparent",
            color: colors.textMuted,
            border: `1px solid ${colors.borderStrong}`,
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 12,
            cursor: busy ? "default" : "pointer",
          }}
        >
          {busy ? "syncing…" : "refresh now"}
        </button>
        <button
          onClick={disconnect}
          disabled={busy}
          style={{
            background: "transparent",
            color: colors.textFaint,
            border: "none",
            padding: "8px 8px",
            fontSize: 12,
            cursor: busy ? "default" : "pointer",
          }}
        >
          disconnect
        </button>
      </div>
      {msg && <Hint>{msg}</Hint>}
    </Card>
  );
}

function Header({ connected }: { connected?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ fontSize: 12, color: colors.textSubtle, letterSpacing: 0.5 }}>
        WHOOP
      </div>
      {connected && (
        <span
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: colors.accentBright,
          }}
        />
      )}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: colors.surfaceAlt,
        border: `1px solid ${colors.border}`,
        borderRadius: 12,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
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
      <div style={{ fontSize: 18, color: colors.text, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, color: colors.accentBright, marginTop: 4 }}>{children}</div>
  );
}
