// Settings — the 4 daily targets (DB-backed via /api/profile, same row
// the web reads) + account section. Reference numbers, not gates: the
// hints repeat the web's framing so the numbers stay honest, not
// aspirational.

import { useCallback, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { palette, radii, borders, fontSize, spacing } from "@/lib/theme";
import { Card, SectionHeader, Button, Input, KeyboardAwareScrollView } from "@/components/ui";
import { SettingsSkeleton } from "@/components/skeletons/SettingsSkeleton";
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
  const router = useRouter();
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
      <KeyboardAwareScrollView contentContainerStyle={styles.content}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Settings</Text>
            <TouchableOpacity onPress={resetAll} style={styles.resetBtn} disabled={saving}>
              <Text style={styles.resetBtnText}>reset</Text>
            </TouchableOpacity>
          </View>

          <SectionHeader style={styles.sectionLabel}>DAILY TARGETS</SectionHeader>
          <Text style={styles.intro}>
            Reference numbers, not gates. The totals and trend lines scale to
            them; nothing red-alerts when you're over.
          </Text>

          {draft === null ? (
            <SettingsSkeleton />
          ) : (
            <>
              {FIELDS.map((f) => (
                <View key={f.key} style={styles.field}>
                  <Text style={styles.fieldLabel}>{f.label.toUpperCase()}</Text>
                  <Input
                    variant="decimal"
                    suffix={f.unit}
                    value={draft[f.key]}
                    onChangeText={(v) => patch(f.key, v)}
                    editable={!saving}
                    accessibilityLabel={`${f.label} target`}
                  />
                  <Text style={styles.fieldHint}>{f.hint}</Text>
                </View>
              ))}

              <Button
                label={saving ? "saving…" : "save targets"}
                onPress={() => targets && save(targets)}
                variant="primary"
                disabled={!canSave}
                style={styles.saveBtn}
              />
              {savedHint && !error && <Text style={styles.savedHint}>saved</Text>}
              {error && <Text style={styles.errorText}>{error}</Text>}
            </>
          )}

          <SectionHeader style={[styles.sectionLabel, styles.accountLabel]}>YOUR FOODS</SectionHeader>
          <Card
            style={styles.foodsBtn}
            onPress={() => router.push("/(app)/foods")}
            accessibilityLabel="open foods library"
          >
            <View style={styles.foodsBtnMain}>
              <Text style={styles.foodsBtnTitle}>Foods library</Text>
              <Text style={styles.foodsBtnSub}>
                Search, edit, merge, add by hand, or read a label.
              </Text>
            </View>
            <Text style={styles.foodsBtnChevron}>›</Text>
          </Card>

          <SectionHeader style={[styles.sectionLabel, styles.accountLabel]}>ACCOUNT</SectionHeader>
          <Card style={styles.accountCard}>
            <View style={styles.accountRow}>
              <Text style={styles.accountKey}>Signed in as</Text>
              <Text style={styles.accountValue} numberOfLines={1}>
                {email || "—"}
              </Text>
            </View>
            <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
              <Text style={styles.signOutText}>Sign out</Text>
            </TouchableOpacity>
          </Card>
      </KeyboardAwareScrollView>
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
    backgroundColor: palette.bg,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: 48,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: spacing.sm,
  },
  title: {
    fontSize: fontSize.display,
    fontWeight: "800",
    color: palette.text,
    letterSpacing: -0.5,
  },
  resetBtn: {
    borderWidth: borders.bold,
    borderColor: palette.ink,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  resetBtnText: {
    fontSize: fontSize.label,
    color: palette.textMuted,
    fontWeight: "700",
  },
  sectionLabel: {
    marginTop: spacing.sm,
  },
  intro: {
    fontSize: fontSize.caption,
    color: palette.textMuted,
    lineHeight: 19,
  },
  field: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  fieldLabel: {
    fontSize: fontSize.caption,
    color: palette.textSubtle,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  fieldHint: {
    fontSize: fontSize.label,
    color: palette.textSubtle,
    lineHeight: 16,
  },
  saveBtn: {
    marginTop: spacing.sm,
  },
  savedHint: {
    fontSize: fontSize.caption,
    color: palette.food.accentBright,
    textAlign: "center",
  },
  errorText: {
    fontSize: fontSize.caption,
    color: palette.danger,
    textAlign: "center",
  },
  accountLabel: {
    marginTop: spacing.xxl,
  },
  foodsBtn: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    gap: spacing.md,
  },
  foodsBtnMain: {
    flex: 1,
    gap: 3,
  },
  foodsBtnTitle: {
    fontSize: fontSize.bodyLg,
    fontWeight: "700",
    color: palette.text,
  },
  foodsBtnSub: {
    fontSize: fontSize.caption,
    color: palette.textSubtle,
    lineHeight: 16,
  },
  foodsBtnChevron: {
    fontSize: 22,
    color: palette.textMuted,
  },
  accountCard: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  accountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.md,
  },
  accountKey: {
    fontSize: fontSize.caption,
    color: palette.textSubtle,
  },
  accountValue: {
    fontSize: fontSize.caption,
    color: palette.text,
    fontWeight: "600",
    flexShrink: 1,
  },
  signOutBtn: {
    borderWidth: borders.bold,
    borderColor: palette.inkSoft,
    borderRadius: radii.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  signOutText: {
    fontSize: fontSize.caption,
    color: palette.danger,
    fontWeight: "700",
  },
});
