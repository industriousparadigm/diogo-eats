// Jest setup file — loaded after the test framework is initialized.

// Global AsyncStorage mock. The official in-memory mock backs every test
// that touches the snapshot cache (Today / strength), the strength draft,
// etc., without each suite re-declaring it. A suite can still override with
// its own jest.mock() if it needs to assert on storage calls directly.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
