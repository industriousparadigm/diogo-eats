// Meal detail/edit — mirrors the web's /meal/[id] edit page semantics:
//
//   - items: a local working copy; edits stay local until "save".
//   - Talk-to-fix: POST /api/meals/[id]/talk rewrites the items from a
//     plain-English correction; the rewrite lands in the working copy
//     for review and is only persisted on save.
//   - Add item by name + grams -> POST /api/lookup for nutrition.
//   - Remove item, manual gram/name tweaks, confidence dots.
//   - Live totals bar (client-side computeTotals, same rounding the
//     server will persist) + sticky save (PATCH /api/meals/[id]).
//   - Legacy meals (pre per-item nutrition) are read-only.
//
// The meal itself arrives via the module store (stashed by the day list
// before navigation) — there's no GET-single-meal endpoint and the list
// already had the full row.

import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import { colors, radii } from "@/lib/colors";
import { computeTotals } from "@/lib/editTotals";
import { parseItems, type Item, type Meal } from "@/lib/types";
import { fmt, fmtCal, fmtTime, fmtDayLabel } from "@/lib/format";
import {
  ApiError,
  deleteMeal,
  lookupFood,
  patchMealItems,
  repeatMeal,
  resolvePhotoUrl,
  talkFixMeal,
} from "@/lib/api";
import { takeMeal, stashNewMeal } from "@/lib/stores";
import { EditItemRow } from "@/components/EditItemRow";
import { RepeatButton } from "@/components/RepeatButton";
import { PhotoLightbox } from "@/components/PhotoLightbox";

export default function MealEditScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const meal = useMemo(() => (id ? takeMeal(id) : null), [id]);

  if (!meal) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <View style={styles.missingWrap}>
          <Text style={styles.missingText}>Meal not found</Text>
          <TouchableOpacity style={styles.missingBack} onPress={() => router.back()}>
            <Text style={styles.missingBackText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return <Editor meal={meal} />;
}

