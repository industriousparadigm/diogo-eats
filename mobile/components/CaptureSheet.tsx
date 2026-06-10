// Unified capture sheet — one sheet, no photo-vs-text mode chooser.
//
//   - Photo slot(s): camera + library (≤4), each thumbnail offers a crop
//     affordance (PhotoCropSheet). Camera shots use ImagePicker's native
//     allowsEditing crop; library picks get the in-app crop sheet.
//   - Text field: a caption/description that coexists with photos.
//   - Recent-meals repeat row: the last ~14 days, newest-first, searchable,
//     one tap re-logs verbatim (discoverable at logging time).
//   - Composer entry: jump to build-from-library (zero AI).
//
// Submit routes automatically:
//   photos present → /api/parse (multipart), text becomes the caption
//   text only      → /api/parse-text
//   nothing        → disabled
//
// Backfill (for_date) flows through to every path. The parent shows the
// optimistic pending card + retry from the returned CaptureResult.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { Image } from "expo-image";
import { colors, radii } from "@/lib/colors";
import { fmtDayLabel } from "@/lib/format";
import { fetchRecentMeals, repeatMeal } from "@/lib/api";
import { filterRecentMeals, recentMealLabel } from "@/lib/recentMeals";
import type { Meal } from "@/lib/types";
import { PhotoCropSheet } from "./PhotoCropSheet";

const IS_WEB = Platform.OS === "web";

export type CaptureResult = {
  pendingId: string;
  kind: "photo" | "text";
  previewUri?: string;
  photoUris?: Array<{ uri: string; name: string; type: string }>;
  caption?: string;
  text?: string;
  photoCount?: number;
  forDate?: string;
};

type PickedPhoto = { uri: string; name: string; type: string };

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (result: CaptureResult) => void;
  // A repeat fired from the recent row that lands on the viewed day.
  onRepeat?: (meal: Meal) => void;
  // Jump to the composer (build from library).
  onCompose?: () => void;
  // When set, captures log INTO this past day via for_date.
  forDate?: string;
};

const MAX_PHOTOS = 4;

