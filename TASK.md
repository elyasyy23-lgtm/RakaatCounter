# TASK — RakaatCounter v1.6.0 (madhhab + header + text-error fix)

GOAL: apply the owner's 7-item batch, verify locally, hand over the Expo Go link, WAIT for approval.
Then (only after approval): bump 1.5.0 -> 1.6.0, commit, push main, tag v1.6.0, CI build, deliver APK.

Owner's list:
1. [x] Fix "Text strings must be rendered within a <Text> component"
2. [x] Madhhab selector in Settings (Hanafi / Shafi'i / Maliki / Hanbali) + AsyncStorage
3. [x] Home shows the 5 daily prayers with rakaat counts from the selected madhhab
4. [x] "RakaatCounter" shown clearly in the Header
5. [x] Language selector (Persian / English) in Settings
6. [x] Recalibrate button on the Home screen
7. [x] Qibla compass below the Sujud counter on the Prayer screen
8. [x] Verify: `npx tsc --noEmit` rc=0 + `npx expo export --platform android --no-bytecode` rc=0
9. [~] Metro live (localhost) + handed over exp://127.0.0.1:8081, WAITING for owner OK

## Decisions
- ROOT CAUSE of the Text error: `drawerLabel: () => t(route.name)` in Drawer.Navigator screenOptions.
  @react-navigation/drawer wraps a STRING label in <Text>, but renders a FUNCTION's return value as a
  raw child of a <View> -> exact error. Fixed to `drawerLabel: t(route.name)` (plain string).
- Madhhab does not change the fard count (2-4-4-3-4 = 17 in all four schools). It changes the
  emphasised Sunnah + Witr, so Home shows fard as the tap target and the sunnah/witr line per prayer.
- Prayer table lives in App.tsx (`PRAYER_PLANS`), totals via `dailyTotals()`.
- Madhhab persisted in AsyncStorage key `@rakaat_madhhab` (language: `@rakaat_language`).
- App name in Home header ("RakaatCounter"); hero keeps only the mosque badge + tagline (no duplicate title).
- Recalibrate = Home card -> Prayer screen in `calibrateOnly` mode -> success card -> Back to Home.

## NOW
All 7 changes coded + verified (tsc rc=0, android bundle rc=0, 2.8 MB). Metro live on localhost.
HANDED OVER exp://127.0.0.1:8081 — WAITING for the owner's Expo Go confirmation.
NEXT (only after OK): bump 1.5.0 -> 1.6.0 (app.json + package.json + APP_VERSION), commit,
push main, tag v1.6.0, CI build, deliver APK to /storage/emulated/0/Download/.

## 2026-11-16 — v1.6.0 part 2: prayer SEQUENCE model + small Qibla toggle (DONE, verified, NOT built)
- `prayerSequence(madhhab, prayer)` (App.tsx, next to PRAYER_PLANS) builds the ordered parts:
  Sunnah before → Fard → Sunnah after → Witr, straight from the madhhab table.
- `partTitle(part, prayerName, t)` → "2 Rakaat Sunnah Fajr" / "3 Rakaat Fard Maghrib" /
  "20 Rakaat Taraweeh" (nafl kind). i18n keys: '{n} Rakaat {name}', '{n} Rakaat Sunnah {name}',
  '{n} Rakaat Fard {name}', '{n} Rakaat Witr {name}', 'PART {i} OF {n}', 'Next: {title}',
  'Tap to activate', 'Tap Stop Prayer when you are ready.'.
- Home hands `{ plan, prayerName, sessionId }` to Prayer (Taraweeh = single nafl segment of 20).
- PrayerScreen: `partIndex` + `part`; title replaces the old TARGET pill; 'PART i OF n' line.
  Completion effect zeroes rakaat/sajdah/isSujud + shows الحمدلله + vibrates, then a 2.8 s
  auto-advance effect moves to the next part (resetPart). Last part: stays on الحمدلله at 0.
  totalSujud stays CUMULATIVE for the whole prayer on purpose.
- Sensor listener now guarded by `!prayerComplete` so a sujud during the الحمدلله beat is ignored.
- QiblaCompass: compact horizontal card, dial 84, WHITE idle / BRIGHT GREEN (#22C55E) active;
  the tap toggles and is the ONLY trigger for the magnetometer + location permission.
- Verified: tsc rc=0, expo export android rc=0 (2.8 MB), Metro manifest 200 / bundle 200.
- NOW: waiting for owner Expo Go approval → then bump 1.6.0, commit, push main, tag, CI.

## 2026-11-16 — v1.6.0 part 3: single-step 10s calibration (DONE, verified, NOT built)
- Calibration is now ONE ambient measurement of `CALIBRATION_MS = 10000` (App.tsx near APP_VERSION).
  The old two-step flow (3s ambient → 3s "cover the sensor") is GONE: no CALIBRATING_SUJUD state,
  no `sujudLight`, no "Simulating Sujud" screen.
- Every lux reading in the window is summed in `ambientSumRef`/`ambientCountRef` (sensor listener);
  at the end the AVERAGE decides both thresholds: dark = round(avg*0.45), light = round(avg*0.7),
  hysteresis band 45–70%. Very dark room guard: if avg < 8 → dark = 1, light = max(2, avg-1);
  and `if (light <= dark) light = dark + 2`. Logged: `Calibrated — ambient N lux (S samples) → …`.
- Screen: one step ("MEASURING ROOM LIGHT"), live lux pill + countdown pill `{n}s`, hint
  "Hold the phone where you normally pray and keep the top uncovered."
- A NEW PRAYER SESSION re-runs calibration: the sessionId effect now also does
  `setAppState('CALIBRATING_AMBIENT')` — every prayer gets fresh thresholds (Fajr light ≠ Isha
  light). Within a session, part boundaries do NOT recalibrate.
- Calibrate-only visit (Home card) now really measures every time (before, a stale PRAYING state
  jumped straight to the "complete" screen) and the success screen shows `Ambient {lux} lux`.
- Help screen steps rewritten to the 10-second flow.
- Verified: tsc rc=0, expo export android rc=0, Metro manifest 200 / bundle 200 (9,562,633 B).
- NOW: waiting for owner Expo Go approval → bump 1.6.0, commit, push main, tag, CI.

### v1.6.0 part 4 — sujud de-duplication + silent Qibla consent (2026-11-16, code done + verified, NOT built)
- Sujud detector guards (PrayerScreen sensor listener): `MIN_SUJUD_MS = 500` + `SUJUD_COOLDOWN_MS = 3000`.
  START ignored while `Date.now() < sujudCooldownUntilRef`; END measures `heldMs` from
  `sujudStartedAtRef` and is DISCARDED (state cleared, no count, log `Sujud ignored — too short`)
  when < 500 ms; a counted END sets the 3 s cooldown. Both refs reset in `resetCounters()` and
  `resetPart()` so a new prayer/part never starts with a stale cooldown.
- QiblaCompass: the TAP is the consent. `locate()` = (1) read cached coords from AsyncStorage
  `@rakaat_location` and show the bearing with ZERO location calls, (2) only if the OS already
  granted permission, silently refresh via `getLastKnownPositionAsync` + `getCurrentPositionAsync`
  and re-save. No permission call at all when a cached fix exists. First-ever tap with no cache and
  no grant = the single unavoidable Android system sheet; after a denial it never asks again —
  tiny underlined line `Enable Location in Settings` → `Linking.openSettings()`. Removed the old
  `Enable Location` button + its two styles; i18n swapped to `Location is off for this app.` +
  `Enable Location in Settings`.
- Verified: `tsc --noEmit` rc=0, `expo export --platform android --no-bytecode` rc=0 (2.8 MB),
  Metro manifest 200 / dev bundle 200 size=9,566,310, new strings present in the bundle.

### v1.6.0 part 5 — Support screen + share link + part reset (2026-11-16, code done + verified, NOT built)
- New `SupportScreen` (drawer "Support Us" / پشتیبانی, icon heart) with two cards:
  (1) Rubika `@yasmajyd` → `https://rubika.ir/yasmajyd` via `Linking.openURL`; (2) Crypto Donation
  USDT TRC20 `TANP1ibS4DsF2C1p1rBGAZ5MrGZyS5sUmU` in a bordered address box (network label
  `USDT · TRC20`, selectable text) + `Copy Address` button → `Clipboard.setStringAsync`, flips to
  green `Copied!` (`checkmark-circle`) for 1.6 s. Constants `RUBIKA_URL`, `RUBIKA_ID`,
  `DONATION_USDT_TRC20` at the top of the screen block.
- Share message now `Check out RakaatCounter! https://elyasyy23-lgtm.github.io/FocusBlocker/`
  (old placeholder search-console string deleted from i18n).
- `resetPart()` now also zeroes `totalSujud`, so a new part (Sunnah → Fard) starts both counters
  at 0 instead of inheriting the previous part's total.
- Verified: `tsc --noEmit` rc=0, `expo export --no-bytecode` rc=0, Metro manifest 200 / dev bundle
  200 size=9,577,125, bundle contains the Rubika URL, the wallet address and the site URL.

### v1.6.0 part 6 — owner share text · Donate screen · Qibla auto-on (2026-11-16, code done + verified, NOT built)
- Share message is now the owner's verbatim Persian copy, held in a `SHARE_MESSAGE` constant (NOT
  translated): «تمرکز کامل در نماز، بدون نگرانی از فراموشی رکعت‌ها. 🌙» / «شمارنده هوشمند رکعت با
  قابلیت تشخیص خودکار سجده. همین حالا تجربه کنید:» / site URL. Old i18n share key removed.
- Crypto donation split into its own drawer screen `Donate` (fa «حمایت از ما», Ionicons cash):
  `DonateScreen` = gold hero + USDT TRC20 card + `Copy Address`. `SupportScreen` keeps only the
  Rubika card + a footnote pointing at the Donate menu entry.
- Qibla compass now `useFocusEffect`: active=true on entering Prayer, active=false on blur (the
  magnetometer unsubscribes). Tap still toggles manually. The OS permission sheet is allowed at most
  ONCE ever — `LOCATION_ASKED_KEY = '@rakaat_loc_asked'` is written before the request — and cached
  coords (`@rakaat_location`) still give the bearing with zero location calls.
- Verified: `tsc --noEmit` rc=0, `expo export --no-bytecode` rc=0, Metro manifest 200 / dev bundle
  200 size=9,581,303 with the Persian share text, 🌙, wallet, Rubika URL, `حمایت از ما` and
  `useFocusEffect` all present.

### v1.6.0 part 7 — dynamic share · donate copy · no Google location dialog (2026-11-16, verified, NOT built)
- Share is now language-aware: `SHARE_URL`, `SHARE_MESSAGE_FA`, `SHARE_MESSAGE_EN` constants; the
  Share screen reads `lang` from SettingsContext and sends the matching one.
- Donate subtitle replaced by the owner's text (+ its English twin) — i18n key
  `Your support keeps this app free and ad-free — every contribution is a step in serving those who pray. 🌙`.
- `getCurrentPositionAsync({ accuracy: Balanced, mayShowUserSettingsDialog: false })` — kills the
  Google "improve location accuracy" dialog; note expo-location takes these as ONE options object
  (there is no second argument), and `enableNetworkProviderAsync()` is what normally shows that
  dialog and is never called here.
- Verified `tsc --noEmit` rc=0, export rc=0, Metro manifest 200 / bundle 200 size=9,582,185.

### v1.6.0 part 8 — Qibla heading math + minimal arrow UI (2026-11-16, verified, NOT built)
- ROOT CAUSE of the wrong direction: the magnetometer chip axes (X right, Y top) put the raw
  `atan2(y, x)` 90° off a real compass heading. New `compassHeading(x, y)` = `(atan2(y,x)deg - 90
  + 360) % 360`. The great-circle `qiblaBearing()` was already correct — verified numerically:
  Tehran 218.4°, Mashhad 234.6°, Tabriz 200.3°, Shiraz 237.5°, Ahvaz 220.8° (owner's 234° = Mashhad).
- UI simplified to a bare `navigation` arrow (76 px) + the word "Qibla" under it: card, dial, "N",
  degrees and distance text all removed; dead styles (`qiblaCard/Body/Dial/N/Needle/Center/
  TextWrap/TitleRow/Title/Hint`) and dead i18n keys (`{d}° to Qibla`, `{km} km away`) deleted.
- Arrow white on the dark theme (owner reference), theme text on light; turns `#22C55E` when the
  arrow is within 10° of the Qibla; only a real problem (no sensor / location off / locating) shows
  a small note line.
- Verified `tsc --noEmit` rc=0, export rc=0, Metro manifest 200 / dev bundle 200 (9,581,088 B).
