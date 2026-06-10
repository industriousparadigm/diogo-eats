// Tests for lib/draftStorage.ts — AsyncStorage persistence of the
// in-progress session draft (save / load / clear round-trip).

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import AsyncStorage from "@react-native-async-storage/async-storage";
import { saveDraft, loadDraft, clearDraft } from "../lib/draftStorage";
import { confirmSeries, createDraft } from "../lib/strengthSession";
import { mockStrengthOverview } from "../lib/strengthFixtures";

const NOW = new Date("2026-06-12T18:00:00").getTime();

describe("draftStorage", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("round-trips a draft through AsyncStorage", async () => {
    const draft = confirmSeries(
      createDraft(mockStrengthOverview(), NOW),
      "leg-press",
      0
    );
    await saveDraft(draft);
    const restored = await loadDraft();
    expect(restored).toEqual(draft);
  });

  it("returns null when nothing is stored", async () => {
    expect(await loadDraft()).toBeNull();
  });

  it("returns null for corrupt stored data", async () => {
    await AsyncStorage.setItem("eats.strength.draft.v1", "{corrupt");
    expect(await loadDraft()).toBeNull();
  });

  it("clearDraft removes the stored draft", async () => {
    await saveDraft(createDraft(mockStrengthOverview(), NOW));
    await clearDraft();
    expect(await loadDraft()).toBeNull();
  });

  it("saving again overwrites the previous draft", async () => {
    const first = createDraft(mockStrengthOverview(), NOW);
    await saveDraft(first);
    const second = confirmSeries(first, "chest-press", 0);
    await saveDraft(second);
    const restored = await loadDraft();
    expect(restored?.loggedOrder).toEqual(["chest-press"]);
  });
});
