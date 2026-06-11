// Guard rails for the design system's "Depth rules" (DESIGN.md).
//
// Two invariants, both born from a real shipped defect: the strength
// highlights and session-detail beats cards rendered their TEXT with a hard
// displaced double-copy ("boxes doubling up on outlines"). Root cause: on
// iOS a view with shadowOpacity > 0 + shadowRadius 0 (the offset block) AND a
// TRANSLUCENT backgroundColor casts the hard block from its rendered alpha —
// the border stroke and the child text glyphs — not a solid rect. The fix
// keeps the offset block on an opaque base and renders any identity wash as a
// `tint` layer on top. These tests fail if either invariant regresses.
//
//   1. No typography preset (and no theme value) carries a textShadow*.
//   2. In the rendered highlights + session-detail trees: no Text has a
//      textShadow*, and no view carries BOTH the offset block and a
//      translucent fill (the exact doubling mechanism).

import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { typography, theme } from "../lib/theme";

// ---- style helpers -------------------------------------------------------

function flatten(style: unknown): Record<string, unknown> {
  // RN accepts arrays / nested arrays / registered ids; StyleSheet.flatten
  // resolves them all to one object (or undefined).
  return (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;
}

function hasTextShadow(s: Record<string, unknown>): boolean {
  return Object.keys(s).some((k) => k.toLowerCase().startsWith("textshadow"));
}

// A color is translucent if it carries alpha < 1 (rgba/hsla with a fractional
// last component, or an 8-digit hex whose alpha byte < ff). Opaque names,
// 6-digit hex, and rgb() are fine.
function isTranslucent(color: unknown): boolean {
  if (typeof color !== "string") return false;
  const c = color.trim().toLowerCase();
  const fn = c.match(/^(?:rgba|hsla)\(([^)]+)\)$/);
  if (fn) {
    const parts = fn[1].split(",").map((p) => p.trim());
    if (parts.length === 4) {
      const a = parseFloat(parts[3]);
      return Number.isFinite(a) && a < 1;
    }
    return false;
  }
  const hex8 = c.match(/^#([0-9a-f]{8})$/);
  if (hex8) return parseInt(hex8[1].slice(6), 16) < 255;
  return false;
}

// The offset block (NOT a soft blur): a non-zero shadow opacity with a hard
// (zero-radius) shadow. This is the container effect that must cast from an
// opaque rect.
function hasOffsetBlock(s: Record<string, unknown>): boolean {
  const op = typeof s.shadowOpacity === "number" ? (s.shadowOpacity as number) : 0;
  const r = typeof s.shadowRadius === "number" ? (s.shadowRadius as number) : undefined;
  return op > 0 && r === 0;
}

// Walk the rendered JSON tree, collecting any violations with a breadcrumb.
type Node = {
  type?: unknown;
  props?: { style?: unknown; [k: string]: unknown };
  children?: Node[] | null;
};

function collectViolations(root: Node | Node[] | null): string[] {
  const out: string[] = [];
  const visit = (node: Node | null, isText: boolean) => {
    if (!node || typeof node !== "object") return;
    const s = flatten(node.props?.style);
    const tag = String(node.type ?? "?");

    if (isText && hasTextShadow(s)) {
      out.push(`textShadow on <${tag}>: ${JSON.stringify(s)}`);
    }
    // The doubling mechanism: offset block + translucent fill on one view.
    if (hasOffsetBlock(s) && isTranslucent(s.backgroundColor)) {
      out.push(
        `offset block + translucent fill on <${tag}> (casts shadow from glyphs): bg=${String(
          s.backgroundColor
        )}`
      );
    }

    const kids = node.children;
    const childIsText = tag === "Text" || isText; // Text descendants inherit text-ness
    if (Array.isArray(kids)) {
      for (const k of kids) visit(k, childIsText || tag === "Text");
    }
  };
  if (Array.isArray(root)) for (const n of root) visit(n, false);
  else visit(root, false);
  return out;
}

// ---- 1. theme presets carry no text shadows -----------------------------

describe("Depth rules — theme presets", () => {
  it("no typography preset carries a textShadow* property", () => {
    for (const [name, preset] of Object.entries(typography)) {
      expect({ name, hasTextShadow: hasTextShadow(preset as Record<string, unknown>) }).toEqual({
        name,
        hasTextShadow: false,
      });
    }
  });

  it("no theme value anywhere is a textShadow* key", () => {
    const offenders: string[] = [];
    const walk = (obj: unknown, path: string) => {
      if (!obj || typeof obj !== "object") return;
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if (k.toLowerCase().startsWith("textshadow")) offenders.push(`${path}.${k}`);
        if (typeof v === "object") walk(v, `${path}.${k}`);
      }
    };
    walk(theme, "theme");
    expect(offenders).toEqual([]);
  });

  it("offsetShadow always emits a hard (zero-radius) block", () => {
    for (const depth of ["soft", "loud"] as const) {
      const s = theme.offsetShadow("#f59e0b", depth);
      expect(s.shadowRadius).toBe(0);
      expect(s.shadowOpacity).toBeGreaterThan(0);
    }
  });
});

