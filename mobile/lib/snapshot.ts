// snapshot — a tiny AsyncStorage cache of the last successful payload for a
// surface, so a cold start shows real data IMMEDIATELY instead of a skeleton
// or (worse) an empty state, then refreshes silently behind it.
//
// THE CONTRACT (loading-states wave):
//   - Today caches per local day (`getSnapshot("day", ymd)`); strength
//     caches under one key (`getSnapshot("strength")`).
//   - On mount: read the snapshot. If present, render it now (no skeleton),
//     kick a silent refresh, reconcile when the fresh payload lands.
//   - On a successful fetch: write the snapshot back.
//   - Day-key matching is the ONLY invalidation. The phone's LOCAL day is
//     the cache key; the server still buckets meals authoritatively, so a
//     stale local-day key just means a silent refresh corrects it. No TTLs,
//     no versioned migrations, no clever eviction — keep it boring.
//
// Reads/writes are best-effort: a storage miss or parse error returns null
// (caller falls back to the skeleton + fetch path) and never throws.

import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "eats.snapshot.v1";

// Build the storage key for a namespace (+ optional sub-key like a day's
// YYYY-MM-DD). Kept here so the key shape lives in exactly one place.
export function snapshotKey(namespace: string, sub?: string): string {
  return sub ? `${PREFIX}.${namespace}.${sub}` : `${PREFIX}.${namespace}`;
}

// Read a snapshot. Returns the parsed payload, or null if there is no
// snapshot / it failed to read / it failed to parse.
export async function getSnapshot<T>(namespace: string, sub?: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(snapshotKey(namespace, sub));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// Write a snapshot. Best-effort; a failure is swallowed (the in-memory
// state still drives the UI, the next successful write will catch up).
export async function setSnapshot<T>(namespace: string, sub: string | undefined, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(snapshotKey(namespace, sub), JSON.stringify(value));
  } catch {
    // ignore — caching is an optimization, never load-bearing.
  }
}
