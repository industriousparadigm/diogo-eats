// Web-branch tests for lib/storage.ts.
//
// On web (Platform.OS === "web") the adapter must bypass the SecureStore
// chunking path entirely and read/write plain localStorage with no
// chunk-count keys. These tests force Platform.OS to "web", install a
// localStorage shim, and assert the web behaviour. The native path is
// covered separately in storage.test.ts.

// Force the web branch before lib/storage.ts is imported. react-native's
// Platform is read at module init in storage.ts (via the IS_WEB const),
// so the mock must be in place first.
jest.mock("react-native", () => ({
  Platform: { OS: "web" },
}));

// expo-secure-store must never be called on the web branch. Mock it so
// that any accidental call would be observable (and would fail the
// "no SecureStore on web" guarantee).
const secureStoreCalls: string[] = [];
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (k: string) => {
    secureStoreCalls.push(`get:${k}`);
    return null;
  }),
  setItemAsync: jest.fn(async (k: string) => {
    secureStoreCalls.push(`set:${k}`);
  }),
  deleteItemAsync: jest.fn(async (k: string) => {
    secureStoreCalls.push(`del:${k}`);
  }),
}));

// Minimal localStorage shim on the global window.
const lsStore = new Map<string, string>();
(globalThis as unknown as { window: { localStorage: Storage } }).window = {
  localStorage: {
    getItem: (k: string) => (lsStore.has(k) ? lsStore.get(k)! : null),
    setItem: (k: string, v: string) => {
      lsStore.set(k, v);
    },
    removeItem: (k: string) => {
      lsStore.delete(k);
    },
    clear: () => lsStore.clear(),
    key: (i: number) => Array.from(lsStore.keys())[i] ?? null,
    get length() {
      return lsStore.size;
    },
  } as Storage,
};

import { secureStoreGet, secureStoreSet, secureStoreRemove } from "../lib/storage";

beforeEach(() => {
  lsStore.clear();
  secureStoreCalls.length = 0;
});

describe("storage web branch (Platform.OS === 'web')", () => {
  it("round-trips a value through localStorage with no chunk keys", async () => {
    await secureStoreSet("session", "hello");
    expect(lsStore.get("session")).toBe("hello");
    expect(lsStore.has("session_chunk_count")).toBe(false);
    expect(await secureStoreGet("session")).toBe("hello");
  });

  it("stores a large value (> 1800 bytes) un-chunked on web", async () => {
    const big = "x".repeat(4000);
    await secureStoreSet("session", big);
    // No chunking on web — single key holds the whole value.
    expect(lsStore.has("session_chunk_count")).toBe(false);
    expect(lsStore.get("session")).toBe(big);
    expect(await secureStoreGet("session")).toBe(big);
  });

  it("returns null for a missing key", async () => {
    expect(await secureStoreGet("missing")).toBeNull();
  });

  it("removes a key from localStorage", async () => {
    await secureStoreSet("key", "value");
    await secureStoreRemove("key");
    expect(lsStore.has("key")).toBe(false);
    expect(await secureStoreGet("key")).toBeNull();
  });

  it("never touches expo-secure-store on the web branch", async () => {
    await secureStoreSet("session", "x".repeat(4000));
    await secureStoreGet("session");
    await secureStoreRemove("session");
    expect(secureStoreCalls).toEqual([]);
  });
});
