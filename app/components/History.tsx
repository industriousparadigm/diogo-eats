"use client";

import { useEffect, useState } from "react";
import { colors } from "@/lib/styles";
import type { DayAggregate } from "@/lib/types";
import { CalendarHeatmap } from "./CalendarHeatmap";
import { RollingHeadline } from "./RollingHeadline";
import { SatFatTrend } from "./SatFatTrend";
import { FiberTrend } from "./FiberTrend";
import { RetestAnchor } from "./RetestAnchor";

// The "looking back" surface. Fetches its own aggregates so the home page
// doesn't have to thread state through. Re-fetches when `version` changes
// (parent bumps it after meal save/delete) so the calendar stays current
// without manual reload.
export function History({
  version,
  selectedDate,
  onPickDate,
}: {
  version: number;
  selectedDate?: string;
  onPickDate: (ymd: string) => void;
}) {
  const [aggs, setAggs] = useState<DayAggregate[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/stats?days=84")
      .then((r) => r.json())
      .then((j) => {
        if (alive) setAggs(j.aggregates ?? []);
      })
      .catch(() => {
        if (alive) setAggs([]);
      });
    return () => {
      alive = false;
    };
  }, [version]);

  if (aggs === null) {
    return <Skeleton />;
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

function Skeleton() {
  return (
    <div
      aria-hidden
      style={{
        height: 280,
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: 14,
        opacity: 0.5,
      }}
    />
  );
}