// ---- 2. rendered surfaces are depth-safe ---------------------------------

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

const mockFetchStrengthSession = jest.fn();
const mockFetchStrengthOverview = jest.fn();
const mockGetSnapshot = jest.fn();

jest.mock("../lib/snapshot", () => ({
  getSnapshot: (...a: unknown[]) => mockGetSnapshot(...a),
  setSnapshot: jest.fn(),
  snapshotKey: (ns: string) => ns,
}));

jest.mock("../lib/api", () => {
  class ApiError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    fetchStrengthSession: (...a: unknown[]) => mockFetchStrengthSession(...a),
    fetchStrengthOverview: (...a: unknown[]) => mockFetchStrengthOverview(...a),
    ApiError,
  };
});

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() }),
  useLocalSearchParams: () => ({ id: "fixture-day1" }),
}));

import SessionDetailScreen from "../app/(app)/strength/log/[id]";
import HighlightsScreen from "../app/(app)/strength/highlights";
import { mockSessionDetail, mockStrengthOverview } from "../lib/strengthFixtures";
import { stashSessionResult, takeSessionResult } from "../lib/stores";
import type { SessionDetail, CompleteSessionResult } from "../lib/strengthTypes";

function threeBeatDetail(): SessionDetail {
  return {
    ...mockSessionDetail("s2"),
    beats: [
      { exercise_id: "back-extension", kind: "total_reps", from: 24, to: 27 },
      { exercise_id: "farmers-carry", kind: "steps_at_weight", from: 120, to: 130, at_weight_kg: 16 },
      { exercise_id: "leg-press", kind: "weight", from: 39, to: 45 },
    ],
  };
}

function multiBeatResult(): CompleteSessionResult {
  return {
    session: {
      id: "s2",
      started_at: 1,
      completed_at: 2,
      note: "scoreboard day",
      sets: [{ exercise_id: "leg-press", series_index: 1, weight_kg: 45, reps: 12 }],
    },
    highlights: [
      {
        id: "beats",
        line: "You beat 3 numbers today.",
        priority: 1,
        beats: [{ exercise_id: "leg-press", kind: "weight", from: 39, to: 45 }],
      },
      { id: "frequency", line: "2nd session in June.", priority: 3 },
    ],
  };
}

describe("Depth rules — rendered strength surfaces", () => {
  beforeEach(() => {
    mockFetchStrengthSession.mockReset();
    mockFetchStrengthOverview.mockReset();
    mockGetSnapshot.mockReset();
    mockGetSnapshot.mockResolvedValue(mockStrengthOverview());
  });

  it("session detail (3 beats) has no doubled-text mechanism", async () => {
    mockFetchStrengthSession.mockResolvedValue(threeBeatDetail());
    const { getByText, toJSON } = await render(<SessionDetailScreen />);
    await waitFor(() => {
      expect(getByText("3 NUMBERS BEATEN")).toBeTruthy();
      expect(getByText("39 → 45kg")).toBeTruthy();
    });
    const violations = collectViolations(toJSON() as never);
    expect(violations).toEqual([]);
  });

  it("highlights (multi-beat) lead card has no doubled-text mechanism", async () => {
    takeSessionResult();
    stashSessionResult(multiBeatResult());
    const { getByText, toJSON } = await render(<HighlightsScreen />);
    expect(getByText("You beat 3 numbers today.")).toBeTruthy();
    const violations = collectViolations(toJSON() as never);
    expect(violations).toEqual([]);
  });
});
