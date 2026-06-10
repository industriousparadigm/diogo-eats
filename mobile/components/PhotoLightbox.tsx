// Full-screen photo viewer. Tap a meal photo (card or detail) to open it
// here at full resolution. Native: pinch-zoom + pan + double-tap-to-zoom
// via react-native-gesture-handler (ships in Expo Go SDK 54); swipe-down
// or tap the dim backdrop / × to dismiss. Web: gesture-handler degrades,
// so we fall back to click-to-toggle 2× zoom (the brief's "acceptable
// degrade") with the same dismiss affordances.
//
// No reanimated dependency — gestures drive RN core Animated.Values
// imperatively (useNativeDriver:false, set on the JS thread). At this
// scale (one image, occasional pinch) that is smooth enough and keeps the
// dependency surface inside what Expo Go already bundles.

import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import { Image } from "expo-image";
import { colors } from "@/lib/colors";

const IS_WEB = Platform.OS === "web";
const MAX_SCALE = 4;
const SWIPE_DISMISS = 90;

type Props = {
  uri: string | null;
  visible: boolean;
  onClose: () => void;
};

export function PhotoLightbox({ uri, visible, onClose }: Props) {
  if (!visible || !uri) return null;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={styles.fill}>
        {IS_WEB ? (
          <WebViewer uri={uri} onClose={onClose} />
        ) : (
          <NativeViewer uri={uri} onClose={onClose} />
        )}
      </GestureHandlerRootView>
    </Modal>
  );
}

// ---- native: pinch / pan / double-tap / swipe-down ----

function NativeViewer({ uri, onClose }: { uri: string; onClose: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const backdrop = useRef(new Animated.Value(1)).current;

  // Committed values + live bases, kept in refs so gesture callbacks can
  // read the latest without re-subscribing.
  const committed = useRef({ scale: 1, x: 0, y: 0 });
  const pinchBase = useRef(1);
  const panBase = useRef({ x: 0, y: 0 });

  function reset() {
    committed.current = { scale: 1, x: 0, y: 0 };
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: false, bounciness: 0 }),
      Animated.spring(translateX, { toValue: 0, useNativeDriver: false, bounciness: 0 }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: false, bounciness: 0 }),
    ]).start();
  }

  const pinch = Gesture.Pinch()
    .onStart(() => {
      pinchBase.current = committed.current.scale;
    })
    .onUpdate((e) => {
      const next = Math.max(1, Math.min(MAX_SCALE, pinchBase.current * e.scale));
      scale.setValue(next);
      committed.current.scale = next;
    })
    .onEnd(() => {
      if (committed.current.scale <= 1.01) reset();
    });

  const pan = Gesture.Pan()
    .minPointers(1)
    .onStart(() => {
      panBase.current = { x: committed.current.x, y: committed.current.y };
    })
    .onUpdate((e) => {
      if (committed.current.scale > 1.01) {
        // Zoomed in: pan the image.
        const x = panBase.current.x + e.translationX;
        const y = panBase.current.y + e.translationY;
        translateX.setValue(x);
        translateY.setValue(y);
        committed.current.x = x;
        committed.current.y = y;
      } else if (e.translationY > 0) {
        // At rest scale, a downward drag fades toward dismiss.
        translateY.setValue(e.translationY);
        backdrop.setValue(Math.max(0.2, 1 - e.translationY / 400));
      }
    })
    .onEnd((e) => {
      if (committed.current.scale <= 1.01) {
        if (e.translationY > SWIPE_DISMISS) {
          onClose();
        } else {
          translateY.setValue(0);
          Animated.timing(backdrop, {
            toValue: 1,
            duration: 120,
            useNativeDriver: false,
          }).start();
          committed.current.y = 0;
        }
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(260)
    .onEnd(() => {
      if (committed.current.scale > 1.01) {
        reset();
      } else {
        committed.current.scale = 2.5;
        Animated.spring(scale, {
          toValue: 2.5,
          useNativeDriver: false,
          bounciness: 0,
        }).start();
      }
    });

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => {
      if (committed.current.scale <= 1.01) onClose();
    });

  // Double-tap wins over single-tap; pinch + pan compose freely.
  const composed = Gesture.Simultaneous(
    pinch,
    pan,
    Gesture.Exclusive(doubleTap, singleTap)
  );

  return (
    <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
      <GestureDetector gesture={composed}>
        <Animated.View style={styles.fill}>
          <Animated.View
            style={[
              styles.imageWrap,
              {
                transform: [
                  { translateX },
                  { translateY },
                  { scale },
                ],
              },
            ]}
          >
            <Image
              source={{ uri }}
              style={styles.image}
              contentFit="contain"
              transition={120}
            />
          </Animated.View>
        </Animated.View>
      </GestureDetector>
      <CloseButton onClose={onClose} />
    </Animated.View>
  );
}

// ---- web: click-to-toggle zoom (gesture-handler degrades on web) ----

function WebViewer({ uri, onClose }: { uri: string; onClose: () => void }) {
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <View style={styles.backdrop}>
      <Pressable
        style={styles.fill}
        onPress={onClose}
        accessibilityLabel="close photo"
      >
        <View style={styles.fill} pointerEvents="box-none">
          <Pressable
            style={styles.imageWrap}
            onPress={(e) => {
              e.stopPropagation();
              setZoomed((z) => !z);
            }}
            accessibilityLabel={zoomed ? "zoom out" : "zoom in"}
          >
            <Image
              source={{ uri }}
              style={[styles.image, zoomed && styles.imageZoomedWeb]}
              contentFit="contain"
              transition={120}
            />
          </Pressable>
        </View>
      </Pressable>
      <CloseButton onClose={onClose} />
    </View>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <Pressable
      onPress={onClose}
      accessibilityLabel="close"
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      style={styles.closeBtn}
    >
      <Text style={styles.closeText}>×</Text>
    </Pressable>
  );
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.94)",
  },
  imageWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: SCREEN_W,
    height: SCREEN_H,
  },
  imageZoomedWeb: {
    transform: [{ scale: 2 }],
  },
  closeBtn: {
    position: "absolute",
    top: 48,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: {
    color: "#fff",
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "300",
  },
});
