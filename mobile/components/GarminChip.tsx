// Garmin chip on the Today header — the mobile twin of the web GarminHomeChip.
// Read-only: a Pi cron keeps garmin_daily fresh (Garmin blocks datacenter IPs,
// so there's no sync-from-app path). Per viewed day. Tap to open the full
// Body screen (strain/recovery detail, 7-day trend, recent activities).
// Hidden entirely on days with no data.

import { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { palette, radii, borders, fontSize } from "@/lib/theme";
import { SkeletonBlock } from "@/components/ui";
import { fetchGarminStatus, type GarminDay } from "@/lib/api";

export function GarminChip({ day }: { day: string }) {
  const router = useRouter();
  const [data, setData] = useState<GarminDay["today"] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const res = await fetchGarminStatus(day);
        if (!alive) return;
        setData(res.today);
      } catch {
        // Chip is decoration — never surface Garmin errors here.
        if (alive) setData(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [day]);

  if (loading) {
    return (
      <View style={styles.row}>
        <SkeletonBlock width={170} height={26} radius={radii.pill} />
      </View>
    );
  }

  if (!data) return null;
  const { strain, recovery } = data;
  if (strain == null && recovery == null) return null;

  // Recovery tint from sleep score, same restrained scale as the Whoop chip.
  const recColor =
    recovery == null
      ? palette.textSubtle
      : recovery < 34
        ? palette.danger
        : recovery < 67
          ? palette.warn
          : palette.food.accentBright;

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={styles.chip}
        onPress={() => router.push(`/(app)/garmin?day=${day}`)}
        activeOpacity={0.7}
        accessibilityLabel="garmin day summary"
      >
        {strain != null && (
          <Text style={styles.label}>
            STRAIN <Text style={styles.strainValue}>{strain.toFixed(1)}</Text>
          </Text>
        )}
        {strain != null && recovery != null && <Text style={styles.dot}>·</Text>}
        {recovery != null && (
          <Text style={styles.label}>
            RECOVERY <Text style={[styles.recValue, { color: recColor }]}>{recovery}%</Text>
          </Text>
        )}
        <Text style={styles.caret}>›</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    marginTop: -4,
    marginBottom: 10,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: palette.surfaceMuted,
    borderWidth: borders.hairline,
    borderColor: palette.ink,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  label: {
    fontSize: fontSize.tiny,
    fontWeight: "700",
    letterSpacing: 0.5,
    color: palette.textMuted,
  },
  strainValue: {
    color: palette.text,
    fontWeight: "800",
  },
  recValue: {
    fontWeight: "800",
  },
  dot: {
    color: palette.textSubtle,
    fontSize: fontSize.tiny,
  },
  caret: {
    color: palette.textFaint,
    fontSize: fontSize.body,
    fontWeight: "700",
  },
});
