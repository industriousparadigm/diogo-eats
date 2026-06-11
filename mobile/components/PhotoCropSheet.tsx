// Per-photo crop + rotate sheet. Opened from a thumbnail in the capture
// sheet. The user drags a selection rectangle over the contained image
// (move the rect, drag a corner to resize), optionally rotates 90°, then
// applies — expo-image-manipulator does the actual pixel crop/rotate and
// hands back a new file URI.
//
// Conceptually mirrors the web's cropMath (display→source mapping, contain
// scaling, corner-resize, clamp). The geometry math is the pure, unit-tested
// lib/cropMath.
//
// GESTURES: react-native-gesture-handler, NOT PanResponder. This sheet is a
// Modal nested inside the capture sheet's Modal. On iOS every RN Modal renders
// into its OWN native view hierarchy that is NOT a descendant of the app
// root's GestureHandlerRootView (app/_layout.tsx) — and a PanResponder inside
// that doubly-nested modal never even gets asked to claim the touch, so every
// gesture was dead on device. The fix mirrors PhotoLightbox exactly: give the
// Modal its OWN GestureHandlerRootView and drive RNGH Gesture detectors. No
// reanimated dep (none installed) — callbacks run on the JS thread and set
// React state directly, same as PhotoLightbox.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  type LayoutChangeEvent,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import { Image } from "expo-image";
import * as ImageManipulator from "expo-image-manipulator";
import { colors, radii } from "@/lib/colors";
import {
  containedDisplayDims,
  resizeRectFromCorner,
  moveRectWithin,
  displayRectToSourceCrop,
  type Rect,
  type Corner,
} from "@/lib/cropMath";

type Photo = { uri: string; name: string; type: string };

type Props = {
  visible: boolean;
  photo: Photo | null;
  onCancel: () => void;
  onApply: (cropped: Photo) => void;
};

const HANDLE = 28;

export function PhotoCropSheet({ visible, photo, onCancel, onApply }: Props) {
  if (!visible || !photo) return null;
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
    >
      {/* A nested Modal renders into its own native view tree, OUTSIDE the
          app-root GestureHandlerRootView. RNGH needs a root in THIS tree or
          no gesture in the sheet fires. (Same pattern as PhotoLightbox.) */}
      <GestureHandlerRootView style={styles.fill}>
        <CropEditor photo={photo} onCancel={onCancel} onApply={onApply} />
      </GestureHandlerRootView>
    </Modal>
  );
}

