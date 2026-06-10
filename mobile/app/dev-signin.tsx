// DEV-ONLY sign-in shortcut for simulator verification.
//
// The OTP email flow can't be driven by an agent in the simulator, so a
// throwaway script mints a session (supabase admin generateLink ->
// verifyOtp) and deep-links it in:
//   exp://127.0.0.1:8081/--/dev-signin?access_token=...&refresh_token=...
//
// Hard-gated on __DEV__: in published (production-mode) bundles this
// route renders a plain redirect home and never touches the params.

import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Redirect, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import { colors } from "@/lib/colors";

export default function DevSignIn() {
  const params = useLocalSearchParams<{
    access_token?: string;
    refresh_token?: string;
  }>();
  const [state, setState] = useState<"working" | "done" | "failed">("working");

  useEffect(() => {
    if (!__DEV__) return;
    const access_token = params.access_token;
    const refresh_token = params.refresh_token;
    if (!access_token || !refresh_token) {
      setState("failed");
      return;
    }
    supabase.auth
      .setSession({ access_token, refresh_token })
      .then(({ error }) => setState(error ? "failed" : "done"))
      .catch(() => setState("failed"));
  }, [params.access_token, params.refresh_token]);

  if (!__DEV__) return <Redirect href="/" />;
  if (state === "done") return <Redirect href="/(app)/(tabs)" />;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
      }}
    >
      {state === "working" ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <Text style={{ color: colors.bad, fontSize: 14 }}>
          dev sign-in failed — check tokens
        </Text>
      )}
    </View>
  );
}
