// AsyncStorage persistence for the in-progress strength session draft.
//
// The draft is written on every mutation (writes are tiny) so app
// kill/backgrounding between machines never loses a set — spec 6.2.5.
// SecureStore is NOT used here: drafts are not secrets and can exceed
// SecureStore's 2KB per-key limit once the overview payload is cached.

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  deserializeDraft,
  serializeDraft,
  type SessionDraft,
} from "./strengthSession";

const KEY = "eats.strength.draft.v1";

export async function saveDraft(draft: SessionDraft): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, serializeDraft(draft));
  } catch {
    // Persistence is best-effort; the in-memory draft still drives the UI.
  }
}

export async function loadDraft(): Promise<SessionDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    return deserializeDraft(raw);
  } catch {
    return null;
  }
}

export async function clearDraft(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
