# TASK — RakaatCounter → خشوع (Khushu) v1.7.0 rebrand + site refresh

GOAL: ship v1.7.0 under the new name **خشوع** with the owner's photo icon/splash, deliver the APK to
`/storage/emulated/0/Download/`, then refresh the FocusBlocker website (name, icon, size, sha256).

Owner approval: Expo Go test PASSED 2026-11-16 ("Everything looks perfect").
Crop choice: **A** (y=0, head-centred) — already built into `assets/`.

## Steps
1. [x] `app.json`: name `خشوع`, slug `khushu`, adaptive icon `#C87775`, `expo-splash-screen` plugin
2. [x] Icon set generated from owner's photo (`jimp-compact`, no ImageMagick on phone)
3. [x] Brand strings: boot screen, drawer, Home header, `i18n.ts` (`Khushu` / `خشوع`), share copy
4. [x] Verify before approval: `tsc --noEmit` 0, `expo export` 0, config parses, bundle has the name
5. [x] Owner Expo Go test → PASSED
6. [ ] Bump 1.6.0 → 1.7.0 (app.json + package.json + package-lock + APP_VERSION in App.tsx)
7. [ ] Re-verify (tsc + export) after the bump
8. [ ] Commit → push `main` → tag `v1.7.0`
9. [ ] Watch tag CI, download APK via `~/gh-release-download.sh`, verify sha256 vs release digest
10. [ ] Copy APK to `/storage/emulated/0/Download/RakaatCounter-release.apk` (`rm -f` first, then sha)
11. [ ] Website: rename to خشوع / Khushu, new icon asset, real size + sha256 + version on
        `rakaatcounter.html`, home card + i18n dicts + meta/OG/JSON-LD
12. [ ] Push site, wait for Pages build, verify live bytes (page, icon, APK content-length)
13. [ ] Replace the hosted APK in the FocusBlocker repo root (stable filename) with the new build

## Decisions
- Android package stays `com.elyasyy23.rakaatcounter` → the APK installs as an update (data survives).
- APK asset filename stays `RakaatCounter-release.apk` (stable name = no Chrome "download again?").
- `assets/old-icons/` and `icon-preview/` are gitignored (local reference only).
- Site version/size/hash are updated ONLY from the real published release (never guessed).

## NOW
Step 6: bumping versions, then push + tag.
