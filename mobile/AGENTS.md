# SIMULATOR IS HEADLESS — THE OWNER IS WORKING ON THIS MAC

Violating this disrupts a human's workday, NOT just a build. Never `open -a Simulator`, never `npx expo start --ios` (both launch the GUI and steal window focus), never AppleScript/System Events UI-scripting of Simulator menus (synthetic clicks land in the owner's Slack and apps). The headless way does everything: `xcrun simctl boot <udid>`, `npx expo start` (no --ios) + `xcrun simctl openurl booted "exp://127.0.0.1:8081"`, interact via `idb`, capture via `xcrun simctl io booted screenshot`. Screenshots render fine without the GUI, and headless boots show the software keyboard by default.

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

## Screenshot verification requires a SERVED bundle
Expo Go silently falls back to its cached copy of the PUBLISHED app when it can't reach the dev server — your screenshot then shows prod, not your change. Before trusting any simulator screenshot: confirm Metro's log contains an `iOS Bundled` line for your session (`grep Bundled <metro log>`). If zero, `xcrun simctl terminate booted host.exp.Exponent` and reopen `exp://127.0.0.1:8081`.
