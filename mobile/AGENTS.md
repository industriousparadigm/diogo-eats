# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

This project is PINNED to SDK 54 because the App Store's Expo Go only runs `exposdk:54.0.0`. Do not upgrade the SDK; do not run `npx expo install --fix`. After any dependency change, `npx expo install --check` must report up-to-date and `react` must be exactly 19.1.0 (react-native 0.81.5, react-test-renderer 19.1.0). Never run `eas update` — publishing is done by a human after review.

# DESIGN.md IS MANDATORY FOR ANY UI WORK

**Before you touch a screen, component, or any styling — read `mobile/DESIGN.md`.**
It is the single source of truth for the app's visual language: the design DNA,
the token system (`lib/theme.ts`), the shared primitives (`components/ui/`), the
two-register rule (food = calm, strength = loud), the do/don't list, and a
new-screen checklist. Every surface shares one look; that file is how it stays
that way. Do not introduce raw hexes, magic sizes, blurred shadows, borderless
cards, red on food surfaces, or mode-chooser UIs — DESIGN.md explains why.
