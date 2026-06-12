// QuickLogSheet — the 5-second "+ log movement" flow. A pageSheet modal:
//
//   1. TYPE GRID (the pop moment): image cards, two-up, each in its type's
//      color identity — picking padel should feel like picking an exercise
//      in the gym picker. Tapping a tile selects it (loud border lights up).
//   2. DURATION: a numeric Input (smart default 60) + quick chips 30/45/60/90.
//   3. EFFORT: optional felt-light/moderate/hard chips.
//   4. LABEL / NOTE: optional text. DISTANCE only for distance-y types.
//   5. WHEN: defaults today; a simple day-back stepper for backfill.
//
// Validation mirrors the server (lib/movementLog) so a bad value never
// round-trips. Submit → createActivity → hand the new row back to the
// caller, which drops it into the timeline. KeyboardAware throughout.

import { useState } from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  palette,
  radii,
  borders,
  fontSize,
  spacing,
  condensedFamily,
} from "@/lib/theme";
import {
  Card,
  Chip,
  SectionHeader,
  Button,
  Input,
  KeyboardAwareScrollView,
} from "@/components/ui";
import { MovementImage } from "@/components/MovementImage";
import { ACTIVITY_GRID_TYPES, movementType } from "@/lib/movementTypes";
import {
  EFFORTS,
  validateQuickLog,
  stepDays,
  fmtDaysBack,
  type QuickLogDraft,
} from "@/lib/movementLog";
import { ApiError, createActivity } from "@/lib/api";
import type { Activity, ActivityEffort } from "@/lib/activityTypes";

const DURATION_CHIPS = [30, 45, 60, 90];
const DEFAULT_DURATION = "60";

