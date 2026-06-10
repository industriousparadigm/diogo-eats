// Root layout. Wires:
// - Supabase AppState listener (startAutoRefresh / stopAutoRefresh)
// - Auth state listener — redirects to /sign-in when no session
// - Safe area + status bar
//
// expo-router handles file-based routing. This file owns the
// "shell" — any authenticated screen lives as a child route.

import { useEffect, type ReactNode } from "react";
import { AppState, type AppStateStatus, Platform, View, StyleSheet } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { colors } from "@/lib/colors";

const IS_WEB = Platform.OS === "web";

// Desktop shell (web only). Eats is a phone-shaped app; in a browser it
// should sit in a centered, phone-width column against a dark page
// rather than stretch edge-to-edge. On native this wrapper is a no-op
// passthrough so the layout is byte-identical to before.
function DesktopShell({ children }: { children: ReactNode }) {
  // Paint the page (html/body) dark so the gutter around the column
  // matches the app instead of flashing white. Web-only DOM touch.
  useEffect(() => {
    if (!IS_WEB || typeof document === "undefined") return;
    const prevBody = document.body.style.backgroundColor;
    const prevHtml = document.documentElement.style.backgroundColor;
    document.body.style.backgroundColor = "#000";
    document.documentElement.style.backgroundColor = "#000";
    return () => {
      document.body.style.backgroundColor = prevBody;
      document.documentElement.style.backgroundColor = prevHtml;
    };
  }, []);

  if (!IS_WEB) return <>{children}</>;

  return (
    <View style={shellStyles.page}>
      <View style={shellStyles.column}>{children}</View>
    </View>
  );
}

const shellStyles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
  },
  column: {
    flex: 1,
    width: "100%",
    maxWidth: 520,
    backgroundColor: colors.bg,
    // A faint seam so the phone column reads as intentional on a wide screen.
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
});

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();

  // Wire AppState so the Supabase SDK can pause/resume token refresh
  // when the app goes to background. This is the documented RN pattern.
  useEffect(() => {
    function handleAppState(status: AppStateStatus) {
      if (status === "active") {
        supabase.auth.startAutoRefresh();
      } else {
        supabase.auth.stopAutoRefresh();
      }
    }

    const sub = AppState.addEventListener("change", handleAppState);
    return () => sub.remove();
  }, []);

  // Listen for auth state changes and redirect accordingly.
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const inAuthGroup = segments[0] === "(auth)";

      if (!session && !inAuthGroup) {
        // No session — send to sign-in.
        router.replace("/(auth)/sign-in");
      } else if (session && inAuthGroup) {
        // Signed in — go to the main screen.
        router.replace("/(app)/(tabs)");
      }
    });

    return () => listener.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments]);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <DesktopShell>
        <Stack screenOptions={{ headerShown: false, animation: "fade" }} />
      </DesktopShell>
    </SafeAreaProvider>
  );
}