function CropEditor({
  photo,
  onCancel,
  onApply,
}: {
  photo: Photo;
  onCancel: () => void;
  onApply: (cropped: Photo) => void;
}) {
  const [source, setSource] = useState<{ w: number; h: number } | null>(null);
  const [container, setContainer] = useState<{ w: number; h: number } | null>(null);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load source pixel dims. expo-image has no sync size getter, so a
  // no-op ImageManipulator pass returns the decoded width/height.
  useEffect(() => {
    let cancelled = false;
    ImageManipulator.manipulateAsync(photo.uri, [], {})
      .then((res) => {
        if (cancelled) return;
        setSource({ w: res.width, h: res.height });
      })
      .catch(() => {
        if (!cancelled) setError("couldn't read that image");
      });
    return () => {
      cancelled = true;
    };
  }, [photo.uri]);

  // Effective source dims after rotation (90/270 swap).
  const effective = useMemo(() => {
    if (!source) return null;
    return rotation === 90 || rotation === 270
      ? { w: source.h, h: source.w }
      : { w: source.w, h: source.h };
  }, [source, rotation]);

  // Rendered (contained) image box inside the measured container.
  const display = useMemo(() => {
    if (!effective || !container) return null;
    return containedDisplayDims(effective.w, effective.h, container.w, container.h);
  }, [effective, container]);

  // Initialise / reset the crop rect to the full image whenever the
  // display box changes (first layout, rotation).
  useEffect(() => {
    if (!display) return;
    setRect({ x: 0, y: 0, width: display.w, height: display.h });
  }, [display?.w, display?.h]);

  const bounds = display ? { w: display.w, h: display.h } : { w: 0, h: 0 };

  // Gesture callbacks read the live rect/bounds off refs so the detectors
  // never need to re-subscribe mid-drag (RNGH builds the gesture once).
  const rectRef = useRef<Rect | null>(rect);
  rectRef.current = rect;
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;
  const rectStartRef = useRef<Rect | null>(null);

  // Move gesture: drag anywhere inside the rect to translate it.
  const moveGesture = useMemo(
    () =>
      Gesture.Pan()
        .onStart(() => {
          rectStartRef.current = rectRef.current;
        })
        .onUpdate((e) => {
          const start = rectStartRef.current;
          if (!start) return;
          setRect(
            moveRectWithin(start, e.translationX, e.translationY, boundsRef.current)
          );
        }),
    []
  );

  // One resize gesture per corner; the dragged corner moves, opposite anchors.
  // A corner handle sits ON TOP of the rect-move pan, so a touch starting on it
  // must resize, not move. .blocksExternalGesture(moveGesture) makes the corner
  // win the arbitration over the underlying move pan.
  function cornerGesture(corner: Corner) {
    return Gesture.Pan()
      .blocksExternalGesture(moveGesture)
      .onStart(() => {
        rectStartRef.current = rectRef.current;
      })
      .onUpdate((e) => {
        const start = rectStartRef.current;
        if (!start) return;
        setRect(
          resizeRectFromCorner(
            start,
            corner,
            e.translationX,
            e.translationY,
            boundsRef.current
          )
        );
      });
  }
  const cornerGestures = useMemo(
    () => ({
      tl: cornerGesture("tl"),
      tr: cornerGesture("tr"),
      bl: cornerGesture("bl"),
      br: cornerGesture("br"),
    }),
    // moveGesture is stable (built once); corners reference it for blocking.
    [moveGesture]
  );

  async function apply() {
    if (!source || !display || !rect) return;
    setBusy(true);
    setError(null);
    try {
      const actions: ImageManipulator.Action[] = [];
      if (rotation !== 0) actions.push({ rotate: rotation });
      // After the rotate action, the manipulator works in EFFECTIVE pixel
      // space, so the crop rect maps from display → effective dims.
      const crop = displayRectToSourceCrop(
        rect,
        { w: display.w, h: display.h },
        effective!.w,
        effective!.h
      );
      actions.push({ crop });
      const res = await ImageManipulator.manipulateAsync(photo.uri, actions, {
        compress: 0.9,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      const name = (res.uri.split("/").pop() ?? "crop.jpg").replace(/\?.*$/, "");
      onApply({ uri: res.uri, name, type: "image/jpeg" });
    } catch {
      setError("crop failed — try again");
      setBusy(false);
    }
  }

  function onContainerLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setContainer({ w: width, h: height });
  }

  return (
    <View style={styles.sheet}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onCancel} style={styles.headerBtn}>
          <Text style={styles.headerBtnText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Crop</Text>
        <TouchableOpacity
          onPress={() => setRotation((r) => (((r + 90) % 360) as 0 | 90 | 180 | 270))}
          style={styles.headerBtn}
          accessibilityLabel="rotate 90 degrees"
        >
          <Text style={styles.headerBtnText}>Rotate ↻</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.stage} onLayout={onContainerLayout}>
        {!source ? (
          <ActivityIndicator color={colors.brand} />
        ) : display && rect ? (
          <View style={{ width: display.w, height: display.h }}>
            {/* The image is display-only; it must never compete for touches
                with the selection / handles layered above it. */}
            <Image
              source={{ uri: photo.uri }}
              pointerEvents="none"
              style={{
                width: display.w,
                height: display.h,
                transform: [{ rotate: `${rotation}deg` }],
              }}
              contentFit="contain"
            />
            {/* Selection rectangle (drag to move). */}
            <GestureDetector gesture={moveGesture}>
              <View
                accessibilityLabel="crop selection"
                style={[
                  styles.selection,
                  { left: rect.x, top: rect.y, width: rect.width, height: rect.height },
                ]}
              >
                {(["tl", "tr", "bl", "br"] as Corner[]).map((c) => (
                  <GestureDetector key={c} gesture={cornerGestures[c]}>
                    <View
                      accessibilityLabel={`crop handle ${c}`}
                      hitSlop={HANDLE / 2}
                      style={[styles.handle, handlePos(c)]}
                    />
                  </GestureDetector>
                ))}
              </View>
            </GestureDetector>
          </View>
        ) : null}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.footer}>
        <TouchableOpacity
          onPress={() => display && setRect({ x: 0, y: 0, width: display.w, height: display.h })}
          style={styles.resetBtn}
          disabled={busy}
        >
          <Text style={styles.resetText}>reset</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={apply}
          style={[styles.applyBtn, busy && styles.dim]}
          disabled={busy}
          activeOpacity={0.85}
        >
          <Text style={styles.applyText}>{busy ? "cropping…" : "apply crop"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function handlePos(c: Corner) {
  const off = -HANDLE / 2;
  switch (c) {
    case "tl":
      return { left: off, top: off };
    case "tr":
      return { right: off, top: off };
    case "bl":
      return { left: off, bottom: off };
    case "br":
      return { right: off, bottom: off };
  }
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  sheet: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerBtn: {
    minWidth: 70,
  },
  headerBtnText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
  },
  selection: {
    position: "absolute",
    borderWidth: 2,
    borderColor: colors.accentBright,
    backgroundColor: "rgba(132,204,22,0.06)",
  },
  handle: {
    position: "absolute",
    width: HANDLE,
    height: HANDLE,
    borderRadius: HANDLE / 2,
    backgroundColor: colors.accentBright,
    borderWidth: 2,
    borderColor: colors.bg,
  },
  error: {
    fontSize: 13,
    color: colors.bad,
    textAlign: "center",
    paddingHorizontal: 16,
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    alignItems: "center",
  },
  resetBtn: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  resetText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  applyBtn: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: 15,
    alignItems: "center",
  },
  dim: {
    opacity: 0.5,
  },
  applyText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.bg,
  },
});
