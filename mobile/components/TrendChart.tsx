// 7-day rolling-average trend line — rebuilt as a readable instrument
// (wave-2 item 5). It is no longer a bare sparkline: it carries value
// gridlines with Y labels, X-axis date labels, a LABELED dashed target line,
// and touch scrubbing (drag along the line → a tooltip card shows that day +
// value at the finger). Targets are reference numbers, not gates: nothing
// red-alerts; sat fat over target is amber at most, never red.
//
// WINDOW-SCOPED (item 4): the chart plots the window the Overview screen
// passes in (1M / 3M) — it does NOT re-derive its own horizon. The line is
// still a 7-day rolling average (the smoothing label says "7d avg"); the
// range follows the selected window.
//
// CHART ANATOMY (see DESIGN.md):
//   - left gutter: 2-3 Y value gridlines + right-aligned g labels
//   - the dashed target line, labeled ("10g target") inside the plot
//   - the trend path (food accent)
//   - bottom gutter: 3 date ticks (start / mid / end)
//   - scrub: a vertical cursor + dot + a small tooltip card (day · value)

import { useMemo, useState } from "react";
import { Platform, View, Text, StyleSheet, type LayoutChangeEvent } from "react-native";
import Svg, { Line, Path, Circle, Text as SvgText } from "react-native-svg";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { palette, fontSize, spacing, condensedFamily } from "@/lib/theme";
import { Card } from "@/components/ui";
import { rollingAverage } from "@/lib/headline";
import {
  indexForX,
  xForIndex,
  yGridValues,
  xTickIndices,
  shortDateLabel,
  plotMax,
} from "@/lib/trendChart";
import { fmt } from "@/lib/format";
import type { DayAggregate } from "@/lib/types";

const IS_WEB = Platform.OS === "web";

// Plot geometry. The left gutter holds Y labels; the bottom gutter holds
// the date ticks. The plot is everything between.
const PLOT_H = 96;
const GUTTER_LEFT = 30;
const GUTTER_BOTTOM = 18;
const GUTTER_TOP = 6;

