// Input — the one text field in the system. Until now inputs were
// hand-rolled per screen (meal-edit name/grams, the quick-fix box, the
// session note, settings, foods) and drifted: different fills, borders,
// focus behaviour. This is the canonical form field.
//
// The recipe (DESIGN.md "Form fields"): `surfaceMuted` fill, a chunky-ish
// `borders.bold` border in `inkSoft` at rest, and on focus the border
// takes the surface's register ACCENT (food lime by default, an exercise
// identity or strength amber when passed). `radii.sm`. Placeholder is the
// one legitimate use of `textFaint`; typed text is always full `text`.
// `keyboardAppearance="dark"` so the iOS keyboard matches the OLED app.
//
//   <Input value={name} onChangeText={setName} placeholder="olive oil" />
//   <Input variant="numeric" value={g} onChangeText={setG} suffix="g" />
//   <Input variant="multiline" value={note} onChangeText={setNote} />

import { forwardRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { palette, radii, borders, fontSize, spacing } from "@/lib/theme";

type Variant = "text" | "numeric" | "decimal" | "multiline";

type Props = Omit<TextInputProps, "style"> & {
  variant?: Variant;
  // The focus-ring accent. Defaults to food lime; pass an exercise
  // identity / strength amber on loud surfaces.
  accent?: string;
  // A small fixed unit shown inside the field on the right ("g", "kg").
  suffix?: string;
  // Wrapper style (width, margins). The inner TextInput is fully managed.
  style?: StyleProp<ViewStyle>;
};

export const Input = forwardRef<TextInput, Props>(function Input(
  { variant = "text", accent = palette.food.accent, suffix, style, onFocus, onBlur, ...rest },
  ref
) {
  const [focused, setFocused] = useState(false);

  const keyboardType: TextInputProps["keyboardType"] =
    variant === "numeric" ? "number-pad" : variant === "decimal" ? "decimal-pad" : "default";
  const multiline = variant === "multiline";

  return (
    <View
      style={[
        styles.field,
        multiline && styles.fieldMultiline,
        focused && { borderColor: accent },
        style,
      ]}
    >
      <TextInput
        ref={ref}
        style={[styles.input, multiline && styles.inputMultiline]}
        placeholderTextColor={palette.textFaint}
        keyboardType={keyboardType}
        keyboardAppearance="dark"
        multiline={multiline}
        selectionColor={accent}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...rest}
      />
      {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  field: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: palette.surfaceMuted,
    borderWidth: borders.bold,
    borderColor: palette.inkSoft,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
  },
  fieldMultiline: {
    alignItems: "flex-start",
  },
  input: {
    flex: 1,
    color: palette.text,
    fontSize: fontSize.body,
    paddingVertical: spacing.md,
  },
  inputMultiline: {
    minHeight: 64,
    textAlignVertical: "top",
    lineHeight: 20,
  },
  suffix: {
    fontSize: fontSize.caption,
    color: palette.textSubtle,
    fontWeight: "700",
    marginLeft: spacing.xs,
  },
});
