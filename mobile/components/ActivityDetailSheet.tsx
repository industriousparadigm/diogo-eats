// ActivityDetailSheet — tap a timeline activity card → a small detail/edit
// sheet. Edit every field (PATCH), adjust the start time without a heavy
// datetime dep (day-back + hour steppers — the seed's placeholder 11:00 is
// exactly the case this fixes), and delete from inside.
//
// Pre-filled from the tapped activity. Save → PATCH → hand the updated row
// back. Delete → confirm → DELETE → hand the deleted id back. The caller
// reconciles the timeline. The sheet wears the activity type's identity.

import { useState, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { palette, radii, borders, fontSize, spacing, condensedFamily } from "@/lib/theme";
import {
  Chip,
  SectionHeader,
  Button,
  Input,
  KeyboardAwareScrollView,
} from "@/components/ui";
import { MovementImage } from "@/components/MovementImage";
import { ScanScreenshotButton } from "@/components/ScanScreenshotButton";
import { movementType } from "@/lib/movementTypes";
import {
  EFFORTS,
  validateQuickLog,
  stepDays,
  stepHours,
  fmtDaysBack,
  fmtClock,
  fmtPace,
  surfaceOptions,
  type QuickLogDraft,
  type Surface,
} from "@/lib/movementLog";
import { ApiError, updateActivity, deleteActivity, resolvePhotoUrl } from "@/lib/api";
import type { Activity, ActivityEffort, ParsedActivity } from "@/lib/activityTypes";

export function ActivityDetailSheet({
  activity,
  visible,
  onClose,
  onUpdated,
  onDeleted,
}: {
  // The activity being viewed/edited. Null while closed.
  activity: Activity | null;
  visible: boolean;
  onClose: () => void;
  onUpdated: (activity: Activity) => void;
  onDeleted: (id: string) => void;
}) {
  if (!activity) return null;
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <Editor
        activity={activity}
        onClose={onClose}
        onUpdated={onUpdated}
        onDeleted={onDeleted}
      />
    </Modal>
  );
}

