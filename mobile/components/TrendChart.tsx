// 7-day rolling-average trend line — native render of the web's
// FiberTrend / SatFatTrend (shared here since they differ only in
// metric, direction and copy). react-native-svg Path over a soft
// dashed target line. Targets are reference numbers, not gates:
// nothing red-alerts; sat fat over target is amber at most.

import { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Line, Path } from "react-native-svg";
import { palette, fontSize, spacing, condensedFamily } from "@/lib/theme";
import { Card } from "@/components/ui";
import { rollingAverage, visibleAggregates } from "@/lib/headline";
import type { DayAggregate } from "@/lib/types";

const W = 100;
const H = 50;

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
  const window = useMemo(() => visibleAggregates(aggregates), [aggregates]);
  const points = useMemo(() => rollingAverage(window, pick), [window, pick]);

  const validVals = points.filter((v) => !isNaN(v));
  if (validVals.length < 2) return null;

  const max = Math.max(target * 1.5, ...validVals, 1);
  const xStep = W / Math.max(1, points.length - 1);

  // Build the path skipping NaN gaps cleanly (move-to instead of line-to).
  const path = points.reduce((acc, v, i) => {
    if (isNaN(v)) return acc;
    const x = (i * xStep).toFixed(2);
    const y = (H - (v / max) * H).toFixed(2);
    if (i > 0 && isNaN(points[i - 1])) return acc + ` M${x},${y}`;
    return acc === "" ? `M${x},${y}` : acc + ` L${x},${y}`;
  }, "");

  const targetY = H - (target / max) * H;
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

  return (
    <Card tone="recessed" style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.latestWrap}>
          <Text style={[styles.latest, { color: latestColor }]}>{latest.toFixed(1)}g</Text>
          <Text style={styles.target}> / {target}g target</Text>
        </Text>
      </View>
      <Svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={styles.svg}
        accessibilityLabel={`${title} trend`}
      >
        <Line
          x1={0}
          x2={W}
          y1={targetY}
          y2={targetY}
          stroke={palette.inkSoft}
          strokeWidth={0.4}
          strokeDasharray="1,1"
        />
        <Path
          d={path}
          fill="none"
          stroke={accentLight}
          strokeWidth={1.4}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </Svg>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  title: {
    fontSize: fontSize.label,
    color: palette.textSubtle,
    letterSpacing: 1,
    fontWeight: "700",
  },
  latestWrap: {
    fontVariant: ["tabular-nums"],
  },
  latest: {
    fontFamily: condensedFamily,
    fontSize: fontSize.title,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    letterSpacing: condensedFamily ? 0.2 : 0,
  },
  target: {
    fontSize: fontSize.caption,
    color: palette.textSubtle,
    fontWeight: "500",
  },
  svg: {
    width: "100%",
    height: 110,
  },
});