export function TrendChart({
  aggregates,
  title,
  target,
  pick,
  // "keep_up" (fiber): above target reads as the win.
  // "keep_down" (sat fat): above target reads as watch-it amber.
  direction,
}: {
  aggregates: DayAggregate[];
  title: string;
  target: number;
  pick: (a: DayAggregate) => number;
  direction: "keep_up" | "keep_down";
}) {
  // Plot the window verbatim (item 4) — the parent already scoped it.
  const window = aggregates;
  const points = useMemo(() => rollingAverage(window, pick), [window, pick]);

  // Measured plot width (the SVG is laid out at real px, not a stretched
  // viewBox, so scrub math maps touch px → day index honestly).
  const [width, setWidth] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null);

  const validVals = points.filter((v) => !isNaN(v));
  if (validVals.length < 2) return null;

  const max = plotMax(target, points);
  const plotW = Math.max(0, width - GUTTER_LEFT);
  const plotInnerH = PLOT_H - GUTTER_TOP - GUTTER_BOTTOM;

  const xAt = (i: number) => GUTTER_LEFT + xForIndex(i, points.length, plotW);
  const yAt = (v: number) => GUTTER_TOP + (plotInnerH - (v / max) * plotInnerH);

  // The line path, skipping NaN gaps cleanly (move-to on resume).
  const path = points.reduce((acc, v, i) => {
    if (isNaN(v)) return acc;
    const x = xAt(i).toFixed(2);
    const y = yAt(v).toFixed(2);
    if (i > 0 && isNaN(points[i - 1])) return acc + ` M${x},${y}`;
    return acc === "" ? `M${x},${y}` : `${acc} L${x},${y}`;
  }, "");

  const targetY = yAt(target);
  const gridValues = yGridValues(target, max);
  const tickIdx = xTickIndices(points.length);
  const latest = [...points].reverse().find((v) => !isNaN(v)) ?? 0;

  const accentLight = palette.food.accentBright;
  const latestColor =
    direction === "keep_up"
      ? latest >= target
        ? accentLight
        : palette.textMuted
      : latest > target
        ? palette.warn
        : accentLight;

  // The scrubbed point — nearest logged day to the finger. NaN (an unlogged
  // trailing window) yields no tooltip value, just the cursor.
  const scrubVal = scrub != null ? points[scrub] : null;
  const scrubDay = scrub != null ? window[scrub] : null;
  const scrubHasVal = scrubVal != null && !isNaN(scrubVal);

  function onTouch(localX: number) {
    if (plotW <= 0) return;
    const idx = indexForX(localX - GUTTER_LEFT, points.length, plotW);
    setScrub(idx);
  }

  // Native: a pan along the chart scrubs. Web: gesture-handler degrades, so
  // a tap inspects the nearest point (the brief's Platform-guarded fallback).
  const pan = Gesture.Pan()
    .onBegin((e) => onTouch(e.x))
    .onUpdate((e) => onTouch(e.x))
    .onFinalize(() => setScrub(null));

  const plot = (
    <View
      style={styles.plotWrap}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      {...(IS_WEB
        ? {
            // Web fallback: tap-to-inspect using the press location.
            onStartShouldSetResponder: () => true,
            onResponderRelease: (e: {
              nativeEvent: { locationX: number };
            }) => {
              onTouch(e.nativeEvent.locationX);
            },
          }
        : {})}
    >
      {width > 0 && (
        <Svg width={width} height={PLOT_H} accessibilityLabel={`${title} trend`}>
          {/* Y value gridlines + labels */}
          {gridValues.map((gv, i) => {
            const gy = yAt(gv);
            return (
              <Line
                key={`g${i}`}
                x1={GUTTER_LEFT}
                x2={width}
                y1={gy}
                y2={gy}
                stroke={palette.hairline}
                strokeWidth={1}
              />
            );
          })}

          {/* The labeled dashed target line */}
          <Line
            x1={GUTTER_LEFT}
            x2={width}
            y1={targetY}
            y2={targetY}
            stroke={palette.inkSoft}
            strokeWidth={1}
            strokeDasharray="3,3"
          />

          {/* The trend path */}
          <Path
            d={path}
            fill="none"
            stroke={accentLight}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Y axis labels (right-aligned in the left gutter) */}
          {gridValues.map((gv, i) => (
            <SvgText
              key={`gl${i}`}
              x={GUTTER_LEFT - 4}
              y={yAt(gv) + 3}
              fill={palette.textSubtle}
              fontSize={9}
              textAnchor="end"
            >
              {fmt(gv)}
            </SvgText>
          ))}

          {/* X axis date labels */}
          {tickIdx.map((ti, i) => {
            const day = window[ti];
            if (!day) return null;
            const anchor = i === 0 ? "start" : i === tickIdx.length - 1 ? "end" : "middle";
            return (
              <SvgText
                key={`x${i}`}
                x={xAt(ti)}
                y={PLOT_H - 5}
                fill={palette.textSubtle}
                fontSize={9}
                textAnchor={anchor}
              >
                {shortDateLabel(day.date)}
              </SvgText>
            );
          })}

          {/* Scrub cursor + dot */}
          {scrub != null && scrubHasVal && (
            <>
              <Line
                x1={xAt(scrub)}
                x2={xAt(scrub)}
                y1={GUTTER_TOP}
                y2={GUTTER_TOP + plotInnerH}
                stroke={palette.textSubtle}
                strokeWidth={1}
              />
              <Circle cx={xAt(scrub)} cy={yAt(scrubVal as number)} r={3.5} fill={accentLight} />
            </>
          )}
        </Svg>
      )}

      {/* Scrub tooltip card — day + value at the finger */}
      {scrub != null && scrubHasVal && scrubDay && (
        <View
          pointerEvents="none"
          style={[
            styles.tooltip,
            {
              left: clampTooltip(xAt(scrub), width),
            },
          ]}
        >
          <Text style={styles.tooltipDay}>{shortDateLabel(scrubDay.date)}</Text>
          <Text style={styles.tooltipVal}>{fmt(scrubVal as number)}g</Text>
        </View>
      )}
    </View>
  );

  return (
    <Card tone="recessed" style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.smoothing}>7d avg</Text>
        </View>
        <View style={styles.latestWrap}>
          <Text style={[styles.latest, { color: latestColor }]}>{latest.toFixed(1)}g</Text>
          <Text style={styles.target} numberOfLines={1}>
            {target}g target
          </Text>
        </View>
      </View>
      {IS_WEB ? plot : <GestureDetector gesture={pan}>{plot}</GestureDetector>}
    </Card>
  );
}

// Keep the tooltip inside the card: anchor near the cursor but clamp so it
// never spills off either edge.
function clampTooltip(cursorX: number, width: number): number {
  const TT_W = 64;
  return Math.max(0, Math.min(width - TT_W, cursorX - TT_W / 2));
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  // The label column gets flex room so a long metric title wraps/ellipsizes
  // instead of shoving the latest/target readout off the card edge.
  titleWrap: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  title: {
    fontSize: fontSize.label,
    color: palette.textSubtle,
    letterSpacing: 1,
    fontWeight: "700",
  },
  smoothing: {
    fontSize: fontSize.micro,
    color: palette.textFaint,
    letterSpacing: 0.4,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  // The readout column never wraps — it sits at the right, full-width-safe.
  latestWrap: {
    alignItems: "flex-end",
    flexShrink: 0,
  },
  latest: {
    fontFamily: condensedFamily,
    fontSize: fontSize.lead,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    letterSpacing: condensedFamily ? 0.2 : 0,
  },
  target: {
    fontSize: fontSize.label,
    color: palette.textSubtle,
    fontWeight: "500",
  },
  plotWrap: {
    width: "100%",
    height: PLOT_H,
    justifyContent: "center",
  },
  tooltip: {
    position: "absolute",
    top: 0,
    width: 64,
    alignItems: "center",
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.ink,
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 4,
  },
  tooltipDay: {
    fontSize: fontSize.micro,
    color: palette.textSubtle,
    letterSpacing: 0.3,
  },
  tooltipVal: {
    fontFamily: condensedFamily,
    fontSize: fontSize.caption,
    fontWeight: "800",
    color: palette.text,
    fontVariant: ["tabular-nums"],
  },
});
