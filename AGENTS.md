This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## Project notes — RakaatCounter (Expo SDK 58, single-file UI)

- Entry: `App.tsx` (all screens in one file) + `i18n.ts` (English string IS the key,
  `translate(lang, key, params)`, Persian digits auto-converted). Navigation = drawer
  navigator (Home / Settings / Debug Logs / Help / Share App) + hidden `Prayer` screen.
- Screens: HomeScreen (5 daily prayers from the madhhab table, Taraweeh, Recalibrate card),
  PrayerScreen (light-sensor counting, Qibla compass under the Sujud card, Stop Prayer),
  SettingsScreen (Night Mode, Vibration, Language EN/FA, Madhhab 4 chips), LogsScreen, Help, Share.
- Madhhab data: `PRAYER_PLANS` + `PRAYERS` + `dailyTotals()` at the top of App.tsx. Fard is
  17 for every school; the table only carries emphasised Sunnah + Witr per prayer.
- Persistence: AsyncStorage `@rakaat_language`, `@rakaat_madhhab`.
- GOTCHA (cost a debugging cycle): `drawerLabel` must be a plain STRING. Passing a function
  that returns a string makes @react-navigation/drawer render it as a raw child of a View →
  "Text strings must be rendered within a <Text> component". Same for any label prop that
  DrawerItem renders directly.
- GOTCHA: custom Inter font means Android ignores `fontWeight`; use the `F` family map.
  Arabic text (الحمدلله) must carry NO fontFamily (Inter has no Arabic glyphs).
- Verify commands (no lint config in this repo):
  `npx tsc --noEmit` then `npx expo export --platform android --no-bytecode`
  (plain `expo export` fails on Termux at the Hermes bytecode step — host limit, not a bug).
- Dev server on this phone: `bash ~/restart-metro.sh` (localhost mode, NOT --tunnel) →
  `exp://127.0.0.1:8081`. Tunnel mode makes the bundle download through ngrok and stalls.
- Ship rule (owner): NO build/push until he confirms the Expo Go test. Then bump version in
  app.json + package.json (+ APP_VERSION in App.tsx), commit, push main, tag, watch CI.
