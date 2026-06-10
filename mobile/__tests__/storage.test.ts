// Unit tests for the SecureStore chunking adapter in lib/storage.ts.
// Tests that large values are chunked and reassembled correctly, and that
// the chunk count is written/read properly.

// The mock store must be module-scope (not inside the factory function)
// because jest.mock() factories are hoisted. We use a closure-based
// approach by defining the store inside the mock manually.

// We can't reference module-scope `store` inside jest.mock() factory directly
// (jest hoisting restriction), so we intercept via a __mocks__ approach instead:
// define the mock inline using a self-contained Map.

const mockStore = new Map<string, string>();

jest.mock("expo-secure-store", () => {
  // Use the module-global mockStore (allowed because the var is prefixed with "mock").
  return {
    getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      mockStore.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      mockStore.delete(key);
    }),
  };
});

import { secureStoreGet, secureStoreSet, secureStoreRemove } from "../lib/storage";

beforeEach(() => mockStore.clear());

describe("secureStoreSet / secureStoreGet", () => {
  it("round-trips a small value (< 1800 bytes) as a single key", async () => {
    await secureStoreSet("session", "hello");
    expect(mockStore.has("session_chunk_count")).toBe(false);
    const result = await secureStoreGet("session");
    expect(result).toBe("hello");
  });

  it("chunks a large value (> 1800 bytes) across multiple keys", async () => {
    const big = "x".repeat(4000);
    await secureStoreSet("session", big);
    expect(mockStore.has("session_chunk_count")).toBe(true);
    const count = parseInt(mockStore.get("session_chunk_count")!, 10);
    expect(count).toBe(3); // ceil(4000 / 1800) = 3
    const result = await secureStoreGet("session");
    expect(result).toBe(big);
  });

  it("returns null when key does not exist", async () => {
    const result = await secureStoreGet("missing");
    expect(result).toBeNull();
  });

  it("overwrites an existing chunked value with a small value", async () => {
    await secureStoreSet("session", "x".repeat(4000));
    await secureStoreSet("session", "updated");
    const result = await secureStoreGet("session");
    expect(result).toBe("updated");
    // Old chunks should be cleaned up.
    expect(mockStore.has("session_chunk_count")).toBe(false);
  });

  it("handles exactly 1800 bytes as a single key", async () => {
    const exactly = "a".repeat(1800);
    await secureStoreSet("session", exactly);
    expect(mockStore.has("session_chunk_count")).toBe(false);
    expect(await secureStoreGet("session")).toBe(exactly);
  });

  it("handles 1801 bytes as 2 chunks", async () => {
    const just_over = "a".repeat(1801);
    await secureStoreSet("session", just_over);
    expect(mockStore.has("session_chunk_count")).toBe(true);
    const count = parseInt(mockStore.get("session_chunk_count")!, 10);
    expect(count).toBe(2);
    expect(await secureStoreGet("session")).toBe(just_over);
  });
});

describe("secureStoreRemove", () => {
  it("removes a simple key", async () => {
    await secureStoreSet("key", "value");
    await secureStoreRemove("key");
    expect(await secureStoreGet("key")).toBeNull();
  });

  it("removes all chunks for a chunked key", async () => {
    await secureStoreSet("key", "x".repeat(4000));
    await secureStoreRemove("key");
    expect(mockStore.has("key_chunk_count")).toBe(false);
    expect(mockStore.has("key_chunk_0")).toBe(false);
    expect(mockStore.has("key_chunk_1")).toBe(false);
    expect(mockStore.has("key_chunk_2")).toBe(false);
  });

  it("does not throw when key does not exist", async () => {
    await expect(secureStoreRemove("nonexistent")).resolves.not.toThrow();
  });
});
