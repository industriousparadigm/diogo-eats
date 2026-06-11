// Keyboard avoidance is a structural contract, not a pixel one. The
// strength session note once opened *behind* the keyboard because the
// picker view had no avoider at all; deep fields in long scrolls hid for
// the same reason. These tests assert the contract the fix relies on, read
// off the serialized host tree (so they survive the composite collapse and
// don't fake a layout RTR can't produce):
//
//   - On iOS the scroll view turns on automaticallyAdjustKeyboardInsets —
//     the native prop that scrolls a focused field up above the keyboard.
//     The KeyboardAvoidingView alone only shrinks the frame.
//   - keyboardShouldPersistTaps defaults to "handled" (tap a control while
//     a field is focused without dismissing first).
//   - The footer (sticky save / "Session complete" bar) sits OUTSIDE the
//     scroll view (so it stays pinned) but inside the avoider (so it rides
//     up with the keyboard).
//
// They assert the avoidance machinery is present and wired, not that pixels
// moved.

import React from "react";
import { Platform, TextInput, Text } from "react-native";
import { render } from "@testing-library/react-native";
import { KeyboardAwareScrollView } from "../components/ui/KeyboardAwareScrollView";

type JsonChild = JsonNode | string;
type JsonNode = {
  type: string;
  props: Record<string, unknown>;
  children?: JsonChild[] | null;
};

function childNodes(node: JsonNode | null): JsonNode[] {
  return (node?.children ?? []).filter(
    (c): c is JsonNode => typeof c === "object" && c !== null
  );
}

function findScroll(node: JsonNode | null): JsonNode | null {
  if (!node) return null;
  if (node.type === "RCTScrollView") return node;
  for (const c of childNodes(node)) {
    const hit = findScroll(c);
    if (hit) return hit;
  }
  return null;
}

function textIsUnder(node: JsonNode | null, value: string): boolean {
  if (!node) return false;
  if (node.type === "Text" && (node.children ?? []).includes(value)) return true;
  return childNodes(node).some((c) => textIsUnder(c, value));
}

describe("KeyboardAwareScrollView (the shared avoider)", () => {
  const realOS = Platform.OS;
  afterEach(() => {
    Platform.OS = realOS;
  });

  it("turns on automaticallyAdjustKeyboardInsets on iOS (scroll-to-focused field)", async () => {
    Platform.OS = "ios";
    const { toJSON } = await render(
      <KeyboardAwareScrollView>
        <TextInput accessibilityLabel="field" />
      </KeyboardAwareScrollView>
    );
    const scroll = findScroll(toJSON() as unknown as JsonNode);
    expect(scroll).toBeTruthy();
    expect(scroll?.props.automaticallyAdjustKeyboardInsets).toBe(true);
  });

  it("defaults keyboardShouldPersistTaps to 'handled'", async () => {
    const { toJSON } = await render(
      <KeyboardAwareScrollView>
        <TextInput accessibilityLabel="field" />
      </KeyboardAwareScrollView>
    );
    const scroll = findScroll(toJSON() as unknown as JsonNode);
    expect(scroll?.props.keyboardShouldPersistTaps).toBe("handled");
  });

  it("keeps the footer (sticky save bar) outside the scroll view", async () => {
    const { toJSON } = await render(
      <KeyboardAwareScrollView footer={<Text>SAVE_BAR</Text>}>
        <Text>FIELD</Text>
      </KeyboardAwareScrollView>
    );
    const root = toJSON() as unknown as JsonNode;
    const scroll = findScroll(root);
    // Footer is in the tree (rides up with the keyboard inside the avoider)…
    expect(textIsUnder(root, "SAVE_BAR")).toBe(true);
    // …but NOT inside the scroll view (so it stays pinned to the bottom).
    expect(textIsUnder(scroll, "SAVE_BAR")).toBe(false);
    // The scroll content is inside the scroll view.
    expect(textIsUnder(scroll, "FIELD")).toBe(true);
  });

  it("does not enable keyboard insets on Android (KeyboardAvoidingView 'height' handles it)", async () => {
    Platform.OS = "android";
    const { toJSON } = await render(
      <KeyboardAwareScrollView>
        <TextInput accessibilityLabel="field" />
      </KeyboardAwareScrollView>
    );
    const scroll = findScroll(toJSON() as unknown as JsonNode);
    expect(scroll?.props.automaticallyAdjustKeyboardInsets).toBeFalsy();
  });
});