export function QuickLogSheet({
  visible,
  onClose,
  onLogged,
}: {
  visible: boolean;
  onClose: () => void;
  // The new activity, for the caller to splice into the timeline.
  onLogged: (activity: Activity) => void;
}) {
  const [type, setType] = useState<string | null>(null);
  const [durationText, setDurationText] = useState(DEFAULT_DURATION);
  const [effort, setEffort] = useState<ActivityEffort | null>(null);
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [distanceText, setDistanceText] = useState("");
  const [startedAt, setStartedAt] = useState(() => Date.now());

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const def = type ? movementType(type) : null;
  const distanceEnabled = def?.distance ?? false;

  function reset() {
    setType(null);
    setDurationText(DEFAULT_DURATION);
    setEffort(null);
    setLabel("");
    setNote("");
    setDistanceText("");
    setStartedAt(Date.now());
    setError(null);
    setBusy(false);
  }

  function close() {
    reset();
    onClose();
  }

  async function submit() {
    setError(null);
    const draft: QuickLogDraft = {
      type: type ?? "",
      durationText,
      effort,
      label,
      note,
      distanceText,
      startedAt,
    };
    const result = validateQuickLog(draft, Date.now(), distanceEnabled);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setBusy(true);
    try {
      const activity = await createActivity(result.input);
      onLogged(activity);
      close();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "couldn't log that");
      setBusy(false);
    }
  }

  // Day-back stepper bounds: never forward past today, never back past a year.
  const canStepForward = fmtDaysBack(startedAt, Date.now()) !== "today";
  const dayLabel = fmtDaysBack(startedAt, Date.now());

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.header}>
          <Text style={styles.title}>Log movement</Text>
          <TouchableOpacity onPress={close} accessibilityLabel="close" hitSlop={12}>
            <Text style={styles.close}>✕</Text>
          </TouchableOpacity>
        </View>

        <KeyboardAwareScrollView
          contentContainerStyle={styles.content}
          footer={
            <View style={styles.footer}>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Button
                label={busy ? "logging…" : "Log it"}
                variant="primary"
                accent={def?.identity.accent ?? palette.strength.brand}
                size="lg"
                onPress={submit}
                disabled={busy || !type}
                accessibilityLabel="log it"
              />
            </View>
          }
        >
          {/* TYPE GRID — the pop. Image cards, two-up, each its own identity. */}
          <SectionHeader color={palette.strength.brand}>WHAT DID YOU DO?</SectionHeader>
          <View style={styles.grid}>
            {ACTIVITY_GRID_TYPES.map((t) => {
              const selected = t.type === type;
              return (
                <Pressable
                  key={t.type}
                  onPress={() => {
                    setType(t.type);
                    setError(null);
                  }}
                  accessibilityLabel={`type ${t.name}`}
                  style={styles.gridCell}
                >
                  <Card
                    identity={selected ? t.identity.accent : palette.inkSoft}
                    depth="loud"
                    flat={!selected}
                    tint={selected ? t.identity.soft : undefined}
                    dimmed={type != null && !selected}
                    style={styles.tile}
                  >
                    <MovementImage type={t.type} style={styles.tileImage} />
                    <Text
                      style={[
                        styles.tileName,
                        { color: selected ? t.identity.bright : palette.text },
                      ]}
                    >
                      {t.name}
                    </Text>
                  </Card>
                </Pressable>
              );
            })}
          </View>

          {/* DURATION */}
          <SectionHeader color={palette.strength.brand} style={styles.section}>
            HOW LONG?
          </SectionHeader>
          <Input
            variant="numeric"
            value={durationText}
            onChangeText={setDurationText}
            suffix="min"
            accent={def?.identity.accent ?? palette.strength.brand}
            accessibilityLabel="duration minutes"
            maxLength={4}
          />
          <View style={styles.chipRow}>
            {DURATION_CHIPS.map((m) => {
              const on = durationText === String(m);
              return (
                <TouchableOpacity
                  key={m}
                  onPress={() => setDurationText(String(m))}
                  accessibilityLabel={`duration ${m}`}
                >
                  <Chip
                    label={`${m}`}
                    tone={on ? "accent" : "outline"}
                    identity={def?.identity.bright ?? palette.strength.brandBright}
                  />
                </TouchableOpacity>
              );
            })}
          </View>

          {/* EFFORT (optional) */}
          <SectionHeader style={styles.section}>HOW HARD? (optional)</SectionHeader>
          <View style={styles.chipRow}>
            {EFFORTS.map((e) => {
              const on = effort === e;
              return (
                <TouchableOpacity
                  key={e}
                  onPress={() => setEffort(on ? null : e)}
                  accessibilityLabel={`effort ${e}`}
                >
                  <Chip
                    label={`felt ${e}`}
                    tone={on ? "accent" : "outline"}
                    identity={def?.identity.bright ?? palette.strength.brandBright}
                  />
                </TouchableOpacity>
              );
            })}
          </View>

          {/* DISTANCE — only for distance-y types */}
          {distanceEnabled ? (
            <>
              <SectionHeader style={styles.section}>DISTANCE (optional)</SectionHeader>
              <Input
                variant="decimal"
                value={distanceText}
                onChangeText={setDistanceText}
                suffix="km"
                accent={def?.identity.accent ?? palette.strength.brand}
                accessibilityLabel="distance km"
                placeholder="e.g. 5.2"
              />
            </>
          ) : null}

          {/* LABEL + NOTE (optional) */}
          <SectionHeader style={styles.section}>DETAILS (optional)</SectionHeader>
          <Input
            value={label}
            onChangeText={setLabel}
            placeholder="label — e.g. class, with Mariana"
            accent={def?.identity.accent ?? palette.strength.brand}
            accessibilityLabel="label"
            maxLength={120}
          />
          <Input
            variant="multiline"
            value={note}
            onChangeText={setNote}
            placeholder="note"
            accent={def?.identity.accent ?? palette.strength.brand}
            accessibilityLabel="note"
            maxLength={500}
            style={styles.note}
          />

          {/* WHEN — default today, step back for backfill */}
          <SectionHeader style={styles.section}>WHEN?</SectionHeader>
          <View style={styles.dayStepper}>
            <TouchableOpacity
              onPress={() => setStartedAt((ms) => stepDays(ms, -1))}
              style={styles.stepBtn}
              accessibilityLabel="earlier day"
            >
              <Text style={styles.stepBtnText}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.dayLabel}>{dayLabel}</Text>
            <TouchableOpacity
              onPress={() => canStepForward && setStartedAt((ms) => stepDays(ms, 1))}
              disabled={!canStepForward}
              style={[styles.stepBtn, !canStepForward && styles.stepBtnDisabled]}
              accessibilityLabel="later day"
            >
              <Text style={styles.stepBtnText}>›</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAwareScrollView>
      </SafeAreaView>
    </Modal>
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
    color: palette.text,
    letterSpacing: -0.5,
  },
  close: { fontSize: fontSize.lead, color: palette.textMuted, fontWeight: "700" },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },
  section: { marginTop: spacing.md },

  // Type grid
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  gridCell: {
    // Two-up: each cell ~half the row minus the gap.
    width: "47%",
    flexGrow: 1,
  },
  tile: {
    padding: spacing.xs,
    gap: spacing.xs,
    alignItems: "center",
  },
  tileImage: {
    width: "100%",
    height: 78,
    borderRadius: radii.xs,
    backgroundColor: palette.surfaceMuted,
  },
  tileName: {
    fontFamily: condensedFamily,
    fontSize: fontSize.lead,
    fontWeight: "800",
    letterSpacing: condensedFamily ? 0.2 : -0.3,
    paddingBottom: 2,
  },

  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  note: { marginTop: spacing.sm },

  // Day stepper
  dayStepper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: palette.surfaceMuted,
    borderWidth: borders.bold,
    borderColor: palette.inkSoft,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  stepBtn: {
    width: 44,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnDisabled: { opacity: 0.3 },
  stepBtnText: { fontSize: 26, color: palette.text, fontWeight: "700", lineHeight: 30 },
  dayLabel: {
    fontSize: fontSize.body,
    fontWeight: "700",
    color: palette.text,
    letterSpacing: 0.2,
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
  error: { fontSize: fontSize.caption, color: palette.danger },
});
