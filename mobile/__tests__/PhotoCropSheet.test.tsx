// Structural wiring tests for the photo crop sheet.
//
// This component shipped DEAD to touch on a real device: the green rect and
// handles rendered, but no gesture fired. Root cause — the crop sheet is a
// Modal nested inside the capture sheet's Modal, so on iOS it renders into its
// own native view tree OUTSIDE the app-root GestureHandlerRootView, and the
// old PanResponder was never even asked to claim a touch.
//
// These tests don't try to simulate a real iOS native gesture (jsdom can't).
// They pin the STRUCTURAL preconditions that make the fix correct, so the bug
// can't silently come back:
//   1. a GestureHandlerRootView lives INSIDE the Modal (RNGH needs its own root
//      in the nested-modal view tree);
//   2. the selection rect and all four corner handles are wired to RNGH
//      GestureDetectors (the gesture layer is attached, not decorative);
//   3. the underlying image is pointerEvents="none" so it can't swallow touches
//      meant for the rect / handles above it.

import React from "react";
import { render, act, fireEvent } from "@testing-library/react-native";

jest.mock("expo-image", () => ({ Image: "Image" }));

// expo-image-manipulator: the sheet calls a no-op pass to read source pixel
// dims on mount. Return a fixed size so the display box + rect compute.
const mockManipulate = jest.fn(
  (..._args: unknown[]): Promise<{ uri: string; width: number; height: number }> =>
    Promise.resolve({ uri: "file:///cropped.jpg", width: 4000, height: 3000 })
);
jest.mock("expo-image-manipulator", () => ({
  manipulateAsync: (...args: unknown[]) => mockManipulate(...args),
  SaveFormat: { JPEG: "jpeg" },
}));

// RNGH mock that PRESERVES identity: GestureDetector renders its children and
// is findable by type, GestureHandlerRootView too, and every gesture builder
// is chainable so .onStart/.onUpdate/.blocksExternalGesture don't blow up.
jest.mock("react-native-gesture-handler", () => {
  const React = require("react");
  const makeGesture = () => {
    const g: Record<string, () => unknown> = {};
    for (const k of [
      "onStart",
      "onUpdate",
      "onEnd",
      "onBegin",
      "onFinalize",
      "blocksExternalGesture",
      "simultaneousWithExternalGesture",
      "minPointers",
    ]) {
      g[k] = () => g;
    }
    return g;
  };
  const GestureHandlerRootView = ({
    children,
    ...rest
  }: {
    children: React.ReactNode;
  }) => React.createElement("GestureHandlerRootView", rest, children);
  const GestureDetector = ({ children }: { children: React.ReactNode }) =>
    React.createElement("GestureDetector", null, children);
  return {
    Gesture: { Pan: makeGesture },
    GestureDetector,
    GestureHandlerRootView,
  };
});

import { PhotoCropSheet } from "../components/PhotoCropSheet";

const PHOTO = { uri: "file:///orig.jpg", name: "orig.jpg", type: "image/jpeg" };

type Tree = Awaited<ReturnType<typeof render>>;

async function renderSheet(): Promise<Tree> {
  return render(
    <PhotoCropSheet
      visible
      photo={PHOTO}
      onCancel={jest.fn()}
      onApply={jest.fn()}
    />
  );
}

// Fire the stage's onLayout so display dims (and therefore the rect + handles)
// resolve — onLayout doesn't fire on its own in the test renderer. Wrap in act
// so the measured-size state update flushes and the rect re-renders.
async function layoutStage(tree: Tree) {
  const nodes = tree.root!.queryAll(
    (n) => typeof (n.props as { onLayout?: unknown })?.onLayout === "function"
  );
  await act(async () => {
    for (const node of nodes) {
      fireEvent(node, "layout", {
        nativeEvent: { layout: { width: 360, height: 480 } },
      });
    }
  });
}

const byTypeName = (tree: Tree, name: string) =>
  tree.root!.queryAll((n) => {
    const t = n.type;
    return typeof t === "string" ? t === name : (t as { name?: string })?.name === name;
  });

describe("PhotoCropSheet wiring", () => {
  beforeEach(() => mockManipulate.mockClear());

  it("renders a GestureHandlerRootView INSIDE the modal (nested-modal fix)", async () => {
    const tree = await renderSheet();
    // The whole point of the bug: the app-root GHRootView does not reach a
    // nested Modal's native tree, so the sheet must carry its own.
    expect(byTypeName(tree, "GestureHandlerRootView").length).toBe(1);
  });

  it("wires the selection rect and all four corner handles to GestureDetectors", async () => {
    const tree = await renderSheet();
    await layoutStage(tree);

    // 5 detectors total: 1 for the move-rect, 4 for the corner handles.
    expect(byTypeName(tree, "GestureDetector").length).toBe(5);

    // The four corner handles + the selection rect are all present.
    for (const c of ["tl", "tr", "bl", "br"]) {
      expect(tree.getByLabelText(`crop handle ${c}`)).toBeTruthy();
    }
    expect(tree.getByLabelText("crop selection")).toBeTruthy();
  });

  it("makes the underlying image non-interactive so it can't swallow touches", async () => {
    const tree = await renderSheet();
    await layoutStage(tree);

    const images = byTypeName(tree, "Image");
    expect(images.length).toBe(1);
    expect(images[0].props.pointerEvents).toBe("none");
  });
});
