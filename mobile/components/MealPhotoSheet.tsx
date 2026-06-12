// Single-photo pick sheet for attaching / replacing a meal's photo AFTER
// it's been logged. This is the VISUAL RECORD only — picking a photo here
// never re-parses the meal; the items/numbers are untouched.
//
// It deliberately reuses the capture flow's exact pick paths so a photo
// attached later looks identical to one captured at log time:
//   - Camera: ImagePicker's native allowsEditing crop on the shot.
//   - Library: pick one, then the in-app PhotoCropSheet (the gesture-fixed
//     crop sheet — reused verbatim, not forked).
// Both resize to 2048/JPEG client-side (the server normalizes again).
//
// The parent owns the upload + meal state; this sheet only hands back one
// resolved { uri, name, type } via onPicked. When `hasPhoto` it also offers
// a quiet "remove photo" row (onRemove) so replace and remove share one
// entry point without a second affordance crowding the detail screen.

import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Platform,
  ActivityIndicator,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { palette, radii, borders, fontSize, spacing } from "@/lib/theme";
import { PhotoCropSheet } from "./PhotoCropSheet";

const IS_WEB = Platform.OS === "web";

export type PickedPhoto = { uri: string; name: string; type: string };

type Props = {
  visible: boolean;
  // True when the meal already has a photo — switches the copy to "replace"
  // and reveals the remove row.
  hasPhoto: boolean;
  onClose: () => void;
  onPicked: (photo: PickedPhoto) => void;
  onRemove?: () => void;
};

export function MealPhotoSheet({ visible, hasPhoto, onClose, onPicked, onRemove }: Props) {
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A library pick lands here first, awaiting the crop sheet.
  const [cropTarget, setCropTarget] = useState<PickedPhoto | null>(null);

  function reset() {
    setProcessing(false);
    setError(null);
    setCropTarget(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

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
    if (IS_WEB) return; // camera button is hidden on web; library covers it
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
      handleClose();
      onPicked(resized);
    } catch {
      setError("Could not process photo — try again");
      setProcessing(false);
    }
  }

  async function pickFromLibrary() {
    if (!IS_WEB) {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        setError("Photo library permission required");
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsMultipleSelection: false,
      quality: 1,
    });
    if (result.canceled || result.assets.length === 0) return;
    setProcessing(true);
    setError(null);
    try {
      const resized = await resizeImage(result.assets[0].uri);
      // Library picks get the in-app crop sheet (mirrors capture).
      setCropTarget(resized);
    } catch {
      setError("Could not process photo — try again");
    } finally {
      setProcessing(false);
    }
  }

  function applyCrop(cropped: PickedPhoto) {
    setCropTarget(null);
    handleClose();
    onPicked(cropped);
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.sheet}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{hasPhoto ? "Replace photo" : "Add photo"}</Text>
          <View style={styles.closeBtn} />
        </View>

        <View style={styles.body}>
          <Text style={styles.hint}>
            A photo is the visual record only. It won't change this meal's items
            or numbers.
          </Text>

          <View style={styles.pickRow}>
            {!IS_WEB && (
              <TouchableOpacity
                style={styles.pickButton}
                onPress={pickFromCamera}
                disabled={processing}
                activeOpacity={0.8}
                accessibilityLabel="take a photo"
              >
                <Text style={styles.pickButtonText}>Camera</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.pickButton}
              onPress={pickFromLibrary}
              disabled={processing}
              activeOpacity={0.8}
              accessibilityLabel={IS_WEB ? "choose a photo" : "pick from library"}
            >
              <Text style={styles.pickButtonText}>{IS_WEB ? "Choose photo" : "Library"}</Text>
            </TouchableOpacity>
          </View>

          {processing && (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={palette.food.accent} />
              <Text style={styles.loadingText}>Processing...</Text>
            </View>
          )}

          {error && <Text style={styles.errorText}>{error}</Text>}

          {hasPhoto && onRemove && (
            <TouchableOpacity
              style={styles.removeRow}
              onPress={() => {
                handleClose();
                onRemove();
              }}
              disabled={processing}
              accessibilityLabel="remove photo"
            >
              <Text style={styles.removeRowText}>Remove photo</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <PhotoCropSheet
        visible={cropTarget != null}
        photo={cropTarget}
        onCancel={() => setCropTarget(null)}
        onApply={applyCrop}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: borders.bold,
    borderBottomColor: palette.ink,
  },
  closeBtn: {
    width: 70,
  },
  closeBtnText: {
    fontSize: fontSize.title,
    color: palette.textMuted,
  },
  title: {
    fontSize: fontSize.lead,
    fontWeight: "800",
    color: palette.text,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.lg,
  },
  hint: {
    fontSize: fontSize.caption,
    color: palette.textMuted,
    lineHeight: 19,
  },
  pickRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  pickButton: {
    flex: 1,
    backgroundColor: palette.surface,
    borderRadius: radii.md,
    paddingVertical: spacing.lg,
    alignItems: "center",
    borderWidth: borders.bold,
    borderColor: palette.ink,
  },
  pickButtonText: {
    fontSize: fontSize.bodyLg,
    fontWeight: "700",
    color: palette.text,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  loadingText: {
    fontSize: fontSize.caption,
    color: palette.textMuted,
  },
  errorText: {
    fontSize: fontSize.caption,
    color: palette.danger,
  },
  removeRow: {
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  removeRowText: {
    fontSize: fontSize.caption,
    color: palette.danger,
    fontWeight: "600",
  },
});
