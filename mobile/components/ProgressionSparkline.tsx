// Max-weight (or total-reps) progression for one exercise — a small
// scoreboard sparkline. Loud register: the line wears the exercise's own
// color identity, dot markers per session, the latest value called out as
// a condensed numeral. react-native-svg (already a dep). Renders nothing
// below two points (a line needs two to be a trend).

import { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { palette, fontSize, spacing, condensedFamily } from "@/lib/theme";
import type { ProgressionPoint } from "@/lib/strengthHistory";

const W = 100;
const H = 44;
const PAD = 4; // keep end dots off the edge

export function ProgressionSparkline({
  points,
  accent,
  unit,
}: {
  points: ProgressionPoint[];
  accent: string;
  unit: string;
}) {
  const geometry = useMemo(() => {
    if (points.length < 2) return null;
    const values = points.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1; // flat line sits centered
    const innerW = W - PAD * 2;
    const innerH = H - PAD * 2;
    const xy = points.map((p, i) => {
      const x = PAD + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
      const y = PAD + innerH - ((p.value - min) / span) * innerH;
      return { x, y };
    });
    const d = xy
      .map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(2)},${pt.y.toFixed(2)}`)
      .join(" ");
    return { xy, d };
  }, [points]);

  if (!geometry) return null;

  const latest = points[points.length - 1].value;
  const first = points[0].value;
  const delta = latest - first;

  return (
    <View>
      <View style={styles.headerRow}>
        <Text style={styles.title}>PROGRESSION</Text>
        <Text style={styles.latestWrap}>
          <Text style={[styles.latest, { color: accent }]}>
            {parseFloat(latest.toFixed(1))}
            {unit}
          </Text>
          {delta !== 0 && (
            <Text style={styles.delta}>
              {"  "}
              {delta > 0 ? "+" : ""}
              {parseFloat(delta.toFixed(1))} since start
            </Text>
          )}
        </Text>
      </View>
      <Svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={styles.svg}
        accessibilityLabel="progression sparkline"
      >
        <Path
          d={geometry.d}
          fill="none"
          stroke={accent}
          strokeWidth={1.8}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {geometry.xy.map((pt, i) => (
          <Circle
            key={i}
            cx={pt.x}
            cy={pt.y}
            r={i === geometry.xy.length - 1 ? 2.6 : 1.8}
            fill={i === geometry.xy.length - 1 ? accent : palette.bg}
            stroke={accent}
            strokeWidth={1.2}
          />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  title: {
    fontSize: fontSize.label,
    color: palette.textSubtle,
    letterSpacing: 1.2,
    fontWeight: "700",
  },
  latestWrap: { fontVariant: ["tabular-nums"] },
  latest: {
    fontFamily: condensedFamily,
    fontSize: fontSize.title,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    letterSpacing: condensedFamily ? 0.2 : 0,
  },
  delta: {
    fontSize: fontSize.caption,
    color: palette.textSubtle,
    fontWeight: "500",
  },
  svg: {
    width: "100%",
    height: 90,
    marginTop: spacing.sm,
  },
});
