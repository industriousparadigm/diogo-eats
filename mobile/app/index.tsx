// Entry route for "/". Cold-starting the app (including via the
// published exp:// URL) lands here BEFORE any auth event fires — the
// root layout's onAuthStateChange redirect only covers later
// transitions. Without this file, expo-router shows Unmatched Route.
//
// Resolve the persisted session once, then hand off.

import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { supabase } from "@/lib/supabase";
import { colors } from "@/lib/colors";

export default function Index() {
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (mounted) setHasSession(!!data.session);
      })
      .catch(() => {
        if (mounted) setHasSession(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (hasSession === null) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return <Redirect href={hasSession ? "/(app)/(tabs)" : "/(auth)/sign-in"} />;
}
