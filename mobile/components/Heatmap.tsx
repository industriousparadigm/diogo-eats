// Calendar heatmap — native render of the web's CalendarHeatmap.
// Weeks as columns, days as rows, color = plant %, semantic single-hue
// (no stoplight). Tap a cell to jump the food tab to that day.

import { useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { palette, plantColor } from "@/lib/theme";
import { buildWeekGrid, monthLabelFor } from "@/lib/heatmap";
import type { DayAggregate } from "@/lib/types";

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Fixed cell size so a 2-week calendar doesn't become a wall of giant
// squares — same decision as the web (22px reads cleanly).
const CELL = 22;
const GAP = 4;

export function Heatmap({
  aggregates,
  selectedDate,
  onPickDate,
}: {
  aggregates: DayAggregate[];
  selectedDate?: string;
  onPickDate: (ymd: string) => void;
}) {
  const grid = useMemo(() => buildWeekGrid(aggregates), [aggregates]);

  if (grid.weeks.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          {/* Month labels above the columns */}
          <View style={styles.monthRow}>
            <View style={styles.dayLabelSpacer} />
            {grid.weeks.map((_, wi) => {
              const month = monthLabelFor(grid.weeks, wi);
              return (
                <View key={wi} style={styles.monthCell}>
                  {month !== null && (
                    <Text style={styles.monthText} numberOfLines={1}>
                      {MONTH_NAMES[month]}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>

          <View style={styles.gridRow}>
            {/* Day-of-week labels column */}
            <View style={styles.dayLabelCol}>
              {DAY_LABELS.map((d, i) => (
                <View key={i} style={styles.dayLabelCell}>
                  <Text
                    style={[styles.dayLabelText, { opacity: i % 2 === 1 ? 1 : 0.45 }]}
                  >
                    {d}
                  </Text>
                </View>
              ))}
            </View>
            {grid.weeks.map((week, wi) => (
              <View key={wi} style={styles.weekCol}>
                {week.map((cell, di) =>
                  cell ? (
                    <TouchableOpacity
                      key={cell.date}
                      onPress={() => onPickDate(cell.date)}
                      accessibilityLabel={
                        cell.meal_count > 0
                          ? `${cell.date}: ${cell.meal_count} meals, ${cell.plant_pct}% plant`
                          : `${cell.date}: no meals`
                      }
                      style={[
                        styles.cell,
                        { backgroundColor: plantColor(cell.plant_pct, cell.meal_count > 0) },
                        cell.meal_count === 0 && styles.cellEmpty,
                        cell.date === selectedDate && styles.cellSelected,
                      ]}
                    />
                  ) : (
                    <View key={`pad-${wi}-${di}`} style={styles.cellPad} />
                  )
                )}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Legend */}
      <View style={styles.legend}>
        <Text style={styles.legendText}>less plant</Text>
        {[
          palette.plant.veryLow,
          palette.plant.low,
          palette.plant.mid,
          palette.plant.high,
          palette.plant.full,
        ].map((c, i) => (
          <View key={i} style={[styles.legendSwatch, { backgroundColor: c }]} />
        ))}
        <Text style={styles.legendText}>more</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  monthRow: {
    flexDirection: "row",
    gap: GAP,
    height: 16,
    marginBottom: 2,
  },
  dayLabelSpacer: {
    width: 14 + GAP,
  },
  monthCell: {
    width: CELL,
    overflow: "visible",
  },
  monthText: {
    fontSize: 10,
    color: palette.textSubtle,
    letterSpacing: 0.4,
    width: CELL * 2,
  },
  gridRow: {
    flexDirection: "row",
    gap: GAP,
  },
  dayLabelCol: {
    gap: GAP,
    paddingRight: GAP,
  },
  dayLabelCell: {
    width: 14,
    height: CELL,
    justifyContent: "center",
  },
  dayLabelText: {
    fontSize: 9,
    color: palette.textSubtle,
    letterSpacing: 0.4,
  },
  weekCol: {
    gap: GAP,
  },
  cell: {
    width: CELL,
    height: CELL,
    borderRadius: 3,
  },
  cellEmpty: {
    borderWidth: 1,
    borderColor: palette.hairline,
  },
  cellSelected: {
    borderWidth: 2,
    borderColor: palette.food.accentBright,
  },
  cellPad: {
    width: CELL,
    height: CELL,
  },
  legend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  legendText: {
    fontSize: 10,
    color: palette.textSubtle,
  },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
});
