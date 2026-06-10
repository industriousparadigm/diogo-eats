// Supabase SecureStore/AsyncStorage adapter for session persistence.
//
// Supabase sessions routinely exceed 2048 bytes (SecureStore's per-key
// limit on iOS). The robust pattern is:
//   - Encryption key stored in SecureStore (small, fits).
//   - Ciphertext stored in AsyncStorage (no size limit).
//
// BUT expo-crypto (available in Expo Go) doesn't expose AES-GCM key
// derivation in a way that's convenient for this pattern. The simpler
// approach that works reliably in Expo Go:
//
//   Chunk large values across multiple SecureStore keys.
//   Key "supabase_chunk_count" stores how many chunks there are.
//   Key "supabase_chunk_0", "supabase_chunk_1", etc. store the data.
//
// This is the documented pattern from the Supabase React Native docs.
// Each chunk is ≤1800 bytes (well inside the 2048 limit).
//
// WEB: none of the above applies. expo-secure-store has no browser
// implementation (importing/calling it throws), and browsers have no
// 2KB-per-key limit. On web we delegate straight to localStorage with
// no chunking. The native path below stays byte-identical.

import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const CHUNK_SIZE = 1800;

// --- Web branch: plain localStorage, no chunking, no SecureStore. ---
// Guarded so the module is safe to import in any environment; if
// localStorage is somehow unavailable (SSR, private-mode quirks) the
// adapter degrades to no-op reads rather than throwing.
const IS_WEB = Platform.OS === "web";

function webStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

async function webGet(key: string): Promise<string | null> {
  const ls = webStorage();
  if (!ls) return null;
  try {
    return ls.getItem(key);
  } catch {
    return null;
  }
}

async function webSet(key: string, value: string): Promise<void> {
  const ls = webStorage();
  if (!ls) return;
  try {
    ls.setItem(key, value);
  } catch {
    // Quota / private-mode failures are best-effort — swallow.
  }
}

async function webRemove(key: string): Promise<void> {
  const ls = webStorage();
  if (!ls) return;
  try {
    ls.removeItem(key);
  } catch {
    // Best-effort.
  }
}

function chunkCountKey(key: string): string {
  return `${key}_chunk_count`;
}

function chunkKey(key: string, i: number): string {
  return `${key}_chunk_${i}`;
}

export async function secureStoreGet(key: string): Promise<string | null> {
  if (IS_WEB) return webGet(key);
  try {
    // Try reading the chunk count first to determine if this was stored chunked.
    const countRaw = await SecureStore.getItemAsync(chunkCountKey(key));
    if (countRaw !== null) {
      const count = parseInt(countRaw, 10);
      const chunks: string[] = [];
      for (let i = 0; i < count; i++) {
        const chunk = await SecureStore.getItemAsync(chunkKey(key, i));
        if (chunk === null) return null; // corrupted
        chunks.push(chunk);
      }
      return chunks.join("");
    }
    // Fallback: stored as a single key (small values).
    return SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function secureStoreSet(key: string, value: string): Promise<void> {
  if (IS_WEB) return webSet(key, value);
  // Remove any prior chunked data for this key before writing.
  await secureStoreRemove(key);

  if (value.length <= CHUNK_SIZE) {
    await SecureStore.setItemAsync(key, value);
    return;
  }

  // Split into chunks and store each one.
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += CHUNK_SIZE) {
    chunks.push(value.slice(i, i + CHUNK_SIZE));
  }
  await SecureStore.setItemAsync(chunkCountKey(key), chunks.length.toString());
  await Promise.all(chunks.map((c, i) => SecureStore.setItemAsync(chunkKey(key, i), c)));
}

export async function secureStoreRemove(key: string): Promise<void> {
  if (IS_WEB) return webRemove(key);
  try {
    const countRaw = await SecureStore.getItemAsync(chunkCountKey(key));
    if (countRaw !== null) {
      const count = parseInt(countRaw, 10);
      await SecureStore.deleteItemAsync(chunkCountKey(key));
      await Promise.all(
        Array.from({ length: count }, (_, i) => SecureStore.deleteItemAsync(chunkKey(key, i)))
      );
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  } catch {
    // Best-effort cleanup — ignore errors.
  }
}

// The storage adapter object that Supabase's createClient() accepts.
export const supabaseStorageAdapter = {
  getItem: secureStoreGet,
  setItem: secureStoreSet,
  removeItem: secureStoreRemove,
};
