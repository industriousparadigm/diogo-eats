// Settings — the 4 daily targets (DB-backed via /api/profile, same row
// the web reads) + account section. Reference numbers, not gates: the
// hints repeat the web's framing so the numbers stay honest, not
// aspirational.

import { useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { colors, radii } from "@/lib/colors";
import { ApiError, fetchProfile, saveTargets } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { DEFAULT_TARGETS, type Targets } from "@/lib/types";

type FieldKey = keyof Targets;

const FIELDS: Array<{
  key: FieldKey;
  label: string;
  unit: string;
  hint: string;
}> = [
  {
    key: "sat_fat_g",
    label: "Saturated fat",
    unit: "g",
    hint: "Textbook lifestyle-first cap is 13g. 18-22g is a more livable target if you eat fish or moderate dairy.",
  },
  {
    key: "soluble_fiber_g",
    label: "Soluble fiber",
    unit: "g",
    hint: "10g+ supports LDL reduction. Oats, beans, psyllium, fruit.",
  },
  {
    key: "calories",
    label: "Calories",
    unit: "kcal",
    hint: "Loose anchor only — Eats isn't a calorie counter.",
  },
  {
    key: "protein_g",
    label: "Protein",
    unit: "g",
    hint: "~1.2g/kg bodyweight is a fair default once strength training starts.",
  },
];

export default function SettingsScreen() {
  // draft holds the text-field values so partial input ("1", "") doesn't
  // fight the numeric state while typing.
  const [draft, setDraft] = useState<Record<FieldKey, string> | null>(null);
  const [email, setEmail] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      setEmail(data.session?.user?.email ?? "");
    } catch {
      // account row just stays email-less
    }
    try {
      const profile = await fetchProfile();
      setDraft({
        sat_fat_g: String(numOr(profile.sat_fat_g, DEFAULT_TARGETS.sat_fat_g)),
        soluble_fiber_g: String(
          numOr(profile.soluble_fiber_g, DEFAULT_TARGETS.soluble_fiber_g)
        ),
        calories: String(numOr(profile.calories, DEFAULT_TARGETS.calories)),
        protein_g: String(numOr(profile.protein_g, DEFAULT_TARGETS.protein_g)),
      });
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load settings");
      // Editable defaults still beat a dead screen.
      setDraft((d) => d ?? toDraft(DEFAULT_TARGETS));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setSavedHint(false);
      load();
    }, [load])
  );

  function patch(key: FieldKey, value: string) {
    setSavedHint(false);
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  function draftToTargets(): Targets | null {
    if (!draft) return null;
    const out = {} as Record<FieldKey, number>;
    for (const f of FIELDS) {
      const n = parseFloat(draft[f.key]);
      if (!isFinite(n) || n <= 0) return null;
      out[f.key] = n;
    }
    return out as Targets;
  }

  async function save(targets: Targets) {
    setSaving(true);
    setError(null);
    try {
      await saveTargets(targets);
      setDraft(toDraft(targets));
      setSavedHint(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  function resetAll() {
    Alert.alert("Reset targets?", "Back to the defaults calibrated for Diogo's phenotype.", [
      { text: "Cancel", style: "cancel" },
      { text: "Reset", onPress: () => save({ ...DEFAULT_TARGETS }) },
    ]);
  }

  function signOut() {
    Alert.alert("Sign out?", email || undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: () => {
          // The root layout's onAuthStateChange redirects to sign-in.
          supabase.auth.signOut();
        },
      },
    ]);
  }

  const targets = draftToTargets();
  const canSave = !saving && targets !== null;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.kav}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerRow}>
            <Text style={styles.title}>Settings</Text>
            <TouchableOpacity onPress={resetAll} style={styles.resetBtn} disabled={saving}>
              <Text style={styles.resetBtnText}>reset</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>DAILY TARGETS</Text>
          <Text style={styles.intro}>
            Reference numbers, not gates. The totals and trend lines scale to
            them; nothing red-alerts when you're over.
          </Text>

          {draft === null ? (
            <ActivityIndicator color={colors.brand} style={styles.loader} />
          ) : (
            <>
              {FIELDS.map((f) => (
                <View key={f.key} style={styles.field}>
                  <Text style={styles.fieldLabel}>{f.label.toUpperCase()}</Text>
                  <View style={styles.fieldRow}>
                    <TextInput
                      style={styles.fieldInput}
                      value={draft[f.key]}
                      onChangeText={(v) => patch(f.key, v)}
                      keyboardType="decimal-pad"
                      editable={!saving}
                      accessibilityLabel={`${f.label} target`}
                    />
                    <Text style={styles.fieldUnit}>{f.unit}</Text>
                  </View>
                  <Text style={styles.fieldHint}>{f.hint}</Text>
                </View>
              ))}

              <TouchableOpacity
                style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
                onPress={() => targets && save(targets)}
                disabled={!canSave}
                activeOpacity={0.8}
              >
                <Text style={styles.saveBtnText}>
                  {saving ? "saving…" : "save targets"}
                </Text>
              </TouchableOpacity>
              {savedHint && !error && <Text style={styles.savedHint}>saved</Text>}
              {error && <Text style={styles.errorText}>{error}</Text>}
            </>
          )}

          <Text style={[styles.sectionLabel, styles.accountLabel]}>ACCOUNT</Text>
          <View style={styles.accountCard}>
            <View style={styles.accountRow}>
              <Text style={styles.accountKey}>Signed in as</Text>
              <Text style={styles.accountValue} numberOfLines={1}>
                {email || "—"}
              </Text>
            </View>
            <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
              <Text style={styles.signOutText}>Sign out</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function toDraft(t: Targets): Record<FieldKey, string> {
  return {
    sat_fat_g: String(t.sat_fat_g),
    soluble_fiber_g: String(t.soluble_fiber_g),
    calories: String(t.calories),
    protein_g: String(t.protein_g),
  };
}

function numOr(v: unknown, fallback: number): number {
  return typeof v === "number" && isFinite(v) && v > 0 ? v : fallback;
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  kav: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 48,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: -0.5,
  },
  resetBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  resetBtnText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  sectionLabel: {
    fontSize: 11,
    color: colors.textSubtle,
    letterSpacing: 1,
    fontWeight: "500",
    marginTop: 8,
  },
  intro: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
  loader: {
    marginTop: 24,
  },
  field: {
    gap: 4,
    marginTop: 4,
  },
  fieldLabel: {
    fontSize: 12,
    color: colors.textSubtle,
    letterSpacing: 0.4,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  fieldInput: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.sm,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  fieldUnit: {
    fontSize: 13,
    color: colors.textFaint,
    width: 36,
  },
  fieldHint: {
    fontSize: 11,
    color: colors.textFaint,
    lineHeight: 16,
  },
  saveBtn: {
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.bg,
  },
  savedHint: {
    fontSize: 12,
    color: colors.accentBright,
    textAlign: "center",
  },
  errorText: {
    fontSize: 12,
    color: colors.bad,
    textAlign: "center",
  },
  accountLabel: {
    marginTop: 24,
  },
  accountCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: 14,
    gap: 12,
  },
  accountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  accountKey: {
    fontSize: 13,
    color: colors.textSubtle,
  },
  accountValue: {
    fontSize: 13,
    color: colors.text,
    fontWeight: "500",
    flexShrink: 1,
  },
  signOutBtn: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.sm,
    paddingVertical: 10,
    alignItems: "center",
  },
  signOutText: {
    fontSize: 13,
    color: colors.bad,
    fontWeight: "600",
  },
});
