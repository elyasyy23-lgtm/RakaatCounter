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

## v1.6.0 — SHIPPED 2026-11-16 (APK + website)
- Version 1.6.0 (app.json + package.json + APP_VERSION). Commit `38fe53c` -> main, tag `v1.6.0`.
  Tag CI run 43895758496 SUCCESS; Release
  https://github.com/elyasyy23-lgtm/RakaatCounter/releases/tag/v1.6.0
- Release asset `RakaatCounter-release.apk` — 51,374,968 B, sha256
  `ccee68368239928a75f9d044040d954830c9eb270d09e9b9926281902bbb5d78`
  (package com.elyasyy23.rakaatcounter, versionName 1.6.0 / code 1, minSdk 24 / targetSdk 36,
  arm64-v8a + armeabi-v7a).
- Delivered to `/storage/emulated/0/Download/RakaatCounter-release.apk` via
  `bash ~/gh-release-download.sh elyasyy23-lgtm/RakaatCounter latest RakaatCounter-release.apk
  /storage/emulated/0/Download` (direct github.com path worked, 16 s, hash verified).
- ALSO HOSTED ON THE OWNER'S WEBSITE: the APK is committed at the root of the FocusBlocker repo
  (`RakaatCounter-release.apk`) and served by GitHub Pages, so the public download never touches
  the release CDN: https://elyasyy23-lgtm.github.io/FocusBlocker/RakaatCounter-release.apk
  Live proven byte-identical (sha256 re-checked from the live URL). The site gained an `#apps`
  section ("اپلیکیشن‌های ما" / "Our apps") — dark card, icon (`assets/rakaat-icon.png`), 4 feature
  bullets, green CTA `#rakaat-cta`, install note, bilingual data-i18n keys `apps.*`, jump-nav link.
  FocusBlocker commit `ec9f152`.
- Ops note: each new APK OVERWRITES the same `RakaatCounter-release.apk` path in that repo (stable
  filename = no Chrome "download again?" prompt). Repo .git grows ~50 MB per version — if it ever
  passes ~800 MB, move the file to a `downloads/` folder with a version in the name and keep one
  older copy only.

## v1.7.0 REBRAND (2026-11-16, WIP — code done + verified, NOT built)
- Display name is now **خشوع** (`Khushu` in the EN dictionary). `app.json` `name: "خشوع"`,
  `slug: "khushu"`; Android package INTENTIONALLY still `com.elyasyy23.rakaatcounter` so the new
  APK installs as an UPDATE over the installed app (data + settings survive). Change the package
  only on an explicit owner order — it makes a separate app + loses data.
- Brand strings live in exactly four places: `app.json:name`, boot screen `App.tsx` (`t('RakaatCounter')`),
  drawer brand + Home header (`t('RakaatCounter')`), and `i18n.ts` keys `RakaatCounter` /
  `'Rakaat Tracker'` (`en: 'Khushu'`, `fa: 'خشوع'`). Share copy (`SHARE_MESSAGE_FA/EN`) also names it.
- NEW ICON + SPLASH from the owner's photo `/storage/emulated/0/Download/images (2).jpeg`
  (418x733 portrait, warm/red-toned). No ImageMagick/ffmpeg/PIL on this phone → generated with
  `jimp-compact` (already a devDependency here) via `$TMPDIR/zyvo/mkicon2.js <src> <assets-dir> <cropY>`:
  `icon.png` 1024² (cover crop), `android-icon-foreground.png` 1024² (700px rounded art centred),
  `android-icon-background.png` 1024² (flat `#C87775` + 16 % art), `splash-icon.png` 512² rounded
  transparent, `favicon.png` 192², plus `khushu-icon.png` 512² for the website. Old icons kept in
  `assets/old-icons/`. `android-icon-monochrome.png` DELETED and `monochromeImage` removed (a
  colour photo as a mono themed icon looks broken).
- `expo-splash-screen` installed (`npx expo install`, SDK 58) and configured as a plugin:
  image `./assets/splash-icon.png`, `imageWidth 220`, `resizeMode contain`, `backgroundColor #C87775`.
  Before this the project had NO splash config at all.
- **OWNER PICKED CROP A (y=0, head-centred) on 2026-11-16** — that is exactly what the current
  `assets/*` icons are built from, so no regeneration was needed; B/C are rejected, do not re-offer.
  Original note: portrait photo → square crop candidates shown at
  `http://127.0.0.1:8485/` (server: `setsid python3 -m http.server 8485` inside `icon-preview/`,
  page `icon-preview/index.html`, candidates `crop-A/B/C.png` = y 0 / 90 / 173). Default shipped =
  **A (y=0, head-centred)**; if he picks B/C just re-run the generator with that cropY (no code edit).
- Verified: `npx tsc --noEmit` rc=0, `npx expo export --platform android --no-bytecode` rc=0
  (bundle present in `dist/_expo/static/js/android/`), `npx expo config --type public` parses with the
  splash plugin, Metro dev bundle 200 / 8,731,819 B and contains `Khushu` (4 hits) + `خشوع`.
- Version still 1.6.0 — bump to **1.7.0** (app.json + package.json + APP_VERSION) only after the
  owner's Expo Go OK, then push + tag `v1.7.0` + CI.
- Website rebrand is deliberately LAST: the FocusBlocker pages show version/size/sha256 of the
  SHIPPED APK, so renaming the site before the new APK exists would publish false data.
