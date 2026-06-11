// Composer — build a meal from known library foods, zero AI. Native
// sibling of the web's /compose page. Search a food → add it → set grams
// (steppers + portion-preset quick-chips when present) → live totals →
// save lands a deterministic meal on the food tab.
//
// `?date=YYYY-MM-DD` (passed by the food tab when viewing a past day)
// backfills the composed meal onto that day via for_date.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { palette, radii, borders, fontSize, spacing, offsetShadow } from "@/lib/theme";
import { Button, StatNumber, KeyboardAwareScrollView } from "@/components/ui";
import { ApiError, composeMeal, fetchFoods } from "@/lib/api";
import { composeVibe } from "@/lib/compose";
import { totalsFromItems, type Item } from "@/lib/types";
import { parsePer100g, type Food } from "@/lib/foods";
import { fmt, fmtCal, todayYmd } from "@/lib/format";
import { stashNewMeal } from "@/lib/stores";

type Line = { food: Food; grams: number };

export default function ComposeScreen() {
  const router = useRouter();
  const { date } = useLocalSearchParams<{ date?: string }>();
  const forDate =
    typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= todayYmd()
      ? date
      : undefined;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Food[]>([]);
  const [searching, setSearching] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      setResults(await fetchFoods(q, { limit: 12 }));
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => runSearch(query), 200);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  // Live items mirror the server's compose exactly (confidence high,
  // library numbers verbatim) so the preview equals what saves.
  const liveItems: Item[] = useMemo(
    () =>
      lines.map((l) => ({
        name: l.food.display_name,
        grams: l.grams,
        confidence: "high",
        is_plant: l.food.is_plant === 1,
        per_100g: parsePer100g(l.food.per_100g_json),
      })),
    [lines]
  );
  const totals = useMemo(() => totalsFromItems(liveItems), [liveItems]);
  const vibe = useMemo(() => (liveItems.length ? composeVibe(liveItems) : null), [liveItems]);

  function addFood(food: Food) {
    const preset = food.portion_presets?.[0]?.grams;
    setLines((arr) => [...arr, { food, grams: preset ?? 100 }]);
    setQuery("");
    setResults([]);
  }

  function setGrams(idx: number, grams: number) {
    setLines((arr) =>
      arr.map((l, i) => (i === idx ? { ...l, grams: Math.max(0, Math.min(5000, grams)) } : l))
    );
  }
  function removeLine(idx: number) {
    setLines((arr) => arr.filter((_, i) => i !== idx));
  }

  async function save() {
    const valid = lines.filter((l) => l.grams > 0);
    if (valid.length === 0) {
      setError("add at least one food with grams");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const meal = await composeMeal(
        valid.map((l) => ({ food_id: l.food.name_key, grams: l.grams })),
        { forDate }
      );
      stashNewMeal(meal, forDate ?? todayYmd());
      router.back();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "save failed");
      setBusy(false);
    }
  }

  const canSave = !busy && lines.some((l) => l.grams > 0);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityLabel="back"
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.backBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>BUILD FROM LIBRARY</Text>
        <View style={styles.backBtn} />
      </View>

      <KeyboardAwareScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        footer={
          /* Sticky running totals + save — rides up with the keyboard so a
             focused grams field above it stays visible. */
          <View style={styles.totalsBar}>
            {vibe && <Text style={styles.vibe}>{vibe}</Text>}
            <View style={styles.totalsRow}>
              <StatNumber label="kcal" value={fmtCal(totals.calories)} align="left" />
              <StatNumber label="sat" value={`${totals.sat_fat_g.toFixed(1)}g`} align="left" />
              <StatNumber label="fib" value={`${totals.soluble_fiber_g.toFixed(1)}g`} align="left" />
              <StatNumber label="pro" value={`${fmt(totals.protein_g, 0)}g`} align="left" />
              <StatNumber label="plant" value={`${totals.plant_pct}%`} color={palette.food.accent} align="left" />
            </View>
            <Button
              label={busy ? "saving…" : forDate ? "save for that day" : "save meal"}
              variant="primary"
              onPress={save}
              disabled={!canSave}
            />
          </View>
        }
      >
          {/* Search + autocomplete */}
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder="search a food to add…"
            placeholderTextColor={palette.textFaint}
            autoComplete="off"
            autoFocus
            accessibilityLabel="search foods"
          />
          {query.trim().length > 0 && (
            <View style={styles.results}>
              {searching && results.length === 0 ? (
                <Text style={styles.resultMuted}>searching…</Text>
              ) : results.length === 0 ? (
                <Text style={styles.resultMuted}>no match — add it to your foods first</Text>
              ) : (
                results.map((f) => {
                  const p = parsePer100g(f.per_100g_json);
                  return (
                    <TouchableOpacity
                      key={f.name_key}
                      style={styles.resultRow}
                      onPress={() => addFood(f)}
                      activeOpacity={0.7}
                      accessibilityLabel={`add ${f.display_name}`}
                    >
                      <Text style={styles.resultName}>
                        {f.is_plant ? "🌱 " : ""}
                        {f.display_name}
                      </Text>
                      <Text style={styles.resultSub}>
                        {Math.round(p.calories)} kcal · {p.protein_g.toFixed(0)}g pro · per 100g
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          )}

          {/* Chosen lines */}
          {lines.length === 0 ? (
            <Text style={styles.emptyHint}>
              Search above to add foods, set grams, save. No AI — built from your library.
            </Text>
          ) : (
            lines.map((l, idx) => {
              const presets = l.food.portion_presets ?? [];
              return (
                <View key={`${l.food.name_key}-${idx}`} style={styles.lineCard}>
                  <View style={styles.lineTop}>
                    <View style={styles.lineMain}>
                      <Text style={styles.lineName} numberOfLines={1}>
                        {l.food.is_plant === 1 ? "🌱 " : ""}
                        {l.food.display_name}
                      </Text>
                      <Text style={styles.lineSub}>
                        {Math.round((l.grams * parsePer100g(l.food.per_100g_json).calories) / 100)} kcal
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => removeLine(idx)}
                      accessibilityLabel={`remove ${l.food.display_name}`}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.lineRemove}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.lineBottom}>
                    <TouchableOpacity
                      style={styles.stepBtn}
                      onPress={() => setGrams(idx, l.grams - 10)}
                      accessibilityLabel={`${l.food.display_name} minus 10 grams`}
                    >
                      <Text style={styles.stepText}>−</Text>
                    </TouchableOpacity>
                    <TextInput
                      style={styles.gramsInput}
                      value={String(l.grams)}
                      onChangeText={(v) => setGrams(idx, parseFloat(v) || 0)}
                      keyboardType="numeric"
                      accessibilityLabel={`${l.food.display_name} grams`}
                    />
                    <Text style={styles.gramsUnit}>g</Text>
                    <TouchableOpacity
                      style={styles.stepBtn}
                      onPress={() => setGrams(idx, l.grams + 10)}
                      accessibilityLabel={`${l.food.display_name} plus 10 grams`}
                    >
                      <Text style={styles.stepText}>+</Text>
                    </TouchableOpacity>
                    {presets.length > 0 && (
                      <ScrollView
                        horizontal
                        style={styles.presetRow}
                        showsHorizontalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                      >
                        {presets.map((preset) => (
                          <TouchableOpacity
                            key={`${preset.label}-${preset.grams}`}
                            style={styles.presetChip}
                            onPress={() => setGrams(idx, preset.grams)}
                            accessibilityLabel={`${preset.label} ${preset.grams} grams`}
                          >
                            <Text style={styles.presetText}>
                              {preset.label} {preset.grams}g
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    )}
                  </View>
                </View>
              );
            })
          )}

          {error && (
            <View style={styles.errorCard}>
              <Text style={styles.errorCardText}>{error}</Text>
            </View>
          )}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: borders.bold,
    borderBottomColor: palette.ink,
  },
  backBtn: {
    width: 44,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  backBtnText: {
    fontSize: 26,
    color: palette.textMuted,
    lineHeight: 30,
  },
  headerTitle: {
    flex: 1,
    fontSize: fontSize.label,
    fontWeight: "700",
    color: palette.textMuted,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    textAlign: "center",
  },
  body: { flex: 1 },
  bodyContent: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  search: {
    backgroundColor: palette.surfaceMuted,
    color: palette.text,
    borderWidth: borders.bold,
    borderColor: palette.inkSoft,
    borderRadius: radii.sm,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: fontSize.bodyLg,
  },
  results: {
    borderWidth: borders.bold,
    borderColor: palette.ink,
    borderRadius: radii.sm,
    overflow: "hidden",
    backgroundColor: palette.surface,
  },
  resultMuted: {
    padding: 12,
    fontSize: 13,
    color: palette.textSubtle,
  },
  resultRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.ink,
  },
  resultName: {
    fontSize: 14,
    color: palette.text,
  },
  resultSub: {
    fontSize: 11,
    color: palette.textSubtle,
    marginTop: 2,
  },
  emptyHint: {
    fontSize: 14,
    color: palette.textSubtle,
    textAlign: "center",
    paddingVertical: 20,
  },
  lineCard: {
    backgroundColor: palette.surfaceAlt,
    borderWidth: borders.bold,
    borderColor: palette.ink,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.md,
    ...offsetShadow(palette.surfaceShadow, "soft"),
  },
  lineTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  lineMain: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  lineName: {
    fontSize: 14,
    color: palette.text,
  },
  lineSub: {
    fontSize: 11,
    color: palette.textSubtle,
  },
  lineRemove: {
    fontSize: 16,
    color: palette.textSubtle,
    paddingHorizontal: 4,
  },
  lineBottom: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    backgroundColor: palette.surfaceMuted,
    borderWidth: 1,
    borderColor: palette.inkSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: {
    fontSize: 20,
    color: palette.text,
    lineHeight: 22,
  },
  gramsInput: {
    width: 64,
    backgroundColor: palette.surfaceMuted,
    color: palette.text,
    borderWidth: 1,
    borderColor: palette.inkSoft,
    borderRadius: radii.sm,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 14,
    textAlign: "center",
  },
  gramsUnit: {
    fontSize: 12,
    color: palette.textSubtle,
  },
  presetRow: {
    flexDirection: "row",
    marginLeft: 4,
  },
  presetChip: {
    borderWidth: 1,
    borderColor: palette.inkSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 6,
  },
  presetText: {
    fontSize: 11,
    color: palette.textMuted,
  },
  errorCard: {
    backgroundColor: "#7f1d1d",
    padding: 12,
    borderRadius: radii.sm,
  },
  errorCardText: {
    fontSize: 13,
    color: "#fff",
  },
  totalsBar: {
    borderTopWidth: borders.bold,
    borderTopColor: palette.ink,
    backgroundColor: palette.bg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  vibe: {
    fontSize: fontSize.label,
    color: palette.food.accentBright,
    textAlign: "center",
    letterSpacing: 0.2,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
});
