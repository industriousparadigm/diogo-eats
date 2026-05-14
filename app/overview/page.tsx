"use client";

import { useEffect, useMemo, useState } from "react";
import type React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { colors } from "@/lib/styles";
import { fetchStats } from "@/lib/api";
import { useTargets } from "@/lib/targets";
import { flagsForDay, isPositiveFlag, windowAverages, summarySentence, type Flag } from "@/lib/overview";
import type { DayAggregate } from "@/lib/types";
import { CalendarHeatmap } from "../components/CalendarHeatmap";
import { MetricTrend } from "../components/MetricTrend";
import { OverviewHero } from "../components/OverviewHero";
import { Streaks } from "../components/Streaks";
import { WindowToggle } from "../components/WindowToggle";
import { HistorySkeleton } from "../components/Skeleton";

// Dedicated overview surface. Always-on companion to the daily home —
// answers "how am I actually doing?" over a window the user picks
// (7 / 30 / 90 days). No calendar-event awareness — purely log-derived.
export default function OverviewPage() {
  const router = useRouter();
  const targets = useTargets();
  const [windowDays, setWindowDays] = useState(30);
  // Aggregates are always fetched at the max window so the toggle
  // doesn't re-fetch on every click — we just slice locally.
  const [allAggs, setAllAggs] = useState<DayAggregate[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetchStats(90)
      .then((data) => {
        if (alive) setAllAggs(data);
      })
      .catch(() => {
        if (alive) setAllAggs([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const visible = useMemo(
    () => (allAggs ? allAggs.slice(-windowDays) : []),
    [allAggs, windowDays]
  );
  const averages = useMemo(() => windowAverages(visible), [visible]);
  const flagsByDate = useMemo(() => {
    const m = new Map<string, Flag[]>();
    for (const a of visible) {
      const f = flagsForDay(a, targets);
      if (f.length > 0) m.set(a.date, f);
    }
    return m;
  }, [visible, targets]);
  const sentence = useMemo(
    () => summarySentence(averages, targets),
    [averages, targets]
  );
  const flagStats = useMemo(() => {
    let positive = 0;
    let negative = 0;
    for (const flags of flagsByDate.values()) {
      if (flags.some((f) => !isPositiveFlag(f))) negative += 1;
      else if (flags.some((f) => isPositiveFlag(f))) positive += 1;
    }
    return { positive, negative };
  }, [flagsByDate]);

  return (
    <main style={{ padding: "20px 16px 60px", maxWidth: 540, margin: "0 auto" }}>
      <header
        style={{
          marginBottom: 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <button
          onClick={() => router.back()}
          aria-label="back"
          style={backBtn}
        >
          ‹
        </button>
        <h1
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: "#71717a",
            letterSpacing: 1,
            textAlign: "center",
            flex: 1,
            margin: 0,
          }}
        >
          EATS · OVERVIEW
        </h1>
        <div style={{ width: 36 }} />
      </header>

      {allAggs === null ? (
        <HistorySkeleton />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <WindowToggle value={windowDays} onChange={setWindowDays} />
          </div>

          <OverviewHero
            sentence={sentence}
            averages={averages}
            targets={targets}
            windowDays={windowDays}
          />

          {averages.logged_days >= 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <MetricTrend
                aggregates={visible}
                title="PLANT SHARE"
                accessor={(a) => a.plant_pct}
                target={undefined}
                direction="above_good"
                format={(v) => `${Math.round(v)}%`}
              />
              <MetricTrend
                aggregates={visible}
                title="SOLUBLE FIBER"
                accessor={(a) => a.soluble_fiber_g}
                target={targets.soluble_fiber_g}
                direction="above_good"
                format={(v) => `${v.toFixed(1)}g`}
              />
              <MetricTrend
                aggregates={visible}
                title="SAT FAT"
                accessor={(a) => a.sat_fat_g}
                target={targets.sat_fat_g}
                direction="below_good"
                format={(v) => `${v.toFixed(1)}g`}
              />
              <MetricTrend
                aggregates={visible}
                title="CALORIES"
                accessor={(a) => a.calories}
                target={targets.calories}
                direction="below_good"
                format={(v) => `${Math.round(v)}`}
              />
            </div>
          )}

          <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={sectionHeader}>
              <span>DAY-LEVEL FLAGS</span>
              <span style={{ flex: 1, height: 1, background: colors.border }} />
              <span style={{ color: colors.textFaint, letterSpacing: 0.5 }}>
                {flagStats.positive} good · {flagStats.negative} watch
              </span>
            </div>
            <CalendarHeatmap
              aggregates={visible}
              flagsByDate={flagsByDate}
              windowDays={windowDays}
              onPickDate={(ymd) => router.push(`/?date=${ymd}`)}
            />
            <div style={legend}>
              <span style={{ ...dot, background: colors.accentBright }} />
              <span style={legendText}>plant-led / fiber on target / low sat fat</span>
              <span style={{ ...dot, background: colors.warn, marginLeft: 12 }} />
              <span style={legendText}>sat fat well over target</span>
            </div>
          </section>

          {averages.logged_days >= 2 && (
            <Streaks aggregates={visible} targets={targets} />
          )}

          <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
            <Link href="/" style={homeLink}>
              ← back to today
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}

const backBtn: React.CSSProperties = {
  background: "transparent",
  color: "#71717a",
  fontSize: 22,
  width: 36,
  height: 36,
  border: "none",
  borderRadius: 6,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
};

const sectionHeader: React.CSSProperties = {
  fontSize: 11,
  color: colors.textSubtle,
  letterSpacing: 1.2,
  fontWeight: 500,
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const legend: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 11,
  color: colors.textFaint,
  marginTop: 4,
  flexWrap: "wrap",
};

const dot: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: "50%",
  display: "inline-block",
};

const legendText: React.CSSProperties = {
  letterSpacing: 0.2,
};

const homeLink: React.CSSProperties = {
  fontSize: 13,
  color: colors.textMuted,
  letterSpacing: 0.5,
  textDecoration: "none",
  padding: "8px 12px",
};