export function CaptureSheet({
  visible,
  onClose,
  onSubmit,
  onRepeat,
  onCompose,
  forDate,
}: Props) {
  const [pickedPhotos, setPickedPhotos] = useState<PickedPhoto[]>([]);
  const [text, setText] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recent meals for the repeat row.
  const [recent, setRecent] = useState<Meal[] | null>(null);
  const [recentSearch, setRecentSearch] = useState("");
  const [repeatingId, setRepeatingId] = useState<string | null>(null);

  // Crop sheet target (index into pickedPhotos).
  const [cropIndex, setCropIndex] = useState<number | null>(null);

  const pendingIdRef = useRef(0);

  function nextId() {
    pendingIdRef.current += 1;
    return `pending-${Date.now()}-${pendingIdRef.current}`;
  }

  function reset() {
    setPickedPhotos([]);
    setText("");
    setError(null);
    setProcessing(false);
    setRecentSearch("");
    setRepeatingId(null);
    setCropIndex(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  // Load recent meals when the sheet opens.
  const loadRecent = useCallback(async () => {
    try {
      const meals = await fetchRecentMeals({ days: 14, limit: 50 });
      setRecent(meals);
    } catch {
      setRecent([]); // a failed load just hides the row, never blocks capture
    }
  }, []);

  useEffect(() => {
    if (visible) {
      setRecent(null);
      loadRecent();
    }
  }, [visible, loadRecent]);

  async function resizeImage(uri: string): Promise<PickedPhoto> {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 2048 } }],
      { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
    );
    const filename = result.uri.split("/").pop() ?? "photo.jpg";
    return { uri: result.uri, name: filename, type: "image/jpeg" };
  }

  async function pickFromCamera() {
    // Camera is native-only. On web, launchCameraAsync is unreliable, so
    // the button is hidden there and library (file dialog) covers it.
    if (IS_WEB) return;
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      setError("Camera permission required");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: "images",
      allowsEditing: true, // native iOS crop on the captured shot
      quality: 1,
    });
    if (result.canceled || result.assets.length === 0) return;
    setProcessing(true);
    setError(null);
    try {
      const resized = await resizeImage(result.assets[0].uri);
      setPickedPhotos((prev) => [...prev, resized].slice(0, MAX_PHOTOS));
    } catch {
      setError("Could not process photo — try again");
    } finally {
      setProcessing(false);
    }
  }

  async function pickFromLibrary() {
    const remaining = MAX_PHOTOS - pickedPhotos.length;
    if (remaining <= 0) {
      setError(`Max ${MAX_PHOTOS} photos`);
      return;
    }
    if (!IS_WEB) {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        setError("Photo library permission required");
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 1,
    });
    if (result.canceled || result.assets.length === 0) return;
    setProcessing(true);
    setError(null);
    try {
      const resized = await Promise.all(result.assets.map((a) => resizeImage(a.uri)));
      setPickedPhotos((prev) => [...prev, ...resized].slice(0, MAX_PHOTOS));
    } catch {
      setError("Could not process photos — try again");
    } finally {
      setProcessing(false);
    }
  }

  function removePhoto(index: number) {
    setPickedPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  function applyCrop(cropped: PickedPhoto) {
    setPickedPhotos((prev) =>
      prev.map((p, i) => (i === cropIndex ? cropped : p))
    );
    setCropIndex(null);
  }

  // One submit button — routes by content.
  function submit() {
    if (pickedPhotos.length > 0) {
      const id = nextId();
      onSubmit({
        pendingId: id,
        kind: "photo",
        previewUri: pickedPhotos[0].uri,
        photoUris: pickedPhotos,
        caption: text.trim() || undefined,
        photoCount: pickedPhotos.length,
        forDate,
      });
      reset();
      onClose();
      return;
    }
    const t = text.trim();
    if (!t) {
      setError("Add a photo or describe what you ate");
      return;
    }
    const id = nextId();
    onSubmit({ pendingId: id, kind: "text", text: t, forDate });
    reset();
    onClose();
  }

  async function onRepeatRecent(meal: Meal) {
    if (repeatingId) return;
    setRepeatingId(meal.id);
    setError(null);
    try {
      const repeated = await repeatMeal(meal.id, { scale: 1, forDate });
      onRepeat?.(repeated);
      reset();
      onClose();
    } catch {
      setError("Couldn't repeat that — try again");
      setRepeatingId(null);
    }
  }

  const filteredRecent = recent ? filterRecentMeals(recent, recentSearch) : [];
  const canSubmit = (pickedPhotos.length > 0 || text.trim().length > 0) && !processing;
  const cropTarget = cropIndex != null ? pickedPhotos[cropIndex] ?? null : null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.kav}
      >
        <View style={styles.sheet}>
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>Cancel</Text>
            </TouchableOpacity>
            <View style={styles.titleWrap}>
              <Text style={styles.title}>Log a meal</Text>
              {forDate && <Text style={styles.titleHint}>for {fmtDayLabel(forDate)}</Text>}
            </View>
            <View style={styles.closeBtn} />
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Photo slots */}
            <View style={styles.pickRow}>
              {!IS_WEB && (
                <TouchableOpacity
                  style={styles.pickButton}
                  onPress={pickFromCamera}
                  disabled={processing || pickedPhotos.length >= MAX_PHOTOS}
                  activeOpacity={0.8}
                  accessibilityLabel="take a photo"
                >
                  <Text style={styles.pickButtonText}>Camera</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.pickButton}
                onPress={pickFromLibrary}
                disabled={processing || pickedPhotos.length >= MAX_PHOTOS}
                activeOpacity={0.8}
                accessibilityLabel={IS_WEB ? "choose a photo" : "pick from library"}
              >
                <Text style={styles.pickButtonText}>{IS_WEB ? "Choose photo" : "Library"}</Text>
              </TouchableOpacity>
            </View>

            {pickedPhotos.length > 0 && (
              <ScrollView
                horizontal
                style={styles.photoRow}
                showsHorizontalScrollIndicator={false}
              >
                {pickedPhotos.map((p, i) => (
                  <View key={p.uri} style={styles.photoThumbWrap}>
                    <Image source={{ uri: p.uri }} style={styles.photoThumb} contentFit="cover" />
                    <Pressable style={styles.removeBtn} onPress={() => removePhoto(i)} accessibilityLabel="remove photo">
                      <Text style={styles.removeBtnText}>✕</Text>
                    </Pressable>
                    <Pressable
                      style={styles.cropBtn}
                      onPress={() => setCropIndex(i)}
                      accessibilityLabel="crop photo"
                    >
                      <Text style={styles.cropBtnText}>crop</Text>
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            )}

            {processing && (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={colors.brand} />
                <Text style={styles.loadingText}>Processing...</Text>
              </View>
            )}

            {/* Text field — coexists with photos (becomes the caption). */}
            <TextInput
              style={[styles.textInput, pickedPhotos.length > 0 && styles.textInputShort]}
              value={text}
              onChangeText={setText}
              placeholder={
                pickedPhotos.length > 0
                  ? "add a caption (optional)…"
                  : "describe what you ate, or add a photo…"
              }
              placeholderTextColor={colors.textFaint}
              multiline
              maxLength={1000}
            />

            {error && <Text style={styles.errorText}>{error}</Text>}

            <TouchableOpacity
              style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
              onPress={submit}
              disabled={!canSubmit}
              activeOpacity={0.8}
            >
              <Text style={styles.submitButtonText}>
                {pickedPhotos.length > 0
                  ? `Log ${pickedPhotos.length} photo${pickedPhotos.length > 1 ? "s" : ""}`
                  : "Log it"}
              </Text>
            </TouchableOpacity>

            {/* Compose from library entry. */}
            {onCompose && (
              <TouchableOpacity
                style={styles.composeBtn}
                onPress={() => {
                  reset();
                  onClose();
                  onCompose();
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.composeText}>+ build from your foods</Text>
              </TouchableOpacity>
            )}

            {/* Recent meals — one-tap repeat. */}
            <View style={styles.recentSection}>
              <Text style={styles.recentLabel}>RECENT — TAP TO LOG AGAIN</Text>
              {recent === null ? (
                <ActivityIndicator color={colors.textFaint} style={styles.recentLoader} />
              ) : recent.length === 0 ? (
                <Text style={styles.recentEmpty}>
                  Nothing logged in the last two weeks yet.
                </Text>
              ) : (
                <>
                  <TextInput
                    style={styles.recentSearch}
                    value={recentSearch}
                    onChangeText={setRecentSearch}
                    placeholder="search recent meals…"
                    placeholderTextColor={colors.textFaint}
                    autoComplete="off"
                  />
                  {filteredRecent.length === 0 ? (
                    <Text style={styles.recentEmpty}>No recent meal matches.</Text>
                  ) : (
                    filteredRecent.map((m) => (
                      <TouchableOpacity
                        key={m.id}
                        style={[styles.recentRow, repeatingId === m.id && styles.dim]}
                        onPress={() => onRepeatRecent(m)}
                        disabled={!!repeatingId}
                        activeOpacity={0.7}
                        accessibilityLabel={`log again: ${recentMealLabel(m)}`}
                      >
                        <View style={styles.recentRowMain}>
                          <Text style={styles.recentRowText} numberOfLines={1}>
                            {recentMealLabel(m)}
                          </Text>
                          <Text style={styles.recentRowSub} numberOfLines={1}>
                            {Math.round(m.calories)} kcal · {Math.round(m.plant_pct)}% plant
                          </Text>
                        </View>
                        <Text style={styles.recentRepeat}>
                          {repeatingId === m.id ? "…" : "↻"}
                        </Text>
                      </TouchableOpacity>
                    ))
                  )}
                </>
              )}
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      <PhotoCropSheet
        visible={cropIndex != null}
        photo={cropTarget}
        onCancel={() => setCropIndex(null)}
        onApply={applyCrop}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  kav: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  sheet: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeBtn: {
    width: 70,
  },
  closeBtnText: {
    fontSize: 16,
    color: colors.textMuted,
  },
  titleWrap: {
    alignItems: "center",
    gap: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.text,
  },
  titleHint: {
    fontSize: 11,
    color: colors.warn,
    fontWeight: "500",
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 40,
    gap: 12,
  },
  pickRow: {
    flexDirection: "row",
    gap: 12,
  },
  pickButton: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  pickButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
  },
  photoRow: {
    flexDirection: "row",
    marginTop: 4,
  },
  photoThumbWrap: {
    marginRight: 8,
    position: "relative",
  },
  photoThumb: {
    width: 100,
    height: 100,
    borderRadius: radii.md,
  },
  removeBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.7)",
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  removeBtnText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  cropBtn: {
    position: "absolute",
    bottom: 4,
    left: 4,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  cropBtnText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  loadingText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  textInput: {
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.sm,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    minHeight: 110,
    textAlignVertical: "top",
  },
  textInputShort: {
    minHeight: 56,
  },
  errorText: {
    fontSize: 13,
    color: colors.bad,
  },
  submitButton: {
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 4,
  },
  submitButtonDisabled: {
    opacity: 0.4,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.bg,
  },
  composeBtn: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderDashed,
    borderRadius: radii.sm,
    paddingVertical: 12,
    alignItems: "center",
  },
  composeText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  recentSection: {
    marginTop: 12,
    gap: 8,
  },
  recentLabel: {
    fontSize: 11,
    color: colors.textSubtle,
    letterSpacing: 0.5,
    fontWeight: "500",
  },
  recentLoader: {
    marginTop: 8,
    alignSelf: "flex-start",
  },
  recentEmpty: {
    fontSize: 13,
    color: colors.textFaint,
  },
  recentSearch: {
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.sm,
    paddingVertical: 9,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  recentRowMain: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  recentRowText: {
    fontSize: 14,
    color: colors.text,
  },
  recentRowSub: {
    fontSize: 11,
    color: colors.textFaint,
  },
  recentRepeat: {
    fontSize: 16,
    color: colors.textMuted,
  },
  dim: {
    opacity: 0.5,
  },
});
