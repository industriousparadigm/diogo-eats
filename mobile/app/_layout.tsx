// Root layout. Wires:
// - Supabase AppState listener (startAutoRefresh / stopAutoRefresh)
// - Auth state listener — redirects to /sign-in when no session
// - Safe area + status bar
//
// expo-router handles file-based routing. This file owns the
// "shell" — any authenticated screen lives as a child route.

import { useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";

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
        router.replace("/(app)/today");
      }
    });

    return () => listener.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments]);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, animation: "fade" }} />
    </SafeAreaProvider>
  );
}
