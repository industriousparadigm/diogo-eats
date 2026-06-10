// Whoop chip on the Today header — mirrors the web's WhoopHomeChip.
// Hidden entirely when not connected or no data (no nag). When the
// cached data is stale it fires a background sync and refreshes.

import { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { palette, radii, borders, fontSize } from "@/lib/theme";
import { fetchWhoopToday, syncWhoop, type WhoopToday } from "@/lib/api";

const STALE_AFTER_MS = 15 * 60 * 1000;

export function WhoopChip() {
  const [data, setData] = useState<WhoopToday | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const initial = await fetchWhoopToday();
        if (!alive) return;
        setData(initial);

        if (!initial.connected) return;
        const last = initial.last_sync_at ?? 0;
        if (Date.now() - last > STALE_AFTER_MS) {
          // Background sync; refresh when it returns. Failures are
          // silent — the chip just shows the last-known data.
          await syncWhoop();
          const refreshed = await fetchWhoopToday();
          if (alive) setData(refreshed);
        }
      } catch {
        // Chip is decoration — never surface Whoop errors here.
        if (alive) setData(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!data?.connected || !data.today) return null;

  const strain = data.today.strain;
  const recovery = data.today.recovery_pct;
  if (strain == null && recovery == null) return null;

  // Recovery tint: matches Whoop's own color language, restrained.
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
      <View style={styles.chip}>
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
      </View>
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
    backgroundColor: palette.food.accentSoft,
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
});