function Editor({ meal }: { meal: Meal }) {
  const router = useRouter();
  const original = useMemo(() => parseItems(meal.items_json), [meal.items_json]);
  const [items, setItems] = useState<Item[]>(() => original);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [addName, setAddName] = useState("");
  const [addGrams, setAddGrams] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [talkMsg, setTalkMsg] = useState("");
  const [talkBusy, setTalkBusy] = useState(false);
  const [talkError, setTalkError] = useState<string | null>(null);
  const [talkHint, setTalkHint] = useState<string | null>(null);

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState(false);

  useEffect(() => {
    if (!meal.photo_filename) return;
    let cancelled = false;
    resolvePhotoUrl(meal.photo_filename)
      .then((url) => {
        if (!cancelled) setPhotoUrl(url);
      })
      .catch(() => {
        // Photo unavailable — the editor still works without it.
      });
    return () => {
      cancelled = true;
    };
  }, [meal.photo_filename]);

  const isLegacy =
    items.length > 0 &&
    (items[0] as { per_100g?: unknown }).per_100g === undefined;
  const live = useMemo(() => computeTotals(items), [items]);

  function patchGrams(idx: number, value: string) {
    const grams = Math.max(0, Math.min(5000, parseFloat(value) || 0));
    setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, grams } : it)));
  }
  function patchName(idx: number, value: string) {
    setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, name: value } : it)));
  }
  function removeItem(idx: number) {
    setItems((arr) => arr.filter((_, i) => i !== idx));
  }

  async function addItem() {
    setAddError(null);
    const name = addName.trim();
    const grams = parseFloat(addGrams);
    if (!name) {
      setAddError("name required");
      return;
    }
    if (!grams || grams <= 0) {
      setAddError("grams required");
      return;
    }
    setAddBusy(true);
    try {
      const result = await lookupFood(name);
      const newItem: Item = {
        name,
        grams,
        confidence: "medium",
        is_plant: result.is_plant,
        per_100g: result.per_100g,
      };
      setItems((arr) => [...arr, newItem]);
      setAddName("");
      setAddGrams("");
      setAdding(false);
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : "lookup failed");
    } finally {
      setAddBusy(false);
    }
  }

  async function talkFix() {
    const message = talkMsg.trim();
    if (!message) return;
    setTalkBusy(true);
    setTalkError(null);
    setTalkHint(null);
    try {
      const updated = await talkFixMeal(meal.id, message);
      setItems(updated);
      setTalkMsg("");
      setTalkHint("updated — review, then save");
    } catch (err) {
      setTalkError(err instanceof ApiError ? err.message : "talk failed");
    } finally {
      setTalkBusy(false);
    }
  }

  async function save() {
    if (items.length === 0) {
      setError("at least one item required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await patchMealItems(meal.id, items);
      router.back();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "save failed");
      setBusy(false);
    }
  }

  function confirmDelete() {
    Alert.alert("Delete meal?", meal.meal_vibe ? `"${meal.meal_vibe}"` : "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await deleteMeal(meal.id);
            router.back();
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "delete failed");
            setBusy(false);
          }
        },
      },
    ]);
  }

  const dirty = JSON.stringify(items) !== JSON.stringify(original);
  const canSave = !busy && !addBusy && !talkBusy && items.length > 0 && dirty;

  // Backfilled meals carry the 23:59:59 marker — show "added later"
  // instead of a fake clock time, like the web does.
  const created = new Date(meal.created_at);
  const isBackfill =
    created.getHours() === 23 && created.getMinutes() === 59 && created.getSeconds() === 59;
  const ymd = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}-${String(created.getDate()).padStart(2, "0")}`;
  const timeLabel = isBackfill
    ? `${fmtDayLabel(ymd)} · added later`
    : `${fmtDayLabel(ymd)} · ${fmtTime(meal.created_at)}`;

  // Repeat lands on THIS meal's own day (its created_at calendar date),
  // stashed so the food tab inserts it / jumps there on focus.
  async function handleRepeat(scale: number) {
    const repeated = await repeatMeal(meal.id, { scale, forDate: ymd });
    stashNewMeal(repeated, ymd);
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.kav}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            accessibilityLabel="back"
            style={styles.backBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.backBtnText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{timeLabel.toUpperCase()}</Text>
          <TouchableOpacity
            onPress={confirmDelete}
            disabled={busy}
            accessibilityLabel="delete meal"
            style={styles.deleteBtn}
          >
            <Text style={styles.deleteBtnText}>delete</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Photo — tap to open the full-screen lightbox. */}
          {photoUrl ? (
            <Pressable
              onPress={() => setLightbox(true)}
              accessibilityLabel="open photo"
            >
              <Image
                source={{ uri: photoUrl }}
                style={styles.photo}
                contentFit="cover"
                transition={200}
                cachePolicy="memory-disk"
              />
            </Pressable>
          ) : meal.photo_filename ? (
            <View style={[styles.photo, styles.photoPlaceholder]}>
              <ActivityIndicator color={colors.textFaint} />
            </View>
          ) : null}

          {/* Caption / vibe / notes + repeat */}
          {meal.caption && <Text style={styles.caption}>“{meal.caption}”</Text>}
          <View style={styles.vibeRow}>
            {meal.meal_vibe ? (
              <View style={styles.vibePill}>
                <Text style={styles.vibeText}>{meal.meal_vibe}</Text>
              </View>
            ) : (
              <View />
            )}
            {!isLegacy && <RepeatButton onRepeat={handleRepeat} variant="detail" />}
          </View>
          {meal.notes && <Text style={styles.notes}>{meal.notes}</Text>}

          {isLegacy ? (
            <View style={styles.legacyCard}>
              <Text style={styles.legacyText}>
                This meal predates per-item nutrition. Delete and re-log to edit.
              </Text>
            </View>
          ) : (
            <>
              {/* Talk-to-fix */}
              <View style={styles.talkCard}>
                <Text style={styles.talkLabel}>QUICK FIX — TELL CLAUDE</Text>
                <TextInput
                  style={styles.talkInput}
                  value={talkMsg}
                  onChangeText={setTalkMsg}
                  placeholder="e.g. it's all plant / smaller portion / add olive oil"
                  placeholderTextColor={colors.textFaint}
                  multiline
                  maxLength={500}
                  editable={!talkBusy && !busy}
                  accessibilityLabel="talk to fix message"
                />
                <View style={styles.talkRow}>
                  <TouchableOpacity
                    style={[
                      styles.talkBtn,
                      (talkBusy || busy || !talkMsg.trim()) && styles.talkBtnDisabled,
                    ]}
                    onPress={talkFix}
                    disabled={talkBusy || busy || !talkMsg.trim()}
                    activeOpacity={0.8}
                  >
                    {talkBusy ? (
                      <View style={styles.talkBtnInner}>
                        <ActivityIndicator size="small" color="#fff" />
                        <Text style={styles.talkBtnText}>thinking…</Text>
                      </View>
                    ) : (
                      <Text style={styles.talkBtnText}>fix it</Text>
                    )}
                  </TouchableOpacity>
                  {talkError && <Text style={styles.talkError}>{talkError}</Text>}
                  {talkHint && !talkError && (
                    <Text style={styles.talkHint}>{talkHint}</Text>
                  )}
                </View>
              </View>

              {/* Items */}
              <View style={styles.itemsList}>
                {items.map((it, idx) => (
                  <EditItemRow
                    key={idx}
                    item={it}
                    onName={(v) => patchName(idx, v)}
                    onGrams={(v) => patchGrams(idx, v)}
                    onRemove={() => removeItem(idx)}
                    disabled={busy}
                  />
                ))}

                {adding ? (
                  <View style={styles.addCard}>
                    <TextInput
                      style={styles.addNameInput}
                      value={addName}
                      onChangeText={setAddName}
                      placeholder="e.g. olive oil, avocado, salmon"
                      placeholderTextColor={colors.textFaint}
                      editable={!addBusy}
                      autoFocus
                      accessibilityLabel="new item name"
                    />
                    <View style={styles.addRow}>
                      <TextInput
                        style={styles.addGramsInput}
                        value={addGrams}
                        onChangeText={setAddGrams}
                        placeholder="grams"
                        placeholderTextColor={colors.textFaint}
                        keyboardType="numeric"
                        editable={!addBusy}
                        accessibilityLabel="new item grams"
                      />
                      <TouchableOpacity
                        style={styles.addCancelBtn}
                        onPress={() => {
                          setAdding(false);
                          setAddName("");
                          setAddGrams("");
                          setAddError(null);
                        }}
                        disabled={addBusy}
                      >
                        <Text style={styles.addCancelText}>cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.addConfirmBtn, addBusy && styles.talkBtnDisabled]}
                        onPress={addItem}
                        disabled={addBusy}
                      >
                        <Text style={styles.addConfirmText}>
                          {addBusy ? "looking up…" : "add"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                    {addError && <Text style={styles.talkError}>{addError}</Text>}
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.addItemBtn}
                    onPress={() => setAdding(true)}
                    disabled={busy}
                  >
                    <Text style={styles.addItemBtnText}>+ add item</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}

          {error && (
            <View style={styles.errorCard}>
              <Text style={styles.errorCardText}>{error}</Text>
            </View>
          )}
        </ScrollView>

        {/* Sticky live totals + save bar */}
        {!isLegacy && (
          <View style={styles.saveBar}>
            <View style={styles.liveRow}>
              <LiveStat label="kcal" value={fmtCal(live.calories)} />
              <LiveStat label="sat" value={`${live.sat_fat_g.toFixed(1)}g`} />
              <LiveStat label="fib" value={`${live.soluble_fiber_g.toFixed(1)}g`} />
              <LiveStat label="pro" value={`${fmt(live.protein_g, 0)}g`} />
              <LiveStat label="plant" value={`${live.plant_pct}%`} />
            </View>
            <View style={styles.saveRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => router.back()}
                disabled={busy}
              >
                <Text style={styles.cancelBtnText}>cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
                onPress={save}
                disabled={!canSave}
                activeOpacity={0.8}
              >
                <Text style={styles.saveBtnText}>
                  {busy ? "saving…" : dirty ? "save" : "no changes"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>

      <PhotoLightbox
        uri={photoUrl}
        visible={lightbox}
        onClose={() => setLightbox(false)}
      />
    </SafeAreaView>
  );
}

function LiveStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.liveStat}>
      <Text style={styles.liveStatLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.liveStatValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  kav: {
    flex: 1,
  },
  missingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  missingText: {
    fontSize: 16,
    color: colors.textMuted,
  },
  missingBack: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  missingBackText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 8,
  },
  backBtn: {
    width: 40,
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
  },
  deleteBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  deleteBtnText: {
    fontSize: 12,
    color: colors.textSubtle,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: 16,
    gap: 14,
    paddingBottom: 24,
  },
  photo: {
    width: "100%",
    height: 220,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
  },
  photoPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  caption: {
    fontSize: 13,
    color: colors.textMuted,
    fontStyle: "italic",
    lineHeight: 19,
    paddingHorizontal: 4,
  },
  vibeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  vibePill: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(132,204,22,0.10)",
    borderWidth: 1,
    borderColor: "rgba(132,204,22,0.20)",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },
  vibeText: {
    fontSize: 11,
    fontWeight: "500",
    color: colors.accentLight,
  },
  notes: {
    fontSize: 12,
    color: colors.textMuted,
    fontStyle: "italic",
    lineHeight: 18,
    paddingHorizontal: 4,
  },
  legacyCard: {
    padding: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
  },
  legacyText: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 21,
  },
  talkCard: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    padding: 10,
    gap: 8,
  },
  talkLabel: {
    fontSize: 11,
    color: colors.textSubtle,
    letterSpacing: 0.5,
  },
  talkInput: {
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.sm,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: "top",
  },
  talkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  talkBtn: {
    backgroundColor: "#0c4a6e",
    borderRadius: radii.sm,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  talkBtnDisabled: {
    backgroundColor: "#3f3f46",
  },
  talkBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  talkBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  talkError: {
    flex: 1,
    fontSize: 11,
    color: colors.bad,
  },
  talkHint: {
    flex: 1,
    fontSize: 11,
    color: colors.accentBright,
  },
  itemsList: {
    gap: 8,
  },
  addCard: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderDashed,
    borderRadius: radii.sm,
    padding: 10,
    gap: 8,
  },
  addNameInput: {
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.sm,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  addRow: {
    flexDirection: "row",
    gap: 8,
  },
  addGramsInput: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.sm,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  addCancelBtn: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.sm,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  addCancelText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  addConfirmBtn: {
    backgroundColor: colors.accent,
    borderRadius: radii.sm,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  addConfirmText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  addItemBtn: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderDashed,
    borderRadius: radii.sm,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  addItemBtnText: {
    fontSize: 13,
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
  saveBar: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
    gap: 10,
  },
  liveRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  liveStat: {
    flex: 1,
  },
  liveStatLabel: {
    fontSize: 9,
    color: colors.textSubtle,
    letterSpacing: 0.5,
  },
  liveStatValue: {
    fontSize: 14,
    color: colors.text,
    fontWeight: "500",
  },
  saveRow: {
    flexDirection: "row",
    gap: 8,
  },
  cancelBtn: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.sm,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  cancelBtnText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  saveBtn: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: radii.sm,
    paddingVertical: 12,
    alignItems: "center",
  },
  saveBtnDisabled: {
    backgroundColor: "#3f3f46",
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});
