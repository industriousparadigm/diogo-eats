// Supabase client for the mobile app.
//
// Key decisions:
// - persistSession: true so the user is "logged in forever" on their device.
// - autoRefreshToken: true — Supabase SDK refreshes the access_token
//   automatically when it's close to expiry (handled in the background).
// - detectSessionInUrl: false — deep links go through expo-linking, not
//   the Supabase client's URL detection which is web-only.
// - Custom storage adapter over expo-secure-store with chunking for
//   large sessions (see lib/storage.ts).
//
// AppState wiring (startAutoRefresh/stopAutoRefresh) lives in the root
// layout (_layout.tsx) so the client is only created once.

import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";
import { supabaseStorageAdapter } from "./storage";

const extra = Constants.expoConfig?.extra ?? {};
const SUPABASE_URL = (extra.supabaseUrl as string | undefined) ?? "";
const SUPABASE_ANON_KEY = (extra.supabaseAnonKey as string | undefined) ?? "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing Supabase config. Check extra.supabaseUrl / extra.supabaseAnonKey in app.json."
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: supabaseStorageAdapter,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