// Keyed by activity id at the call site so fields re-init when a different
// card is opened.
function Editor({
  activity,
  onClose,
  onUpdated,
  onDeleted,
}: {
  activity: Activity;
  onClose: () => void;
  onUpdated: (activity: Activity) => void;
  onDeleted: (id: string) => void;
}) {
  const def = movementType(activity.type);
  const id = def.identity;

  const [durationText, setDurationText] = useState(String(activity.duration_min));
  const [effort, setEffort] = useState<ActivityEffort | null>(activity.effort);
  const [label, setLabel] = useState(activity.label ?? "");
  const [note, setNote] = useState(activity.note ?? "");
  const [distanceText, setDistanceText] = useState(
    activity.distance_km != null ? String(activity.distance_km) : ""
  );
  const [surface, setSurface] = useState<Surface | null>(
    (activity.surface as Surface | null) ?? null
  );
  const [elevationText, setElevationText] = useState(
    activity.elevation_m != null ? String(activity.elevation_m) : ""
  );
  const [photoFilename, setPhotoFilename] = useState<string | null>(activity.photo_filename);
  const [scanSummary, setScanSummary] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(activity.started_at);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resolve the stored screenshot (if any) to a signed URL for the hero.
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!photoFilename) {
      setPhotoUrl(null);
      return;
    }
    let cancelled = false;
    resolvePhotoUrl(photoFilename)
      .then((url) => !cancelled && setPhotoUrl(url))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [photoFilename]);

  const surfaces = surfaceOptions(activity.type);
  const pace = fmtPace(Number(distanceText) || null, Number(durationText) || null);

  // A re-scan from inside the editor: prefill the editable fields + attach the
  // new screenshot. Type is fixed here (you're editing one activity), so we
  // don't change it.
  function applyParsed(parsed: ParsedActivity, filename: string) {
    if (parsed.duration_min != null) setDurationText(String(parsed.duration_min));
    if (parsed.distance_km != null) setDistanceText(String(parsed.distance_km));
    if (parsed.surface != null) setSurface(parsed.surface as Surface);
    if (parsed.elevation_m != null) setElevationText(String(parsed.elevation_m));
    if (parsed.started_at != null) setStartedAt(parsed.started_at);
    setPhotoFilename(filename);
    setScanSummary(parsed.summary || null);
    setError(null);
  }

  async function save() {
    setError(null);
    const draft: QuickLogDraft = {
      type: activity.type,
      durationText,
      effort,
      label,
      note,
      distanceText,
      surface,
      elevationText,
      photoFilename,
      startedAt,
    };
    const result = validateQuickLog(draft, Date.now(), def.distance);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setBusy(true);
    try {
      // PATCH every editable field; nullables clear by sending null.
      const updated = await updateActivity(activity.id, {
        duration_min: result.input.duration_min,
        started_at: result.input.started_at,
        effort: result.input.effort ?? null,
        distance_km: result.input.distance_km ?? null,
        surface: result.input.surface ?? null,
        elevation_m: result.input.elevation_m ?? null,
        photo_filename: result.input.photo_filename ?? null,
        label: result.input.label ?? null,
        note: result.input.note ?? null,
      });
      onUpdated(updated);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "couldn't save");
      setBusy(false);
    }
  }

  function confirmDelete() {
    Alert.alert("Delete this?", `${def.name}${activity.label ? ` · ${activity.label}` : ""}`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          try {
            await deleteActivity(activity.id);
            onDeleted(activity.id);
            onClose();
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "couldn't delete");
            setBusy(false);
          }
        },
      },
    ]);
  }

  const canStepForward = fmtDaysBack(startedAt, Date.now()) !== "today";

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: id.bright }]}>{def.name}</Text>
        <TouchableOpacity onPress={onClose} accessibilityLabel="close" hitSlop={12}>
          <Text style={styles.close}>✕</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={styles.content}
        footer={
          <View style={styles.footer}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.footerRow}>
              <Button
                label="delete"
                variant="secondary"
                accent={palette.danger}
                onPress={confirmDelete}
                disabled={busy}
                accessibilityLabel="delete"
                style={styles.deleteBtn}
              />
              <Button
                label={busy ? "saving…" : "save"}
                variant="primary"
                accent={id.accent}
                onPress={save}
                disabled={busy}
                accessibilityLabel="save"
                style={styles.saveBtn}
              />
            </View>
          </View>
        }
      >
        {/* Hero: the attached screenshot if there is one, else the type's
            photo — keeps the card's identity in the sheet. */}
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={styles.hero} contentFit="cover" transition={150} />
        ) : (
          <MovementImage type={activity.type} style={styles.hero} />
        )}

        {/* Re-scan / attach a screenshot to this activity. */}
        <ScanScreenshotButton onParsed={applyParsed} accent={id.accent} label="📷 Scan a screenshot" />
        {scanSummary ? <Text style={styles.scanSummary}>read: {scanSummary}</Text> : null}

        <SectionHeader color={id.accent} style={styles.section}>
          HOW LONG?
        </SectionHeader>
        <Input
          variant="numeric"
          value={durationText}
          onChangeText={setDurationText}
          suffix="min"
          accent={id.accent}
          accessibilityLabel="duration minutes"
          maxLength={4}
        />

        <SectionHeader style={styles.section}>HOW HARD?</SectionHeader>
        <View style={styles.chipRow}>
          {EFFORTS.map((e) => {
            const on = effort === e;
            return (
              <TouchableOpacity
                key={e}
                onPress={() => setEffort(on ? null : e)}
                accessibilityLabel={`effort ${e}`}
              >
                <Chip label={`felt ${e}`} tone={on ? "accent" : "outline"} identity={id.bright} />
              </TouchableOpacity>
            );
          })}
        </View>

        {def.distance ? (
          <>
            <SectionHeader style={styles.section}>DISTANCE</SectionHeader>
            <Input
              variant="decimal"
              value={distanceText}
              onChangeText={setDistanceText}
              suffix="km"
              accent={id.accent}
              accessibilityLabel="distance km"
              placeholder="e.g. 5.2"
            />
            {pace ? <Text style={[styles.pace, { color: id.bright }]}>{pace}</Text> : null}
          </>
        ) : null}

        {surfaces.length > 0 ? (
          <>
            <SectionHeader style={styles.section}>SURFACE</SectionHeader>
            <View style={styles.chipRow}>
              {surfaces.map((s) => {
                const on = surface === s;
                return (
                  <TouchableOpacity
                    key={s}
                    onPress={() => setSurface(on ? null : s)}
                    accessibilityLabel={`surface ${s}`}
                  >
                    <Chip label={s} tone={on ? "accent" : "outline"} identity={id.bright} />
                  </TouchableOpacity>
                );
              })}
            </View>
            <SectionHeader style={styles.section}>ELEVATION GAIN</SectionHeader>
            <Input
              variant="numeric"
              value={elevationText}
              onChangeText={setElevationText}
              suffix="m"
              accent={id.accent}
              accessibilityLabel="elevation meters"
              placeholder="e.g. 320"
              maxLength={5}
            />
          </>
        ) : null}

        <SectionHeader style={styles.section}>DETAILS</SectionHeader>
        <Input
          value={label}
          onChangeText={setLabel}
          placeholder="label"
          accent={id.accent}
          accessibilityLabel="label"
          maxLength={120}
        />
        <Input
          variant="multiline"
          value={note}
          onChangeText={setNote}
          placeholder="note"
          accent={id.accent}
          accessibilityLabel="note"
          maxLength={500}
          style={styles.noteField}
        />

        {/* WHEN — day stepper + hour stepper, no datetime dep. */}
        <SectionHeader style={styles.section}>WHEN?</SectionHeader>
        <View style={styles.whenRow}>
          <View style={styles.stepper}>
            <TouchableOpacity
              onPress={() => setStartedAt((ms) => stepDays(ms, -1))}
              style={styles.stepBtn}
              accessibilityLabel="earlier day"
            >
              <Text style={styles.stepBtnText}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.stepValue}>{fmtDaysBack(startedAt, Date.now())}</Text>
            <TouchableOpacity
              onPress={() => canStepForward && setStartedAt((ms) => stepDays(ms, 1))}
              disabled={!canStepForward}
              style={[styles.stepBtn, !canStepForward && styles.stepBtnDisabled]}
              accessibilityLabel="later day"
            >
              <Text style={styles.stepBtnText}>›</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.stepper}>
            <TouchableOpacity
              onPress={() => setStartedAt((ms) => stepHours(ms, -1))}
              style={styles.stepBtn}
              accessibilityLabel="earlier hour"
            >
              <Text style={styles.stepBtnText}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.stepValue}>{fmtClock(startedAt)}</Text>
            <TouchableOpacity
              onPress={() => setStartedAt((ms) => stepHours(ms, 1))}
              style={styles.stepBtn}
              accessibilityLabel="later hour"
            >
              <Text style={styles.stepBtnText}>›</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: borders.bold,
    borderBottomColor: palette.ink,
  },
  title: {
    fontSize: fontSize.display,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  close: { fontSize: fontSize.lead, color: palette.textMuted, fontWeight: "700" },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },
  section: { marginTop: spacing.md },
  hero: {
    width: "100%",
    height: 160,
    borderRadius: radii.sm,
    backgroundColor: palette.surfaceMuted,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  noteField: { marginTop: spacing.sm },
  scanSummary: {
    fontSize: fontSize.caption,
    color: palette.textMuted,
    fontStyle: "italic",
    marginTop: spacing.xs,
  },
  pace: {
    fontFamily: condensedFamily,
    fontSize: fontSize.bodyLg,
    fontWeight: "800",
    marginTop: spacing.xs,
    letterSpacing: condensedFamily ? 0.2 : -0.3,
  },
  whenRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  stepper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: palette.surfaceMuted,
    borderWidth: borders.bold,
    borderColor: palette.inkSoft,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  stepBtn: { width: 40, height: 36, alignItems: "center", justifyContent: "center" },
  stepBtnDisabled: { opacity: 0.3 },
  stepBtnText: { fontSize: 24, color: palette.text, fontWeight: "700", lineHeight: 28 },
  stepValue: {
    fontSize: fontSize.body,
    fontWeight: "700",
    color: palette.text,
    flex: 1,
    textAlign: "center",
  },
  footer: {
    borderTopWidth: borders.bold,
    borderTopColor: palette.ink,
    backgroundColor: palette.bg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  footerRow: { flexDirection: "row", gap: spacing.sm },
  deleteBtn: { paddingHorizontal: spacing.lg },
  saveBtn: { flex: 1 },
  error: { fontSize: fontSize.caption, color: palette.danger },
});
