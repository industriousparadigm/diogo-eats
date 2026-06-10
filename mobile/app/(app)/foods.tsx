// Foods library — the native sibling of the web's /foods page. Search the
// library, see provenance badges, edit (name / is_plant / per-100g), merge
// duplicates, delete, add manually, and capture a nutrition label with the
// camera (turns a packaged-food panel into a deterministic per-100g entry).
//
// Reached from Settings. Quiet identity language, single green hue —
// matches the food side's emotional contract, not the strength scoreboard.

import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { colors, radii } from "@/lib/colors";
import {
  ApiError,
  createFood,
  deleteFood,
  fetchFoods,
  foodFromLabel,
  mergeFoods,
  updateFood,
} from "@/lib/api";
import { provenanceLabel, parsePer100g, type Food, type Provenance } from "@/lib/foods";
import type { Per100g } from "@/lib/types";

const IS_WEB = Platform.OS === "web";

export default function FoodsScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [foods, setFoods] = useState<Food[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [labelBusy, setLabelBusy] = useState(false);

  // Merge mode: a keep row + a set of selected merge keys.
  const [mergeKeepKey, setMergeKeepKey] = useState<string | null>(null);
  const [mergeSel, setMergeSel] = useState<Set<string>>(new Set());

  const load = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      setFoods(await fetchFoods(q, { limit: 100 }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(query), query ? 220 : 0);
    return () => clearTimeout(t);
  }, [query, load]);

  function resetModes() {
    setEditingKey(null);
    setMergeKeepKey(null);
    setMergeSel(new Set());
    setAdding(false);
  }

  async function captureLabel() {
    setError(null);
    let uri: string | null = null;
    try {
      if (IS_WEB) {
        const res = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: "images",
          quality: 1,
        });
        if (res.canceled || res.assets.length === 0) return;
        uri = res.assets[0].uri;
      } else {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") {
          setError("Camera permission required");
          return;
        }
        const res = await ImagePicker.launchCameraAsync({
          mediaTypes: "images",
          allowsEditing: true,
          quality: 1,
        });
        if (res.canceled || res.assets.length === 0) return;
        uri = res.assets[0].uri;
      }
    } catch {
      setError("couldn't open the camera");
      return;
    }
    if (!uri) return;
    setLabelBusy(true);
    try {
      const resized = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 2048 } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
      );
      const name = resized.uri.split("/").pop() ?? "label.jpg";
      await foodFromLabel({ uri: resized.uri, name, type: "image/jpeg" });
      await load(query);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "label read failed");
    } finally {
      setLabelBusy(false);
    }
  }

  function toggleMergeSel(key: string) {
    setMergeSel((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function commitMerge() {
    if (!mergeKeepKey || mergeSel.size === 0) return;
    setError(null);
    try {
      await mergeFoods(mergeKeepKey, Array.from(mergeSel));
      resetModes();
      await load(query);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "merge failed");
    }
  }

  const list = foods ?? [];

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
          <Text style={styles.headerTitle}>FOODS</Text>
          <Text style={styles.headerCount}>
            {foods ? `${list.length}${list.length === 100 ? "+" : ""}` : ""}
          </Text>
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder="search your foods…"
            placeholderTextColor={colors.textFaint}
            autoComplete="off"
            accessibilityLabel="search foods"
          />

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => {
                resetModes();
                setAdding((a) => !a);
              }}
              accessibilityLabel="add food"
            >
              <Text style={styles.secondaryText}>{adding ? "close" : "+ add food"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryBtn, labelBusy && styles.dim]}
              onPress={captureLabel}
              disabled={labelBusy}
              accessibilityLabel="read a label"
            >
              <Text style={styles.secondaryText}>
                {labelBusy ? "reading label…" : "read a label"}
              </Text>
            </TouchableOpacity>
          </View>

          {error && (
            <View style={styles.errorCard}>
              <Text style={styles.errorCardText}>{error}</Text>
            </View>
          )}

          {adding && (
            <FoodForm
              mode="add"
              onCancel={() => setAdding(false)}
              onDone={async () => {
                setAdding(false);
                await load(query);
              }}
            />
          )}

          {/* Merge banner */}
          {mergeKeepKey && (
            <View style={styles.mergeBanner}>
              <Text style={styles.mergeBannerText}>
                Merge into{" "}
                <Text style={styles.mergeBannerName}>
                  {list.find((f) => f.name_key === mergeKeepKey)?.display_name}
                </Text>
                {"  "}— pick duplicates to fold in.
              </Text>
              <View style={styles.mergeBannerRow}>
                <TouchableOpacity
                  style={[styles.primaryBtn, mergeSel.size === 0 && styles.dim]}
                  onPress={commitMerge}
                  disabled={mergeSel.size === 0}
                >
                  <Text style={styles.primaryText}>
                    merge {mergeSel.size > 0 ? `(${mergeSel.size})` : ""}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryBtn} onPress={resetModes}>
                  <Text style={styles.secondaryText}>cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* List */}
          {foods === null && loading ? (
            <ActivityIndicator color={colors.brand} style={styles.loader} />
          ) : foods !== null && list.length === 0 ? (
            <Text style={styles.emptyText}>
              {query ? "no foods match." : "no foods yet — log a meal or read a label."}
            </Text>
          ) : (
            list.map((f) =>
              editingKey === f.name_key ? (
                <FoodForm
                  key={f.name_key}
                  mode="edit"
                  food={f}
                  onCancel={() => setEditingKey(null)}
                  onDone={async () => {
                    setEditingKey(null);
                    await load(query);
                  }}
                />
              ) : (
                <FoodCard
                  key={f.name_key}
                  food={f}
                  mergeMode={mergeKeepKey !== null}
                  isMergeKeep={mergeKeepKey === f.name_key}
                  isMergeSelected={mergeSel.has(f.name_key)}
                  onEdit={() => {
                    resetModes();
                    setEditingKey(f.name_key);
                  }}
                  onStartMerge={() => {
                    resetModes();
                    setMergeKeepKey(f.name_key);
                  }}
                  onToggleMerge={() => toggleMergeSel(f.name_key)}
                />
              )
            )
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const PROV_BADGE: Record<Provenance, { bg: string; fg: string; bd: string }> = {
  label_verified: { bg: "rgba(132,204,22,0.12)", fg: colors.accentLight, bd: "rgba(132,204,22,0.30)" },
  user_corrected: { bg: colors.surfaceMuted, fg: colors.textMuted, bd: colors.borderStrong },
  ai_inferred: { bg: "transparent", fg: colors.textFaint, bd: colors.border },
};

function FoodCard({
  food,
  mergeMode,
  isMergeKeep,
  isMergeSelected,
  onEdit,
  onStartMerge,
  onToggleMerge,
}: {
  food: Food;
  mergeMode: boolean;
  isMergeKeep: boolean;
  isMergeSelected: boolean;
  onEdit: () => void;
  onStartMerge: () => void;
  onToggleMerge: () => void;
}) {
  const p = parsePer100g(food.per_100g_json);
  const badge = PROV_BADGE[food.provenance] ?? PROV_BADGE.ai_inferred;
  const tappable = mergeMode && !isMergeKeep;

  const Wrapper: typeof TouchableOpacity = TouchableOpacity;
  return (
    <Wrapper
      activeOpacity={tappable ? 0.7 : 1}
      onPress={tappable ? onToggleMerge : undefined}
      disabled={!tappable}
      style={[
        styles.foodCard,
        isMergeSelected && styles.foodCardSelected,
        isMergeKeep && styles.dim,
      ]}
    >
      <View style={styles.foodTop}>
        <Text style={styles.foodName} numberOfLines={2}>
          {food.is_plant === 1 ? "🌱 " : ""}
          {food.display_name}
        </Text>
        <View style={[styles.provBadge, { backgroundColor: badge.bg, borderColor: badge.bd }]}>
          <Text style={[styles.provBadgeText, { color: badge.fg }]}>
            {provenanceLabel(food.provenance)}
          </Text>
        </View>
      </View>
      <View style={styles.foodStats}>
        <Text style={styles.foodStat}>{Math.round(p.calories)} kcal</Text>
        <Text style={styles.foodStat}>{p.sat_fat_g.toFixed(1)}g sat</Text>
        <Text style={styles.foodStat}>{p.soluble_fiber_g.toFixed(1)}g fib</Text>
        <Text style={styles.foodStat}>{p.protein_g.toFixed(0)}g pro</Text>
        <Text style={styles.foodStatFaint}>· per 100g</Text>
        <Text style={styles.foodSeen}>seen {food.times_seen}×</Text>
      </View>
      {!mergeMode && (
        <View style={styles.foodActions}>
          <TouchableOpacity style={styles.miniBtn} onPress={onEdit}>
            <Text style={styles.miniBtnText}>edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.miniBtn} onPress={onStartMerge}>
            <Text style={styles.miniBtnText}>merge…</Text>
          </TouchableOpacity>
        </View>
      )}
    </Wrapper>
  );
}

const NUM_FIELDS: { key: keyof Per100g; label: string }[] = [
  { key: "calories", label: "kcal" },
  { key: "sat_fat_g", label: "sat fat g" },
  { key: "soluble_fiber_g", label: "sol. fiber g" },
  { key: "protein_g", label: "protein g" },
];

function toPer100g(values: Record<string, string>): Per100g {
  const num = (k: string) => {
    const n = parseFloat(values[k]);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    sat_fat_g: num("sat_fat_g"),
    soluble_fiber_g: num("soluble_fiber_g"),
    calories: num("calories"),
    protein_g: num("protein_g"),
  };
}

function FoodForm({
  mode,
  food,
  onCancel,
  onDone,
}: {
  mode: "add" | "edit";
  food?: Food;
  onCancel: () => void;
  onDone: () => void;
}) {
  const existing = food ? parsePer100g(food.per_100g_json) : null;
  const [name, setName] = useState(food?.display_name ?? "");
  const [isPlant, setIsPlant] = useState(food ? food.is_plant === 1 : true);
  const [vals, setVals] = useState<Record<string, string>>(
    existing
      ? {
          calories: String(existing.calories),
          sat_fat_g: String(existing.sat_fat_g),
          soluble_fiber_g: String(existing.soluble_fiber_g),
          protein_g: String(existing.protein_g),
        }
      : {}
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) {
      setErr("name required");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      if (mode === "add") {
        await createFood({ display_name: name.trim(), is_plant: isPlant, per_100g: toPer100g(vals) });
      } else if (food) {
        await updateFood(food.name_key, {
          display_name: name.trim(),
          is_plant: isPlant,
          per_100g: toPer100g(vals),
        });
      }
      onDone();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "save failed");
      setBusy(false);
    }
  }

  function confirmDelete() {
    if (!food) return;
    Alert.alert(`Delete "${food.display_name}"?`, "Remove it from your foods.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await deleteFood(food.name_key);
            onDone();
          } catch (e) {
            setErr(e instanceof ApiError ? e.message : "delete failed");
            setBusy(false);
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.form}>
      <Text style={styles.formLabel}>{mode === "add" ? "ADD A FOOD" : "EDIT FOOD"}</Text>
      <TextInput
        style={styles.formInput}
        value={name}
        onChangeText={setName}
        placeholder="e.g. Provamel oat milk"
        placeholderTextColor={colors.textFaint}
        editable={!busy}
        accessibilityLabel="food name"
        autoFocus={mode === "add"}
      />
      <View style={styles.plantRow}>
        {(
          [
            [true, "🌱 plant"],
            [false, "not plant"],
          ] as Array<[boolean, string]>
        ).map(([v, label]) => (
          <TouchableOpacity
            key={String(v)}
            onPress={() => setIsPlant(v)}
            style={[styles.plantBtn, isPlant === v && styles.plantBtnActive]}
            accessibilityLabel={label}
          >
            <Text style={[styles.plantBtnText, isPlant === v && styles.plantBtnTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.numGrid}>
        {NUM_FIELDS.map((f) => (
          <View key={f.key} style={styles.numField}>
            <Text style={styles.numLabel}>{f.label} (per 100g)</Text>
            <TextInput
              style={styles.numInput}
              value={vals[f.key] ?? ""}
              onChangeText={(v) => setVals((s) => ({ ...s, [f.key]: v }))}
              keyboardType="decimal-pad"
              editable={!busy}
              accessibilityLabel={`${f.label} per 100g`}
            />
          </View>
        ))}
      </View>
      {err && <Text style={styles.formError}>{err}</Text>}
      <View style={styles.formActions}>
        <TouchableOpacity style={[styles.primaryBtn, busy && styles.dim]} onPress={submit} disabled={busy}>
          <Text style={styles.primaryText}>{busy ? "saving…" : mode === "add" ? "add" : "save"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={onCancel} disabled={busy}>
          <Text style={styles.secondaryText}>cancel</Text>
        </TouchableOpacity>
        {mode === "edit" && (
          <TouchableOpacity style={styles.deleteLink} onPress={confirmDelete} disabled={busy}>
            <Text style={styles.deleteLinkText}>delete</Text>
          </TouchableOpacity>
        )}
      </View>
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
    gap: 4,
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
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 2,
    color: colors.text,
  },
  headerCount: {
    fontSize: 11,
    color: colors.textFaint,
    paddingRight: 12,
  },
  body: { flex: 1 },
  bodyContent: {
    padding: 16,
    gap: 10,
    paddingBottom: 48,
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
  actionRow: {
    flexDirection: "row",
    gap: 8,
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: radii.sm,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  primaryText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
  },
  dim: { opacity: 0.5 },
  errorCard: {
    backgroundColor: "#7f1d1d",
    padding: 10,
    borderRadius: radii.sm,
  },
  errorCardText: {
    fontSize: 13,
    color: "#fff",
  },
  loader: { marginTop: 24 },
  emptyText: {
    fontSize: 14,
    color: colors.textFaint,
    paddingVertical: 24,
  },
  mergeBanner: {
    backgroundColor: "rgba(132,204,22,0.08)",
    borderWidth: 1,
    borderColor: "rgba(132,204,22,0.22)",
    borderRadius: radii.sm,
    padding: 10,
    gap: 8,
  },
  mergeBannerText: {
    fontSize: 12,
    color: colors.text,
    lineHeight: 18,
  },
  mergeBannerName: {
    fontWeight: "700",
    color: colors.accentLight,
  },
  mergeBannerRow: {
    flexDirection: "row",
    gap: 8,
  },
  foodCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: 12,
    gap: 8,
  },
  foodCardSelected: {
    backgroundColor: "rgba(132,204,22,0.07)",
    borderColor: "rgba(132,204,22,0.30)",
  },
  foodTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  foodName: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    lineHeight: 19,
  },
  provBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  provBadgeText: {
    fontSize: 10,
    letterSpacing: 0.3,
  },
  foodStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
  },
  foodStat: {
    fontSize: 11,
    color: colors.textSubtle,
  },
  foodStatFaint: {
    fontSize: 11,
    color: colors.textFaint,
  },
  foodSeen: {
    fontSize: 11,
    color: colors.textFaint,
    marginLeft: "auto",
  },
  foodActions: {
    flexDirection: "row",
    gap: 8,
  },
  miniBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  miniBtnText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  form: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderDashed,
    borderRadius: radii.md,
    padding: 12,
    gap: 10,
  },
  formLabel: {
    fontSize: 11,
    color: colors.textSubtle,
    letterSpacing: 0.5,
  },
  formInput: {
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.sm,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  plantRow: {
    flexDirection: "row",
    gap: 8,
  },
  plantBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.sm,
    paddingVertical: 8,
    alignItems: "center",
  },
  plantBtnActive: {
    backgroundColor: "rgba(132,204,22,0.12)",
    borderColor: "rgba(132,204,22,0.30)",
  },
  plantBtnText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  plantBtnTextActive: {
    color: colors.accentLight,
  },
  numGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  numField: {
    width: "47%",
    flexGrow: 1,
    gap: 4,
  },
  numLabel: {
    fontSize: 11,
    color: colors.textSubtle,
  },
  numInput: {
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.sm,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 14,
  },
  formError: {
    fontSize: 12,
    color: colors.bad,
  },
  formActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  deleteLink: {
    marginLeft: "auto",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  deleteLinkText: {
    fontSize: 13,
    color: colors.textFaint,
  },
});
