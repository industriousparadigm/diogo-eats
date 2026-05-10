"use client";

import { useEffect, useState } from "react";
import { colors } from "@/lib/styles";
import type { DayAggregate } from "@/lib/types";
import { fetchStats } from "@/lib/api";
import { CalendarHeatmap } from "./CalendarHeatmap";
import { RollingHeadline } from "./RollingHeadline";
import { SatFatTrend } from "./SatFatTrend";
import { FiberTrend } from "./FiberTrend";
import { RetestAnchor } from "./RetestAnchor";
import { HistorySkeleton } from "./Skeleton";

// The "looking back" surface. Fetches its own aggregates so the home page
// doesn't have to thread state through. Re-fetches when `version` changes
// (parent bumps it after meal save/delete) so the calendar stays current
// without manual reload.
export function History({
  version,
  selectedDate,
  onPickDate,
  onOpenSettings,
}: {
  version: number;
  selectedDate?: string;
  onPickDate: (ymd: string) => void;
  onOpenSettings?: () => void;
}) {
  const [aggs, setAggs] = useState<DayAggregate[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetchStats(84)
      .then((data) => {
        if (alive) setAggs(data);
      })
      .catch(() => {
        if (alive) setAggs([]);
      });
    return () => {
      alive = false;
    };
  }, [version]);

  if (aggs === null) {
    return <HistorySkeleton />;
  }

  const totalLogged = aggs.filter((a) => a.meal_count > 0).length;

  return (
    <section
      aria-label="Looking back"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <h2
        style={{
          fontSize: 11,
          color: colors.textSubtle,
          letterSpacing: 1.2,
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          gap: 10,
          margin: 0,
        }}
      >
        <span>LOOKING BACK</span>
        <span style={{ flex: 1, height: 1, background: colors.border }} />
        <span style={{ color: colors.textFaint, letterSpacing: 0.5 }}>
          {totalLogged} day{totalLogged === 1 ? "" : "s"} logged
        </span>
      </h2>

      {totalLogged < 3 ? (
        <FirstDaysCopy logged={totalLogged} />
      ) : (
        <RollingHeadline aggregates={aggs} />
      )}

      <CalendarHeatmap
        aggregates={aggs}
        onPickDate={onPickDate}
        selectedDate={selectedDate}
      />

      {totalLogged >= 3 && (
        <>
          {/* Fiber first — it's the lever to KEEP UP. Sat fat second —
              the lever to keep down. Order reflects "what's helping"
              before "what to watch". */}
          <FiberTrend aggregates={aggs} />
          <SatFatTrend aggregates={aggs} />
        </>
      )}

      <RetestAnchor />

      {/* Settings used to live in the header but overlapped the next-day
          arrow on iPhone. Moved here — discoverable when scrolled, never
          in the way of primary actions. */}
      {onOpenSettings && (
        <button
          onClick={onOpenSettings}
          style={{
            background: "transparent",
            color: colors.textFaint,
            fontSize: 12,
            padding: "8px 12px",
            margin: "0 auto",
            display: "block",
            border: "none",
            cursor: "pointer",
            letterSpacing: 0.3,
            WebkitTapHighlightColor: "transparent",
          }}
        >
          settings
        </button>
      )}
    </section>
  );
}

function FirstDaysCopy({ logged }: { logged: number }) {
  return (
    <div
      style={{
        padding: "16px 18px",
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: 14,
        fontSize: 15,
        lineHeight: 1.45,
        color: colors.textMuted,
      }}
    >
      {logged === 0
        ? "Just getting started. Log a few meals and the shape of your week will start showing up here."
        : `${logged} day${logged === 1 ? "" : "s"} in. A few more and you'll start seeing patterns.`}
    </div>
  );
}

