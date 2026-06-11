// KeyboardAwareScrollView — the one scroll container for any screen with a
// text field. Until now every input screen hand-rolled its own
// KeyboardAvoidingView + ScrollView pair, and they drifted: some had the
// avoider, some didn't (the strength session note had none — its field
// opened *behind* the keyboard), and even the ones that had it only
// shrank the viewport without scrolling a deep, focused field into view.
// A grams row at the bottom of a long meal edit, the recent-search box at
// the very bottom of the capture sheet, the last settings target — all
// classic victims.
//
// The fix has two halves:
//
//   1. iOS's native `automaticallyAdjustKeyboardInsets` on the ScrollView —
//      the UIScrollView tracks the keyboard frame and scrolls the focused
//      TextInput up to sit just above the keyboard, however deep it is.
//
//   2. A pinned `footer` (save bar, "Session complete") is HIDDEN while the
//      keyboard is up. The footer normally lives just above the keyboard,
//      and the focused field is scrolled to exactly that strip — so a
//      visible footer would occlude the bottom-most field (this is how the
//      session note stayed hidden even after the keyboard was "handled").
//      A save/complete bar is not actionable mid-typing anyway; it returns
//      the instant the keyboard dismisses.
//
//   <KeyboardAwareScrollView
//     contentContainerStyle={styles.bodyContent}
//     footer={<View style={styles.saveBar}>…</View>}
//   >
//     …fields…
//   </KeyboardAwareScrollView>

import { forwardRef, useEffect, useState, type ReactNode } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Platform,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

type Props = ScrollViewProps & {
  children: ReactNode;
  // A sticky element pinned at the bottom (save bar, a "Session complete"
  // button). Hidden while the keyboard is visible so it never occludes the
  // focused field above the keyboard.
  footer?: ReactNode;
  // Style for the outer KeyboardAvoidingView (the screen-filling flex box).
  avoiderStyle?: StyleProp<ViewStyle>;
};

export const KeyboardAwareScrollView = forwardRef<ScrollView, Props>(
  function KeyboardAwareScrollView(
    {
      children,
      footer,
      avoiderStyle,
      keyboardShouldPersistTaps = "handled",
      showsVerticalScrollIndicator = false,
      ...rest
    },
    ref
  ) {
    const isIos = Platform.OS === "ios";
    const [keyboardOpen, setKeyboardOpen] = useState(false);

    useEffect(() => {
      const showEvt = isIos ? "keyboardWillShow" : "keyboardDidShow";
      const hideEvt = isIos ? "keyboardWillHide" : "keyboardDidHide";
      const show = Keyboard.addListener(showEvt, () => setKeyboardOpen(true));
      const hide = Keyboard.addListener(hideEvt, () => setKeyboardOpen(false));
      return () => {
        show.remove();
        hide.remove();
      };
    }, [isIos]);

    return (
      <KeyboardAvoidingView
        behavior={isIos ? "padding" : "height"}
        style={[styles.avoider, avoiderStyle]}
      >
        <ScrollView
          ref={ref}
          // iOS native keyboard inset + scroll-to-focused-field. This is the
          // piece that lifts a deep focused input above the keyboard; the
          // KeyboardAvoidingView alone only shrinks the frame.
          automaticallyAdjustKeyboardInsets={isIos}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          keyboardDismissMode={isIos ? "interactive" : "on-drag"}
          showsVerticalScrollIndicator={showsVerticalScrollIndicator}
          {...rest}
        >
          {children}
        </ScrollView>
        {/* Pinned bar — hidden while typing so it can't cover the focused
            field, restored the moment the keyboard dismisses. */}
        {footer && !keyboardOpen ? footer : null}
      </KeyboardAvoidingView>
    );
  }
);

const styles = StyleSheet.create({
  avoider: {
    flex: 1,
  },
});
