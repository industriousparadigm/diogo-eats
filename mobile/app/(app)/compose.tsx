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
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { colors, radii } from "@/lib/colors";
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
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.kav}
      >
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

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Search + autocomplete */}
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder="search a food to add…"
            placeholderTextColor={colors.textFaint}
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
        </ScrollView>

        {/* Sticky running totals + save */}
        <View style={styles.totalsBar}>
          {vibe && <Text style={styles.vibe}>{vibe}</Text>}
          <View style={styles.totalsRow}>
            <Stat label="kcal" value={fmtCal(totals.calories)} />
            <Stat label="sat" value={`${totals.sat_fat_g.toFixed(1)}g`} />
            <Stat label="fib" value={`${totals.soluble_fiber_g.toFixed(1)}g`} />
            <Stat label="pro" value={`${fmt(totals.protein_g, 0)}g`} />
            <Stat label="plant" value={`${totals.plant_pct}%`} />
          </View>
          <TouchableOpacity
            style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
            onPress={save}
            disabled={!canSave}
            activeOpacity={0.85}
          >
            <Text style={styles.saveBtnText}>
              {busy ? "saving…" : forDate ? "save for that day" : "save meal"}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  kav: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 44,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  backBtnText: {
    fontSize: 26,
    color: colors.textMuted,
    lineHeight: 30,
  },
  headerTitle: {
    flex: 1,
    fontSize: 12,
    color: colors.textMuted,
    letterSpacing: 0.5,
    textAlign: "center",
  },
  body: { flex: 1 },
  bodyContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 24,
  },
  search: {
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.sm,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  results: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  resultMuted: {
    padding: 12,
    fontSize: 13,
    color: colors.textFaint,
  },
  resultRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  resultName: {
    fontSize: 14,
    color: colors.text,
  },
  resultSub: {
    fontSize: 11,
    color: colors.textFaint,
    marginTop: 2,
  },
  emptyHint: {
    fontSize: 14,
    color: colors.textFaint,
    textAlign: "center",
    paddingVertical: 20,
  },
  lineCard: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.sm,
    padding: 10,
    gap: 10,
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
    color: colors.text,
  },
  lineSub: {
    fontSize: 11,
    color: colors.textFaint,
  },
  lineRemove: {
    fontSize: 16,
    color: colors.textSubtle,
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
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: {
    fontSize: 20,
    color: colors.text,
    lineHeight: 22,
  },
  gramsInput: {
    width: 64,
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.sm,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 14,
    textAlign: "center",
  },
  gramsUnit: {
    fontSize: 12,
    color: colors.textSubtle,
  },
  presetRow: {
    flexDirection: "row",
    marginLeft: 4,
  },
  presetChip: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 6,
  },
  presetText: {
    fontSize: 11,
    color: colors.textMuted,
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
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
    gap: 10,
  },
  vibe: {
    fontSize: 11,
    color: colors.accentLight,
    textAlign: "center",
    letterSpacing: 0.2,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  stat: {
    flex: 1,
  },
  statLabel: {
    fontSize: 9,
    color: colors.textSubtle,
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 14,
    color: colors.text,
    fontWeight: "500",
  },
  saveBtn: {
    backgroundColor: colors.accent,
    borderRadius: radii.sm,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveBtnDisabled: {
    backgroundColor: "#3f3f46",
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.bg,
  },
});
