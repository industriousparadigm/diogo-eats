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
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { colors, radii } from "@/lib/colors";

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
                placeholderTextColor={colors.textFaint}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                returnKeyType="send"
                onSubmitEditing={handleSendCode}
              />
              {error && <Text style={styles.errorText}>{error}</Text>}
              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleSendCode}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color={colors.bg} />
                ) : (
                  <Text style={styles.buttonText}>Send code</Text>
                )}
              </TouchableOpacity>
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
                placeholderTextColor={colors.textFaint}
                keyboardType="number-pad"
                maxLength={6}
                returnKeyType="done"
                onSubmitEditing={handleVerifyCode}
                autoFocus
              />
              {error && <Text style={styles.errorText}>{error}</Text>}
              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleVerifyCode}
                disabled={loading}
                activeOpacity={0.8}
              >
                {loading ? (
                  <ActivityIndicator color={colors.bg} />
                ) : (
                  <Text style={styles.buttonText}>Sign in</Text>
                )}
              </TouchableOpacity>
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
    backgroundColor: colors.bg,
  },
  kav: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
  },
  header: {
    marginBottom: 48,
    alignItems: "center",
  },
  logo: {
    fontSize: 40,
    fontWeight: "700",
    color: colors.brand,
    letterSpacing: -1,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    color: colors.textMuted,
  },
  form: {
    gap: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textMuted,
    marginBottom: 2,
  },
  hint: {
    fontSize: 13,
    color: colors.textSubtle,
    marginBottom: 4,
  },
  input: {
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.sm,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  codeInput: {
    fontSize: 28,
    letterSpacing: 8,
    textAlign: "center",
    paddingVertical: 18,
  },
  errorText: {
    fontSize: 13,
    color: colors.bad,
    marginTop: 2,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.bg,
  },
  backButton: {
    alignItems: "center",
    paddingVertical: 12,
  },
  backText: {
    fontSize: 14,
    color: colors.textSubtle,
  },
});
