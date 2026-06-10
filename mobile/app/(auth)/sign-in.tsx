// Sign-in screen: email OTP (magic link code flow).
//
// Step 1: user types email → supabase.auth.signInWithOtp({ email,
//         options: { shouldCreateUser: false } })
// Step 2: user types 6-digit code → supabase.auth.verifyOtp({ email,
//         token, type: "email" })
//
// After a successful verifyOtp the session is persisted via
// supabaseStorageAdapter and the root layout's onAuthStateChange
// listener redirects to /(app)/today automatically.
//
// shouldCreateUser: false means the OTP is rejected if the email is
// not already in Supabase Auth — keeps the server's allowlist effective.

import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { palette, radii, borders, fontSize, spacing, condensedFamily } from "@/lib/theme";
import { Button } from "@/components/ui";

type Step = "email" | "code";

export default function SignInScreen() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSendCode() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Enter a valid email address");
      return;
    }

    setLoading(true);
    setError(null);

    const { error: otpErr } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { shouldCreateUser: false },
    });

    setLoading(false);

    if (otpErr) {
      // Supabase returns "Signups not allowed for otp" when shouldCreateUser: false
      // and the email isn't registered. Surface it in plain language.
      if (
        otpErr.message.includes("not allowed") ||
        otpErr.message.includes("not found") ||
        otpErr.message.includes("not registered")
      ) {
        setError("This email isn't registered — ask Diogo for access.");
      } else {
        setError(otpErr.message);
      }
      return;
    }

    setStep("code");
  }

  async function handleVerifyCode() {
    const token = code.trim().replace(/\s/g, "");
    if (token.length !== 6) {
      setError("Enter the 6-digit code from your email");
      return;
    }

    setLoading(true);
    setError(null);

    const { error: verifyErr } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token,
      type: "email",
    });

    setLoading(false);

    if (verifyErr) {
      setError("Wrong or expired code — try again");
      setCode("");
    }
    // On success, onAuthStateChange fires and navigates automatically.
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.kav}
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.logo}>eats</Text>
            <Text style={styles.tagline}>your food, honestly.</Text>
          </View>

          {step === "email" ? (
            <View style={styles.form}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={palette.textFaint}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                returnKeyType="send"
                onSubmitEditing={handleSendCode}
              />
              {error && <Text style={styles.errorText}>{error}</Text>}
              <Button
                label="Send code"
                variant="primary"
                onPress={handleSendCode}
                loading={loading}
                style={styles.button}
              />
            </View>
          ) : (
            <View style={styles.form}>
              <Text style={styles.label}>6-digit code</Text>
              <Text style={styles.hint}>Check {email} — the code expires in 10 minutes.</Text>
              <TextInput
                style={[styles.input, styles.codeInput]}
                value={code}
                onChangeText={setCode}
                placeholder="000000"
                placeholderTextColor={palette.textFaint}
                keyboardType="number-pad"
                maxLength={6}
                returnKeyType="done"
                onSubmitEditing={handleVerifyCode}
                autoFocus
              />
              {error && <Text style={styles.errorText}>{error}</Text>}
              <Button
                label="Sign in"
                variant="primary"
                onPress={handleVerifyCode}
                loading={loading}
                style={styles.button}
              />
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => {
                  setStep("email");
                  setCode("");
                  setError(null);
                }}
              >
                <Text style={styles.backText}>Use a different email</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  kav: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing.xxl,
    justifyContent: "center",
  },
  header: {
    marginBottom: 48,
    alignItems: "center",
  },
  logo: {
    fontFamily: condensedFamily,
    fontSize: fontSize.hero,
    fontWeight: "800",
    color: palette.food.accent,
    letterSpacing: condensedFamily ? 0.5 : -1,
    marginBottom: spacing.sm,
  },
  tagline: {
    fontSize: fontSize.title,
    color: palette.textMuted,
  },
  form: {
    gap: spacing.md,
  },
  label: {
    fontSize: fontSize.body,
    fontWeight: "700",
    color: palette.textMuted,
    marginBottom: 2,
  },
  hint: {
    fontSize: fontSize.caption,
    color: palette.textSubtle,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: palette.surfaceMuted,
    color: palette.text,
    borderWidth: borders.bold,
    borderColor: palette.inkSoft,
    borderRadius: radii.sm,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    fontSize: fontSize.title,
  },
  codeInput: {
    fontFamily: condensedFamily,
    fontSize: fontSize.displayLg,
    letterSpacing: 8,
    textAlign: "center",
    paddingVertical: spacing.lg,
  },
  errorText: {
    fontSize: fontSize.caption,
    color: palette.danger,
    marginTop: 2,
  },
  button: {
    marginTop: spacing.sm,
  },
  backButton: {
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  backText: {
    fontSize: fontSize.body,
    color: palette.textSubtle,
  },
});
