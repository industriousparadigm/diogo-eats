// Capture sheet — bottom sheet shown when the user taps the camera FAB.
// Two paths:
//   1. Photo: expo-image-picker (camera or library, up to 4 images),
//      client-side resize via expo-image-manipulator (max 2048px JPEG 0.85),
//      then POST /api/parse.
//   2. Text: text input → POST /api/parse-text.
//
// On submit, creates an optimistic PendingState visible in the Today
// list while the API call is in flight. Returns the pending item's id
// to the parent so it can track completion.

import { useState, useRef } from "react";
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

export type CaptureMode = "photo" | "text";

export type CaptureResult = {
  pendingId: string;
  kind: "photo" | "text";
  previewUri?: string;
  photoUris?: Array<{ uri: string; name: string; type: string }>;
  caption?: string;
  text?: string;
  photoCount?: number;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (result: CaptureResult) => void;
};

const MAX_PHOTOS = 4;

export function CaptureSheet({ visible, onClose, onSubmit }: Props) {
  const [mode, setMode] = useState<CaptureMode>("photo");
  const [pickedPhotos, setPickedPhotos] = useState<
    Array<{ uri: string; name: string; type: string }>
  >([]);
  const [caption, setCaption] = useState("");
  const [textInput, setTextInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pendingIdRef = useRef(0);

  function nextId() {
    pendingIdRef.current += 1;
    return `pending-${Date.now()}-${pendingIdRef.current}`;
  }

  function reset() {
    setPickedPhotos([]);
    setCaption("");
    setTextInput("");
    setError(null);
    setLoading(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function resizeImage(uri: string): Promise<{ uri: string; name: string; type: string }> {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 2048 } }],
      { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
    );
    const filename = result.uri.split("/").pop() ?? "photo.jpg";
    return { uri: result.uri, name: filename, type: "image/jpeg" };
  }

  async function pickFromCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      setError("Camera permission required");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: "images",
      allowsEditing: false,
      quality: 1,
    });
    if (result.canceled || result.assets.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const resized = await resizeImage(result.assets[0].uri);
      setPickedPhotos([resized]);
    } catch {
      setError("Could not process photo — try again");
    } finally {
      setLoading(false);
    }
  }

  async function pickFromLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      setError("Photo library permission required");
      return;
    }
    const remaining = MAX_PHOTOS - pickedPhotos.length;
    if (remaining <= 0) {
      setError(`Max ${MAX_PHOTOS} photos`);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 1,
    });
    if (result.canceled || result.assets.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const resized = await Promise.all(result.assets.map((a) => resizeImage(a.uri)));
      setPickedPhotos((prev) => [...prev, ...resized].slice(0, MAX_PHOTOS));
    } catch {
      setError("Could not process photos — try again");
    } finally {
      setLoading(false);
    }
  }

  function removePhoto(index: number) {
    setPickedPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmitPhoto() {
    if (pickedPhotos.length === 0) {
      setError("Pick at least one photo");
      return;
    }
    const id = nextId();
    onSubmit({
      pendingId: id,
      kind: "photo",
      previewUri: pickedPhotos[0].uri,
      photoUris: pickedPhotos,
      caption: caption.trim() || undefined,
      photoCount: pickedPhotos.length,
    });
    reset();
    onClose();
  }

  function handleSubmitText() {
    const text = textInput.trim();
    if (!text) {
      setError("Describe what you ate");
      return;
    }
    const id = nextId();
    onSubmit({
      pendingId: id,
      kind: "text",
      text,
    });
    reset();
    onClose();
  }

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
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Log a meal</Text>
            <View style={styles.closeBtn} />
          </View>

          {/* Mode selector */}
          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[styles.modeTab, mode === "photo" && styles.modeTabActive]}
              onPress={() => {
                setMode("photo");
                setError(null);
              }}
            >
              <Text
                style={[styles.modeTabText, mode === "photo" && styles.modeTabTextActive]}
              >
                Photo
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeTab, mode === "text" && styles.modeTabActive]}
              onPress={() => {
                setMode("text");
                setError(null);
              }}
            >
              <Text
                style={[styles.modeTabText, mode === "text" && styles.modeTabTextActive]}
              >
                Text
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
          >
            {mode === "photo" ? (
              <>
                {/* Photo picker buttons */}
                <View style={styles.pickRow}>
                  <TouchableOpacity
                    style={styles.pickButton}
                    onPress={pickFromCamera}
                    disabled={loading}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.pickButtonText}>Camera</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.pickButton}
                    onPress={pickFromLibrary}
                    disabled={loading || pickedPhotos.length >= MAX_PHOTOS}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.pickButtonText}>Library</Text>
                  </TouchableOpacity>
                </View>

                {/* Photo previews */}
                {pickedPhotos.length > 0 && (
                  <ScrollView horizontal style={styles.photoRow} showsHorizontalScrollIndicator={false}>
                    {pickedPhotos.map((p, i) => (
                      <View key={p.uri} style={styles.photoThumbWrap}>
                        <Image source={{ uri: p.uri }} style={styles.photoThumb} contentFit="cover" />
                        <Pressable style={styles.removeBtn} onPress={() => removePhoto(i)}>
                          <Text style={styles.removeBtnText}>✕</Text>
                        </Pressable>
                      </View>
                    ))}
                  </ScrollView>
                )}

                {loading && (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator color={colors.brand} />
                    <Text style={styles.loadingText}>Processing...</Text>
                  </View>
                )}

                {/* Optional caption */}
                <Text style={styles.captionLabel}>Caption (optional)</Text>
                <TextInput
                  style={styles.captionInput}
                  value={caption}
                  onChangeText={setCaption}
                  placeholder="small plate, homemade, at restaurant..."
                  placeholderTextColor={colors.textFaint}
                  multiline
                  maxLength={500}
                />

                {error && <Text style={styles.errorText}>{error}</Text>}

                <TouchableOpacity
                  style={[
                    styles.submitButton,
                    (pickedPhotos.length === 0 || loading) && styles.submitButtonDisabled,
                  ]}
                  onPress={handleSubmitPhoto}
                  disabled={pickedPhotos.length === 0 || loading}
                  activeOpacity={0.8}
                >
                  <Text style={styles.submitButtonText}>
                    {pickedPhotos.length > 0
                      ? `Parse ${pickedPhotos.length} photo${pickedPhotos.length > 1 ? "s" : ""}`
                      : "Pick a photo first"}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.captionLabel}>What did you eat?</Text>
                <TextInput
                  style={[styles.captionInput, styles.textInput]}
                  value={textInput}
                  onChangeText={setTextInput}
                  placeholder="a bowl of oatmeal with banana and chia seeds..."
                  placeholderTextColor={colors.textFaint}
                  multiline
                  maxLength={1000}
                  autoFocus
                />

                {error && <Text style={styles.errorText}>{error}</Text>}

                <TouchableOpacity
                  style={[
                    styles.submitButton,
                    !textInput.trim() && styles.submitButtonDisabled,
                  ]}
                  onPress={handleSubmitText}
                  disabled={!textInput.trim()}
                  activeOpacity={0.8}
                >
                  <Text style={styles.submitButtonText}>Parse</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
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
  title: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.text,
  },
  modeRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    padding: 4,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: radii.sm,
  },
  modeTabActive: {
    backgroundColor: colors.surface,
  },
  modeTabText: {
    fontSize: 14,
    color: colors.textSubtle,
    fontWeight: "500",
  },
  modeTabTextActive: {
    color: colors.text,
    fontWeight: "600",
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
  captionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textMuted,
    marginTop: 4,
  },
  captionInput: {
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.sm,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    minHeight: 44,
  },
  textInput: {
    minHeight: 120,
    textAlignVertical: "top",
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
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.4,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.bg,
  },
});
