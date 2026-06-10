// Tests for lib/snapshot.ts — the last-successful-payload cache that lets
// Today + strength render real data on cold start instead of a skeleton.
// Covers: key shape, round-trip, per-day isolation, miss/corrupt → null.

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getSnapshot, setSnapshot, snapshotKey } from "../lib/snapshot";

type Payload = { meals: Array<{ id: string }>; total: number };

describe("snapshot", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("builds namespaced keys, with and without a sub-key", () => {
    expect(snapshotKey("strength")).toBe("eats.snapshot.v1.strength");
    expect(snapshotKey("day", "2026-06-10")).toBe("eats.snapshot.v1.day.2026-06-10");
  });

  it("round-trips a payload through AsyncStorage", async () => {
    const payload: Payload = { meals: [{ id: "a" }, { id: "b" }], total: 2 };
    await setSnapshot("day", "2026-06-10", payload);
    expect(await getSnapshot<Payload>("day", "2026-06-10")).toEqual(payload);
  });

  it("returns null when nothing is stored", async () => {
    expect(await getSnapshot<Payload>("day", "2026-06-10")).toBeNull();
  });

  it("isolates snapshots per day key (no cross-day bleed)", async () => {
    await setSnapshot("day", "2026-06-10", { meals: [{ id: "today" }], total: 1 });
    await setSnapshot("day", "2026-06-09", { meals: [{ id: "yesterday" }], total: 1 });
    const today = await getSnapshot<Payload>("day", "2026-06-10");
    const yesterday = await getSnapshot<Payload>("day", "2026-06-09");
    expect(today?.meals[0].id).toBe("today");
    expect(yesterday?.meals[0].id).toBe("yesterday");
  });

  it("isolates a sub-keyed namespace from a bare one", async () => {
    await setSnapshot("strength", undefined, { meals: [], total: 99 });
    await setSnapshot("day", "2026-06-10", { meals: [], total: 1 });
    expect((await getSnapshot<Payload>("strength"))?.total).toBe(99);
    expect((await getSnapshot<Payload>("day", "2026-06-10"))?.total).toBe(1);
  });

  it("returns null for corrupt stored data", async () => {
    await AsyncStorage.setItem(snapshotKey("day", "2026-06-10"), "{not json");
    expect(await getSnapshot<Payload>("day", "2026-06-10")).toBeNull();
  });

  it("overwrites a previous snapshot for the same key", async () => {
    await setSnapshot("strength", undefined, { meals: [], total: 1 });
    await setSnapshot("strength", undefined, { meals: [], total: 2 });
    expect((await getSnapshot<Payload>("strength"))?.total).toBe(2);
  });
});
