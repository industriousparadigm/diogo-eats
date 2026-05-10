"use client";

import { colors, radii } from "@/lib/styles";
import type { CSSProperties } from "react";

// Shared skeleton primitive. The visible shimmer comes from `.skeleton` in
// globals.css — this is just the sized box. Border-radius defaults to a
// regular corner; pass radius="pill" for inline text-line shapes.
//
// Skeletons used here should always match the SHAPE of what's coming so
// the swap doesn't shove content around. Same heights, same gaps.
export function Block({
  width,
  height,
  radius = 8,
  style,
}: {
  width?: number | string;
  height: number | string;
  radius?: number | "pill";
  style?: CSSProperties;
}) {
  return (
    <div
      className="skeleton"
      aria-hidden
      style={{
        width: width ?? "100%",
        height,
        borderRadius: radius === "pill" ? 999 : radius,
        ...style,
      }}
    />
  );
}

// Mirrors the DailyHeadline + Pulse stack — same heights and gaps, so the
// real content can swap in without layout shift.
export function HomeSkeleton() {
  return (
    <div aria-label="loading today" role="status">
      {/* Headline card: ~22px lead line + small label below, total ~94px. */}
      <div
        style={{
          padding: "18px 18px",
          marginBottom: 12,
          background: colors.surfaceAlt,
          border: `1px solid ${colors.border}`,
          borderRadius: radii.lg,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <Block height={22} width="62%" radius="pill" />
        <Block height={10} width="34%" radius="pill" />
      </div>

      {/* Pulse grid: 2 cols, 2 rows + a full-width row. Heights mirror the
          label + value + bar combo. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
          background: colors.surface,
          padding: 18,
          borderRadius: radii.lg,
        }}
      >
        <PulseStat />
        <PulseStat />
        <PulseStat />
        <PulseStat />
        <div style={{ gridColumn: "span 2" }}>
          <PulseStat />
        </div>
      </div>

      {/* TODAY divider + first meal card placeholder, only here so the
          page doesn't visibly jump when meals start rendering below. */}
      <section style={{ marginTop: 28 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 14,
          }}
        >
          <Block width={56} height={11} radius="pill" />
          <span style={{ flex: 1, height: 1, background: colors.border }} />
        </div>
        <Block height={92} radius={radii.md} />
      </section>
    </div>
  );
}

function PulseStat() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Block width={50} height={9} radius="pill" />
      <Block width={70} height={22} radius="pill" />
      <div style={{ marginTop: 4 }}>
        <Block height={3} radius="pill" />
      </div>
    </div>
  );
}

// Mirrors the History section: heading row, calendar grid (~140), trends.
export function HistorySkeleton() {
  return (
    <section
      aria-label="loading history"
      role="status"
      style={{ display: "flex", flexDirection: "column", gap: 14 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Block width={92} height={11} radius="pill" />
        <span style={{ flex: 1, height: 1, background: colors.border }} />
        <Block width={70} height={10} radius="pill" />
      </div>

      {/* Headline ribbon */}
      <Block height={48} radius={radii.md} />

      {/* Calendar grid — match heatmap density (12 cols × 7 rows ≈ 22px cells). */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(12, 22px)",
          gridAutoRows: "22px",
          gap: 4,
          justifyContent: "center",
          padding: "8px 0",
        }}
      >
        {Array.from({ length: 84 }).map((_, i) => (
          <Block key={i} height={22} radius={4} />
        ))}
      </div>

      {/* Two trend bands */}
      <Block height={110} radius={radii.md} />
      <Block height={110} radius={radii.md} />
    </section>
  );
}
