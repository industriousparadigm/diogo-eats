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
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import { palette, radii, borders, fontSize, spacing } from "@/lib/theme";
import { Card, Chip, SectionHeader, Button, StatNumber, SkeletonBlock, Input, KeyboardAwareScrollView } from "@/components/ui";
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

      <KeyboardAwareScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        footer={
          /* Sticky live totals + save bar — rides up with the keyboard so a
             focused item / quick-fix field above it stays visible. */
          !isLegacy ? (
            <View style={styles.saveBar}>
              <View style={styles.liveRow}>
                <StatNumber label="kcal" value={fmtCal(live.calories)} align="left" />
                <StatNumber label="sat" value={`${live.sat_fat_g.toFixed(1)}g`} align="left" />
                <StatNumber label="fib" value={`${live.soluble_fiber_g.toFixed(1)}g`} align="left" />
                <StatNumber label="pro" value={`${fmt(live.protein_g, 0)}g`} align="left" />
                <StatNumber label="plant" value={`${live.plant_pct}%`} color={palette.food.accent} align="left" />
              </View>
              <View style={styles.saveRow}>
                <Button
                  label="cancel"
                  variant="secondary"
                  accent={palette.textMuted}
                  onPress={() => router.back()}
                  disabled={busy}
                  style={styles.cancelBtn}
                />
                <Button
                  label={busy ? "saving…" : dirty ? "save" : "no changes"}
                  variant="primary"
                  onPress={save}
                  disabled={!canSave}
                  style={styles.saveBtn}
                />
              </View>
            </View>
          ) : undefined
        }
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
            // Signed URL still resolving — a skeleton block in the photo's
            // footprint, not a bare spinner on an empty frame.
            <SkeletonBlock height={220} radius={radii.md} tone="bright" style={styles.photo} />
          ) : null}

          {/* Caption / vibe / notes + repeat */}
          {meal.caption && <Text style={styles.caption}>“{meal.caption}”</Text>}
          <View style={styles.vibeRow}>
            {meal.meal_vibe ? (
              <Chip label={meal.meal_vibe} tone="accent" identity={palette.food.accentDeep} />
            ) : (
              <View />
            )}
            {!isLegacy && <RepeatButton onRepeat={handleRepeat} variant="detail" />}
          </View>
          {meal.notes && <Text style={styles.notes}>{meal.notes}</Text>}

          {isLegacy ? (
            <Card style={styles.legacyCard}>
              <Text style={styles.legacyText}>
                This meal predates per-item nutrition. Delete and re-log to edit.
              </Text>
            </Card>
          ) : (
            <>
              {/* Talk-to-fix */}
              <Card tone="recessed" style={styles.talkCard}>
                <SectionHeader>QUICK FIX — TELL CLAUDE</SectionHeader>
                <Input
                  variant="multiline"
                  value={talkMsg}
                  onChangeText={setTalkMsg}
                  placeholder="e.g. it's all plant / smaller portion / add olive oil"
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
                        <ActivityIndicator size="small" color={palette.onAccent} />
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
              </Card>

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
                    <Input
                      value={addName}
                      onChangeText={setAddName}
                      placeholder="e.g. olive oil, avocado, salmon"
                      editable={!addBusy}
                      autoFocus
                      accessibilityLabel="new item name"
                    />
                    <View style={styles.addRow}>
                      <Input
                        style={styles.addGramsInput}
                        variant="numeric"
                        suffix="g"
                        value={addGrams}
                        onChangeText={setAddGrams}
                        placeholder="grams"
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
      </KeyboardAwareScrollView>

      <PhotoLightbox
        uri={photoUrl}
        visible={lightbox}
        onClose={() => setLightbox(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  missingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
  },
  missingText: {
    fontSize: fontSize.title,
    color: palette.textMuted,
  },
  missingBack: {
    backgroundColor: "transparent",
    borderWidth: borders.bold,
    borderColor: palette.ink,
    borderRadius: radii.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  missingBackText: {
    color: palette.text,
    fontSize: fontSize.body,
    fontWeight: "700",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: borders.bold,
    borderBottomColor: palette.ink,
    gap: spacing.sm,
  },
  backBtn: {
    width: 40,
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
    letterSpacing: 1,
  },
  deleteBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  deleteBtnText: {
    fontSize: fontSize.caption,
    color: palette.danger,
    fontWeight: "600",
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  photo: {
    width: "100%",
    height: 220,
    borderRadius: radii.md,
    backgroundColor: palette.surfaceMuted,
    borderWidth: borders.chunky,
    borderColor: palette.ink,
  },
  caption: {
    fontSize: fontSize.caption,
    color: palette.textMuted,
    fontStyle: "italic",
    lineHeight: 19,
    paddingHorizontal: spacing.xs,
  },
  vibeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  notes: {
    fontSize: fontSize.caption,
    color: palette.textMuted,
    fontStyle: "italic",
    lineHeight: 18,
    paddingHorizontal: spacing.xs,
  },
  legacyCard: {
    padding: spacing.lg,
  },
  legacyText: {
    fontSize: fontSize.body,
    color: palette.textMuted,
    lineHeight: 21,
  },
  talkCard: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  talkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  talkBtn: {
    backgroundColor: palette.food.accentDeep,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: 9,
  },
  talkBtnDisabled: {
    backgroundColor: palette.inkSoft,
  },
  talkBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  talkBtnText: {
    color: palette.onAccent,
    fontSize: fontSize.caption,
    fontWeight: "800",
  },
  talkError: {
    flex: 1,
    fontSize: fontSize.label,
    color: palette.danger,
  },
  talkHint: {
    flex: 1,
    fontSize: fontSize.label,
    color: palette.food.accentBright,
  },
  itemsList: {
    gap: spacing.sm,
  },
  addCard: {
    backgroundColor: palette.surfaceAlt,
    borderWidth: borders.hairline,
    borderStyle: "dashed",
    borderColor: palette.borderDashed,
    borderRadius: radii.sm,
    padding: spacing.md,
    gap: spacing.sm,
  },
  addRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  addGramsInput: {
    flex: 1,
  },
  addCancelBtn: {
    borderWidth: borders.bold,
    borderColor: palette.inkSoft,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.lg,
    justifyContent: "center",
  },
  addCancelText: {
    color: palette.textMuted,
    fontSize: fontSize.caption,
  },
  addConfirmBtn: {
    backgroundColor: palette.food.accent,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.lg,
    justifyContent: "center",
  },
  addConfirmText: {
    color: palette.onAccent,
    fontSize: fontSize.caption,
    fontWeight: "800",
  },
  addItemBtn: {
    borderWidth: borders.hairline,
    borderStyle: "dashed",
    borderColor: palette.borderDashed,
    borderRadius: radii.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  addItemBtnText: {
    fontSize: fontSize.caption,
    color: palette.textMuted,
  },
  errorCard: {
    backgroundColor: "#7f1d1d",
    padding: spacing.md,
    borderRadius: radii.sm,
  },
  errorCardText: {
    fontSize: fontSize.caption,
    color: palette.white,
  },
  saveBar: {
    borderTopWidth: borders.bold,
    borderTopColor: palette.ink,
    backgroundColor: palette.bg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  liveRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  saveRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  cancelBtn: {
    paddingHorizontal: spacing.xl,
  },
  saveBtn: {
    flex: 1,
  },
});
