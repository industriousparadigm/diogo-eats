// ScanScreenshotButton — the "kinda like eats" upload for movement. Pick a
// Strava / Apple Fitness / Garmin / treadmill screenshot from the library;
// the server reads its stats with Claude Vision and hands back parsed fields
// + the stored screenshot's filename. The caller prefills its form for review
// — nothing is logged until the user confirms.
//
// Shared by the quick-log sheet (new run) and the edit sheet (attach a
// screenshot to an existing one). One image at a time. Busy + error states
// inline; a cancel from the picker is a silent no-op.

import { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { palette, fontSize, spacing } from "@/lib/theme";
import { Button } from "@/components/ui";
import { ApiError, parseActivityPhoto } from "@/lib/api";
import type { ParsedActivity } from "@/lib/activityTypes";

export function ScanScreenshotButton({
  onParsed,
  accent,
  label = "📷 Scan a screenshot",
}: {
  // Called with the AI's read + the stored screenshot filename to attach.
  onParsed: (parsed: ParsedActivity, photoFilename: string) => void;
  accent?: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick() {
    setError(null);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== "granted") {
        setError("photo library permission needed");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        quality: 1,
      });
      if (result.canceled || !result.assets?.[0]) return; // silent cancel
      const asset = result.assets[0];
      setBusy(true);
      const { parsed, photo_filename } = await parseActivityPhoto({
        uri: asset.uri,
        name: asset.fileName ?? "screenshot.jpg",
        type: asset.mimeType ?? "image/jpeg",
      });
      onParsed(parsed, photo_filename);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "couldn't read that screenshot");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Button
        label={busy ? "reading…" : label}
        variant="secondary"
        accent={accent ?? palette.strength.brand}
        onPress={pick}
        disabled={busy}
        accessibilityLabel="scan screenshot"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  error: { fontSize: fontSize.caption, color: palette.danger },
});
