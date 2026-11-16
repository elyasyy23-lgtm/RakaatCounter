import React, { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Switch,
  Share,
  Alert,
  ScrollView,
  Vibration,
  Platform,
  Linking,
} from 'react-native';
import { LightSensor, Magnetometer } from 'expo-sensors';
import * as Location from 'expo-location';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import { translate, type Lang } from './i18n';
import {
  SafeAreaProvider,
  SafeAreaView,
  initialWindowMetrics,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { NavigationContainer, useFocusEffect } from '@react-navigation/native';
import {
  createDrawerNavigator,
  DrawerContentScrollView,
  DrawerItemList,
} from '@react-navigation/drawer';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';

const APP_VERSION = '1.6.0';

// Calibration = one ambient measurement of this length. 10s of samples gives a
// stable average instead of one jittery reading.
const CALIBRATION_MS = 10000;

// Sujud detection guards. A real sajdah lasts seconds; a hand passing over the
// sensor or a light flicker lasts a few hundred milliseconds. Anything shorter
// than MIN_SUJUD_MS is thrown away, and after a counted sajdah the detector stays
// closed for SUJUD_COOLDOWN_MS so one movement can never count twice.
const MIN_SUJUD_MS = 500;
const SUJUD_COOLDOWN_MS = 3000;

// Coordinates are cached so the compass can work with NO location call at all
// (no permission dialog) once the user has granted location even one time.
const LOCATION_STORAGE_KEY = '@rakaat_location';
// Set the first time the OS permission sheet is shown, so it can never appear
// twice: from then on a refusal is answered with the Settings line only.
const LOCATION_ASKED_KEY = '@rakaat_loc_asked';

const LANG_STORAGE_KEY = '@rakaat_language';
const MADHHAB_STORAGE_KEY = '@rakaat_madhhab';

// --- Madhhab (school of jurisprudence) -------------------------------------
// The FARD rakaat count is identical in all four schools (2-4-4-3-4 = 17).
// What differs is the emphasised (mu'akkadah) Sunnah and the Witr, so the Home
// screen shows both: the fard count to pray, and the Sunnah around it.
type Madhhab = 'hanafi' | 'shafii' | 'maliki' | 'hanbali';

type PrayerId = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';

type PrayerPlan = { before: number; after: number; witr: number };

type PrayerDef = {
  id: PrayerId;
  name: string;
  fard: number;
  icon: string;
};

const PRAYERS: PrayerDef[] = [
  { id: 'fajr', name: 'Fajr', fard: 2, icon: 'weather-sunset-up' },
  { id: 'dhuhr', name: 'Dhuhr', fard: 4, icon: 'white-balance-sunny' },
  { id: 'asr', name: 'Asr', fard: 4, icon: 'weather-partly-cloudy' },
  { id: 'maghrib', name: 'Maghrib', fard: 3, icon: 'weather-sunset-down' },
  { id: 'isha', name: 'Isha', fard: 4, icon: 'weather-night' },
];

const MADHHABS: { id: Madhhab; label: string }[] = [
  { id: 'hanafi', label: 'Hanafi' },
  { id: 'shafii', label: "Shafi'i" },
  { id: 'maliki', label: 'Maliki' },
  { id: 'hanbali', label: 'Hanbali' },
];

const PRAYER_PLANS: Record<Madhhab, Record<PrayerId, PrayerPlan>> = {
  hanafi: {
    fajr: { before: 2, after: 0, witr: 0 },
    dhuhr: { before: 4, after: 2, witr: 0 },
    asr: { before: 4, after: 0, witr: 0 },
    maghrib: { before: 0, after: 2, witr: 0 },
    isha: { before: 4, after: 2, witr: 3 },
  },
  shafii: {
    fajr: { before: 2, after: 0, witr: 0 },
    dhuhr: { before: 4, after: 2, witr: 0 },
    asr: { before: 0, after: 0, witr: 0 },
    maghrib: { before: 0, after: 2, witr: 0 },
    isha: { before: 0, after: 2, witr: 3 },
  },
  maliki: {
    fajr: { before: 2, after: 0, witr: 0 },
    dhuhr: { before: 2, after: 2, witr: 0 },
    asr: { before: 0, after: 0, witr: 0 },
    maghrib: { before: 0, after: 2, witr: 0 },
    isha: { before: 0, after: 2, witr: 1 },
  },
  hanbali: {
    fajr: { before: 2, after: 0, witr: 0 },
    dhuhr: { before: 4, after: 2, witr: 0 },
    asr: { before: 0, after: 0, witr: 0 },
    maghrib: { before: 0, after: 2, witr: 0 },
    isha: { before: 0, after: 2, witr: 3 },
  },
};

// --- Prayer parts (the order a prayer is actually performed in) --------------
// One prayer is a SEQUENCE, not a single block: Sunnah → Fard → Sunnah → Witr.
// Home builds the sequence from the madhhab table and hands it to the Prayer
// screen; the screen walks through it part by part, resetting the counters at
// every boundary (2 Sunnah Fajr → 2 Fard Fajr → done).
type SegmentKind = 'sunnah' | 'fard' | 'witr' | 'nafl';

type Segment = { kind: SegmentKind; rakaat: number };

function prayerSequence(madhhab: Madhhab, prayer: PrayerDef): Segment[] {
  const plan = PRAYER_PLANS[madhhab][prayer.id];
  const seq: Segment[] = [];
  if (plan.before > 0) seq.push({ kind: 'sunnah', rakaat: plan.before });
  seq.push({ kind: 'fard', rakaat: prayer.fard });
  if (plan.after > 0) seq.push({ kind: 'sunnah', rakaat: plan.after });
  if (plan.witr > 0) seq.push({ kind: 'witr', rakaat: plan.witr });
  return seq;
}

// Heading of the Prayer screen: "2 Rakaat Sunnah Fajr", "3 Rakaat Fard Maghrib".
function partTitle(part: Segment, prayerName: string, t: (key: string, params?: Record<string, string | number>) => string): string {
  const name = prayerName ? t(prayerName) : '';
  if (!name) return t('{n} Rakaat', { n: part.rakaat }).trim();
  if (part.kind === 'nafl') return t('{n} Rakaat {name}', { n: part.rakaat, name }).trim();
  if (part.kind === 'sunnah') return t('{n} Rakaat Sunnah {name}', { n: part.rakaat, name }).trim();
  if (part.kind === 'witr') return t('{n} Rakaat Witr {name}', { n: part.rakaat, name }).trim();
  return t('{n} Rakaat Fard {name}', { n: part.rakaat, name }).trim();
}

// Fard is 17 everywhere; sunnah/witr totals come from the table above.
function dailyTotals(madhhab: Madhhab) {
  const plans = PRAYER_PLANS[madhhab];
  let fard = 0;
  let sunnah = 0;
  let witr = 0;
  for (const p of PRAYERS) {
    fard += p.fard;
    sunnah += plans[p.id].before + plans[p.id].after;
    witr += plans[p.id].witr;
  }
  return { fard, sunnah, witr };
}

// Kaaba coordinates — the fixed target for the Qibla bearing.
const KAABA = { lat: 21.4225, lon: 39.8262 };

// Inter is loaded through expo-font. Android ignores `fontWeight` when a
// custom fontFamily is set, so every weight gets its own family name here.
const F = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semi: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extra: 'Inter_800ExtraBold',
};

// --- Global Log Context ---
const LogContext = createContext<{ logs: string[]; addLog: (msg: string) => void }>({
  logs: [],
  addLog: () => {},
});

// --- Settings Context ---
type SettingsValue = {
  isDarkMode: boolean;
  vibrationEnabled: boolean;
  lang: Lang;
  madhhab: Madhhab;
  t: (key: string, params?: Record<string, string | number>) => string;
  toggleDarkMode: () => void;
  toggleVibration: () => void;
  setLanguage: (lang: Lang) => void;
  setMadhhab: (madhhab: Madhhab) => void;
};

const SettingsContext = createContext<SettingsValue>({
  isDarkMode: true,
  vibrationEnabled: true,
  lang: 'en',
  madhhab: 'hanafi',
  t: (key: string) => key,
  toggleDarkMode: () => {},
  toggleVibration: () => {},
  setLanguage: () => {},
  setMadhhab: () => {},
});

// --- Main App Component ---
export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [lang, setLang] = useState<Lang>('en');
  const [madhhab, setMadhhabState] = useState<Madhhab>('hanafi');
  const [logs, setLogs] = useState<string[]>([]);

  // Restore the saved language and madhhab once, then persist every change.
  // Failures are silent — a missing key just keeps the defaults.
  useEffect(() => {
    AsyncStorage.getItem(LANG_STORAGE_KEY)
      .then((saved) => {
        if (saved === 'en' || saved === 'fa') setLang(saved);
      })
      .catch(() => {});
    AsyncStorage.getItem(MADHHAB_STORAGE_KEY)
      .then((saved) => {
        if (saved && MADHHABS.some((m) => m.id === saved)) setMadhhabState(saved as Madhhab);
      })
      .catch(() => {});
  }, []);

  const setLanguage = useCallback((next: Lang) => {
    setLang(next);
    AsyncStorage.setItem(LANG_STORAGE_KEY, next).catch(() => {});
  }, []);

  const setMadhhab = useCallback((next: Madhhab) => {
    setMadhhabState(next);
    AsyncStorage.setItem(MADHHAB_STORAGE_KEY, next).catch(() => {});
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => translate(lang, key, params),
    [lang],
  );

  // Load the UI font AND the vector-icon fonts through expo-font explicitly.
  // @expo/vector-icons normally loads its own fonts lazily, which can silently
  // fail in a release build; loading them here is the supported path and makes
  // the icons render in the APK too.
  const [fontsLoaded, fontError] = useFonts({
    ...Ionicons.font,
    ...MaterialCommunityIcons.font,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  // Safety net: never leave the user stuck on the boot screen if a font load
  // hangs. After 4s we render anyway and the system font takes over.
  const [fontTimedOut, setFontTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setFontTimedOut(true), 4000);
    return () => clearTimeout(t);
  }, []);

  const fontsReady = fontsLoaded || !!fontError || fontTimedOut;
  const theme = getTheme(isDarkMode);

  // Stable identity on purpose: consumers use addLog inside useEffect deps, and a
  // fresh function every render would re-run those effects (and re-log) on each
  // log update — an endless loop.
  const addLog = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${time}] ${msg}`, ...prev].slice(0, 50));
  }, []);

  if (!fontsReady) {
    return (
      <View style={[styles.bootScreen, { backgroundColor: theme.bg }]}>
        <StatusBar barStyle="light-content" />
        <View style={[styles.heroBadge, { backgroundColor: theme.accentSoft, borderColor: theme.border }]}>
          <MaterialCommunityIcons name="mosque" size={64} color={theme.accent} />
        </View>
        <Text style={[styles.bootText, { color: theme.textMuted }]}>RakaatCounter</Text>
        <ActivityIndicator color={theme.accent} style={{ marginTop: 24 }} />
      </View>
    );
  }

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <SettingsContext.Provider
        value={{
        isDarkMode,
        vibrationEnabled,
        lang,
        madhhab,
        t,
        toggleDarkMode: () => setIsDarkMode(!isDarkMode),
        toggleVibration: () => setVibrationEnabled(!vibrationEnabled),
        setLanguage,
        setMadhhab,
      }}
    >
      <LogContext.Provider value={{ logs, addLog }}>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <NavigationContainer>
          <Drawer.Navigator
            initialRouteName="Home"
            drawerContent={(props) => <CustomDrawerContent {...props} />}
            screenOptions={({ route }) => ({
              headerStyle: {
                backgroundColor: theme.bg,
                elevation: 0,
                shadowOpacity: 0,
                borderBottomWidth: 0,
              },
              headerShadowVisible: false,
              headerTintColor: theme.text,
              headerTitle: t(route.name),
              headerTitleStyle: {
                fontFamily: F.bold,
                fontSize: 18,
                letterSpacing: -0.2,
              },
              headerTitleAlign: 'left',
              // MUST be a plain string, never a function: DrawerItem wraps a string
              // in <Text>, but renders a function's RESULT as a raw child of a
              // <View> — which throws "Text strings must be rendered within a
              // <Text> component".
              drawerLabel: t(route.name),
              drawerStyle: {
                backgroundColor: theme.drawerBg,
                width: 296,
                borderTopRightRadius: 26,
                borderBottomRightRadius: 26,
              },
              drawerActiveTintColor: theme.accent,
              drawerInactiveTintColor: theme.textMuted,
              drawerActiveBackgroundColor: theme.accentSoft,
              drawerItemStyle: {
                borderRadius: 14,
                marginHorizontal: 12,
                marginVertical: 3,
                paddingVertical: 3,
              },
              drawerLabelStyle: {
                fontFamily: F.semi,
                fontSize: 15,
                letterSpacing: 0.1,
                marginLeft: -8,
              },
              drawerIcon: ({ color, size, focused }) => {
                let iconName;
                if (route.name === 'Home') iconName = focused ? 'home' : 'home-outline';
                else if (route.name === 'Settings') iconName = focused ? 'settings' : 'settings-outline';
                else if (route.name === 'Help') iconName = focused ? 'help-circle' : 'help-circle-outline';
                else if (route.name === 'Support Us') iconName = focused ? 'heart' : 'heart-outline';
                else if (route.name === 'Donate') iconName = focused ? 'cash' : 'cash-outline';
                else if (route.name === 'Share App') iconName = focused ? 'share-social' : 'share-social-outline';
                else if (route.name === 'Debug Logs') iconName = focused ? 'terminal' : 'terminal-outline';
                return <Ionicons name={iconName as any} size={size ?? 22} color={color} />;
              },
            })}
          >
            <Drawer.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
            <Drawer.Screen name="Settings" component={SettingsScreen} />
            <Drawer.Screen name="Debug Logs" component={LogsScreen} />
            <Drawer.Screen name="Help" component={HelpScreen} />
            <Drawer.Screen name="Support Us" component={SupportScreen} />
            <Drawer.Screen name="Donate" component={DonateScreen} />
            <Drawer.Screen name="Share App" component={ShareScreen} />
            <Drawer.Screen
              name="Prayer"
              component={PrayerScreen}
              options={{ drawerItemStyle: { display: 'none' }, headerShown: false }}
            />
          </Drawer.Navigator>
        </NavigationContainer>
      </LogContext.Provider>
      </SettingsContext.Provider>
    </SafeAreaProvider>
  );
}

const Drawer = createDrawerNavigator();

// --- Custom Drawer (branded header + spaced, rounded items) ---
function CustomDrawerContent(props: any) {
  const { isDarkMode, t } = useContext(SettingsContext);
  const theme = getTheme(isDarkMode);
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.drawerRoot, { backgroundColor: theme.drawerBg }]}>
      <View style={[styles.drawerHeader, { paddingTop: 26 + insets.top }]}>
        <View
          style={[
            styles.drawerBadge,
            { backgroundColor: theme.accentSoft, borderColor: theme.border },
          ]}
        >
          <MaterialCommunityIcons name="mosque" size={26} color={theme.accent} />
        </View>
        <Text style={[styles.drawerTitle, { color: theme.text }]}>{t('RakaatCounter')}</Text>
        <Text style={[styles.drawerSub, { color: theme.textMuted }]}>
          {t('Enhancing Your Salah')}
        </Text>
      </View>

      <View style={[styles.drawerDivider, { backgroundColor: theme.borderSoft }]} />

      <DrawerContentScrollView
        {...props}
        contentContainerStyle={styles.drawerScroll}
        showsVerticalScrollIndicator={false}
      >
        <DrawerItemList {...props} />
      </DrawerContentScrollView>

      <View style={[styles.drawerFooter, { borderTopColor: theme.borderSoft }]}>
        <Ionicons name="moon-outline" size={14} color={theme.textMuted} />
        <Text style={[styles.drawerFooterText, { color: theme.textMuted }]}>
          v{APP_VERSION}
        </Text>
      </View>
    </View>
  );
}

// --- 1. Home Screen ---
function HomeScreen({ navigation }: any) {
  const { isDarkMode, madhhab, t } = useContext(SettingsContext);
  const theme = getTheme(isDarkMode);
  const plans = PRAYER_PLANS[madhhab];
  const totals = dailyTotals(madhhab);

  const startPrayer = (sequence: Segment[], prayerName: string) => {
    // A fresh id per tap: the Prayer screen resets its counters whenever this
    // changes, so a new prayer always starts from absolute zero — the drawer
    // navigator keeps that screen mounted between visits, so relying on a
    // remount would leak the previous prayer's numbers.
    navigation.navigate('Prayer', {
      plan: sequence,
      prayerName,
      sessionId: Date.now(),
    });
  };

  // Calibration-only visit: runs the light calibration and returns, without
  // touching (or starting) any prayer counters.
  const startCalibration = () => {
    navigation.navigate('Prayer', {
      targetRakaat: 0,
      sessionId: Date.now(),
      calibrateOnly: true,
    });
  };

  // One line of Sunnah/Witr detail per prayer, built from the madhhab table.
  // An empty result means the school has no emphasised Sunnah for that prayer.
  const planDetail = (plan: PrayerPlan) => {
    const parts: string[] = [];
    if (plan.before > 0) parts.push(t('{n} Sunnah before', { n: plan.before }));
    if (plan.after > 0) parts.push(t('{n} Sunnah after', { n: plan.after }));
    if (plan.witr > 0) parts.push(t('{n} Witr', { n: plan.witr }));
    return parts.length > 0 ? parts.join(' · ') : t('Fard only');
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: theme.bg }]}>
      <View style={styles.topBar}>
        <TouchableOpacity
          style={[styles.menuButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={() => navigation.openDrawer()}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('Open menu')}
        >
          <Ionicons name="menu" size={22} color={theme.text} />
        </TouchableOpacity>
        {/* App name lives in the header so it is always visible on Home */}
        <Text style={[styles.brandTitle, { color: theme.text }]} numberOfLines={1}>
          {t('RakaatCounter')}
        </Text>
        <View style={styles.topBarSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.homeScroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View
            style={[
              styles.heroBadge,
              {
                backgroundColor: theme.accentSoft,
                borderColor: theme.border,
                shadowColor: theme.accent,
                shadowOpacity: theme.isDark ? 0.45 : 0.22,
              },
            ]}
          >
            <MaterialCommunityIcons name="mosque" size={68} color={theme.accent} />
          </View>
          <Text style={[styles.heroSub, { color: theme.textMuted }]}>
            {t('Enhancing Your Salah Experience')}
          </Text>
        </View>

        <View style={styles.sectionHeadRow}>
          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>
            {t("TODAY'S PRAYERS")}
          </Text>
          <View style={styles.headerSpacer} />
          <View
            style={[
              styles.madhhabPill,
              { backgroundColor: theme.goldSoft, borderColor: theme.border },
            ]}
          >
            <MaterialCommunityIcons name="book-open-variant" size={12} color={theme.gold} />
            <Text style={[styles.madhhabPillText, { color: theme.gold }]}>
              {t(MADHHABS.find((m) => m.id === madhhab)?.label ?? 'Hanafi')}
            </Text>
          </View>
        </View>

        {/* The five daily prayers, each tappable — the target is the fard count */}
        {PRAYERS.map((prayer) => (
          <TouchableOpacity
            key={prayer.id}
            activeOpacity={0.85}
            onPress={() => startPrayer(prayerSequence(madhhab, prayer), prayer.name)}
            accessibilityRole="button"
            accessibilityLabel={`Start ${prayer.name} prayer`}
            style={[
              styles.prayerCard,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                shadowColor: theme.shadow,
                shadowOpacity: theme.shadowOpacity,
              },
            ]}
          >
            <View
              style={[
                styles.prayerIcon,
                { backgroundColor: theme.accentSoft, borderColor: theme.border },
              ]}
            >
              <MaterialCommunityIcons
                name={prayer.icon as any}
                size={21}
                color={theme.accent}
              />
            </View>
            <View style={styles.prayerTextWrap}>
              <Text style={[styles.prayerName, { color: theme.text }]}>{t(prayer.name)}</Text>
              <Text style={[styles.prayerDetail, { color: theme.textMuted }]}>
                {planDetail(plans[prayer.id])}
              </Text>
            </View>
            <View style={styles.prayerCountWrap}>
              <Text style={[styles.prayerCount, { color: theme.accent }]}>{prayer.fard}</Text>
              <Text style={[styles.prayerCountLabel, { color: theme.textMuted }]}>
                {t('FARD')}
              </Text>
            </View>
          </TouchableOpacity>
        ))}

        <View
          style={[
            styles.totalsCard,
            { backgroundColor: theme.surfaceAlt, borderColor: theme.borderSoft },
          ]}
        >
          <MaterialCommunityIcons name="information-outline" size={17} color={theme.accent} />
          <Text style={[styles.totalsText, { color: theme.textMuted }]}>
            {t('{f} Fard · {s} Sunnah · {w} Witr every day', {
              f: totals.fard,
              s: totals.sunnah,
              w: totals.witr,
            })}
          </Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => startPrayer([{ kind: 'nafl', rakaat: 20 }], 'Taraweeh')}
          accessibilityRole="button"
          accessibilityLabel="Start 20 rakaat Taraweeh prayer"
          style={[
            styles.taraweehCard,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              shadowColor: theme.shadow,
              shadowOpacity: theme.shadowOpacity,
            },
          ]}
        >
          <View
            style={[
              styles.taraweehBadge,
              { backgroundColor: theme.goldSoft, borderColor: theme.border },
            ]}
          >
            <MaterialCommunityIcons name="moon-waning-crescent" size={24} color={theme.gold} />
          </View>
          <View style={styles.taraweehText}>
            <Text style={[styles.taraweehTitle, { color: theme.text }]}>{t('Taraweeh')}</Text>
            <Text style={[styles.taraweehSub, { color: theme.textMuted }]}>{t('20 Rakaat')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
        </TouchableOpacity>

        <View style={[styles.tipCard, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderSoft }]}>
          <MaterialCommunityIcons name="lightbulb-on-outline" size={18} color={theme.accent} />
          <Text style={[styles.tipText, { color: theme.textMuted }]}>
            {t('Keep the phone on your prayer mat with the top edge clear.')}
          </Text>
        </View>

        {/* Recalibration lives here (not on the Prayer screen) so the room light
            can be re-learned before a prayer starts. */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={startCalibration}
          accessibilityRole="button"
          accessibilityLabel="Recalibrate sensor"
          style={[
            styles.recalCard,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              shadowColor: theme.shadow,
              shadowOpacity: theme.shadowOpacity,
            },
          ]}
        >
          <View
            style={[
              styles.recalCardBadge,
              { backgroundColor: theme.accentSoft, borderColor: theme.border },
            ]}
          >
            <Ionicons name="refresh" size={22} color={theme.accent} />
          </View>
          <View style={styles.taraweehText}>
            <Text style={[styles.taraweehTitle, { color: theme.text }]}>
              {t('Recalibrate Sensor')}
            </Text>
            <Text style={[styles.taraweehSub, { color: theme.textMuted }]}>
              {t('Re-run the light calibration for the current room.')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// --- 2. Prayer Screen ---
function PrayerScreen({ route, navigation }: any) {
  const { isDarkMode, vibrationEnabled, t } = useContext(SettingsContext);
  const { addLog } = useContext(LogContext);
  const theme = getTheme(isDarkMode);
  const { sessionId, calibrateOnly } = route.params;

  // The ordered parts of THIS prayer (Sunnah → Fard → Sunnah → Witr), built by
  // Home from the selected madhhab. The fallback keeps old sessions working.
  const plan: Segment[] =
    Array.isArray(route.params.plan) && route.params.plan.length > 0
      ? route.params.plan
      : [{ kind: 'fard', rakaat: route.params.targetRakaat ?? 0 }];
  const prayerName: string = route.params.prayerName ?? '';

  // Which part of the prayer the user is currently praying (0-based).
  const [partIndex, setPartIndex] = useState(0);

  // The part being prayed right now, and its heading.
  const part: Segment = plan[Math.min(partIndex, plan.length - 1)];
  const partTotal = plan.length;

  const [appState, setAppState] = useState('CALIBRATING_AMBIENT');
  const [lightLevel, setLightLevel] = useState(0);
  const [rakaat, setRakaat] = useState(0);
  const [sajdahCount, setSajdahCount] = useState(0);
  // Cumulative for the whole prayer — deliberately NOT reset per rakaat.
  const [totalSujud, setTotalSujud] = useState(0);
  const [isSujud, setIsSujud] = useState(false);
  // True once the CURRENT part reaches its target. If another part follows, the
  // screen shows "الحمدلله" for a beat and then moves on to it by itself; on the
  // last part it stays on "الحمدلله" with the counters at zero until the user
  // taps Stop Prayer.
  const [prayerComplete, setPrayerComplete] = useState(false);

  const [ambientLight, setAmbientLight] = useState(0);
  const [darkThreshold, setDarkThreshold] = useState(50);
  const [lightThreshold, setLightThreshold] = useState(100);
  // Seconds left in the single 10s ambient measurement, shown on the calib screen.
  const [calibSeconds, setCalibSeconds] = useState(Math.round(CALIBRATION_MS / 1000));

  // Latest lux, read by the calibration timer. Kept in a ref so live light
  // changes do not restart the countdown (which would stall calibration).
  const lightRef = useRef(0);

  // Every lux reading seen during the ambient window — the thresholds are derived
  // from their average, so one stray reading (a cloud, a passing shadow) cannot
  // decide the calibration on its own.
  const ambientSumRef = useRef(0);
  const ambientCountRef = useRef(0);

  // Sujud timing guards (see MIN_SUJUD_MS / SUJUD_COOLDOWN_MS): when the current
  // sujud began, and until when the detector ignores new ones.
  const sujudStartedAtRef = useRef(0);
  const sujudCooldownUntilRef = useRef(0);

  // Fires the completion alert exactly once, even if the effect re-runs.
  const completedRef = useRef(false);

  // The single place that puts every counter back to absolute zero:
  // rakaat, the displayed Sujud total, and the internal 0-1 sajdah counter.
  // Used when a prayer session ends (fresh session or Stop Prayer) — a part
  // boundary only clears the per-part counters (see resetPart).
  const resetCounters = useCallback(() => {
    setRakaat(0);
    setSajdahCount(0);
    setTotalSujud(0);
    setIsSujud(false);
    setPrayerComplete(false);
    completedRef.current = false;
    sujudStartedAtRef.current = 0;
    sujudCooldownUntilRef.current = 0;
  }, []);

  // Clears the counters of ONE part when the next part of the same prayer starts.
  // BOTH displayed counters go back to zero, so each part (e.g. Sunnah → Fard)
  // is counted on its own instead of silently inheriting the previous total.
  const resetPart = useCallback(() => {
    setRakaat(0);
    setSajdahCount(0);
    setTotalSujud(0);
    setIsSujud(false);
    setPrayerComplete(false);
    completedRef.current = false;
    sujudStartedAtRef.current = 0;
    sujudCooldownUntilRef.current = 0;
  }, []);

  // A new prayer session (fresh id handed over by Home) starts from absolute
  // zero AND from the first part (Sunnah, if the madhhab has one).
  // This screen stays mounted between visits, so a remount cannot be relied on
  // to clear the previous prayer's numbers.
  useEffect(() => {
    setPartIndex(0);
    resetCounters();
    // Every prayer starts with a FRESH 10-second ambient measurement: the room
    // light at Fajr is not the room light at Isha, and reusing yesterday's
    // thresholds is exactly how a sujud goes undetected.
    setAppState('CALIBRATING_AMBIENT');
  }, [sessionId, resetCounters]);

  useEffect(() => {
    let subscription: any;
    LightSensor.isAvailableAsync().then((available) => {
      if (available) {
        subscription = LightSensor.addListener(({ illuminance }) => {
          const currentLight = Math.round(illuminance);
          lightRef.current = currentLight;
          setLightLevel(currentLight);

          // Single-step calibration: collect every reading for the whole window.
          if (appState === 'CALIBRATING_AMBIENT') {
            ambientSumRef.current += currentLight;
            ambientCountRef.current += 1;
          }

          if (appState === 'PRAYING' && !calibrateOnly && !prayerComplete) {
            const now = Date.now();
            if (currentLight < darkThreshold && !isSujud) {
              // Closed for 3s after a counted sajdah: one movement, one count.
              if (now < sujudCooldownUntilRef.current) return;
              sujudStartedAtRef.current = now;
              setIsSujud(true);
              addLog(`Sujud START (Lux: ${currentLight})`);
              if (vibrationEnabled) Vibration.vibrate(50);
            } else if (currentLight > lightThreshold && isSujud) {
              const heldMs = now - sujudStartedAtRef.current;
              setIsSujud(false);
              // Flicker filter: a hand wave is shorter than half a second, so it
              // must not become a sajdah. The state is cleared either way.
              if (heldMs < MIN_SUJUD_MS) {
                addLog(`Sujud ignored — too short (${heldMs} ms, Lux: ${currentLight})`);
                return;
              }
              addLog(`Sujud END (Lux: ${currentLight}, held ${(heldMs / 1000).toFixed(1)}s)`);
              setTotalSujud((prev) => prev + 1);
              if (vibrationEnabled) Vibration.vibrate(50);
              // PURE updater only. Side effects (logging, Alert, navigation) must
              // never run inside it: React can execute an updater during the render
              // phase, and addLog() updates App (a different component) → the crash
              // "Cannot update a component (App) while rendering PrayerScreen".
              // The 2-sajdah → 1-rakaat transition is handled in the effect below.
              setSajdahCount((prev) => prev + 1);
              sujudCooldownUntilRef.current = now + SUJUD_COOLDOWN_MS;
            }
          }
        });
      }
    });
    return () => { if (subscription) subscription.remove(); };
  }, [appState, isSujud, darkThreshold, lightThreshold, calibrateOnly, prayerComplete]);

  // 2 sajdahs = 1 rakaat. Deliberately an effect and NOT inside the updater above:
  // state updaters must stay pure, and addLog() writes to a different component.
  useEffect(() => {
    if (sajdahCount >= 2) {
      setSajdahCount(0);
      setRakaat((r) => r + 1);
    }
  }, [sajdahCount]);

  // Log each completed rakaat, and close the current PART when its target is
  // reached. Closing a part: show "الحمدلله", zero the counters immediately, and
  // let the effect below move on to the next part. The last part stays on
  // "الحمدلله" until the user taps Stop Prayer.
  useEffect(() => {
    if (rakaat === 0) return;
    addLog(`Rakaat ${rakaat} completed!`);
    if (rakaat < part.rakaat || completedRef.current) return;
    completedRef.current = true;
    setPrayerComplete(true);
    addLog(`${partTitle(part, prayerName, t)} complete.`);
    if (vibrationEnabled) Vibration.vibrate([0, 60, 80, 60]);
    // Counters go back to zero the moment the target is reached.
    setRakaat(0);
    setSajdahCount(0);
    setIsSujud(false);
    // addLog is memoised in App (useCallback), so its identity is stable — but we
    // leave it out of the deps so this effect keys strictly off the rakaat count
    // and the part it belongs to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rakaat, part.rakaat, partIndex]);

  // Auto-advance: after the short "الحمدلله" beat, move to the next part of the
  // prayer and start it from zero. On the last part there is nothing to advance
  // to, so the screen stays on "الحمدلله" with the counters at 0.
  useEffect(() => {
    if (!prayerComplete) return;
    if (partIndex >= plan.length - 1) return;
    const timer = setTimeout(() => {
      const next = plan[partIndex + 1];
      setPartIndex(partIndex + 1);
      resetPart();
      addLog(`Next: ${partTitle(next, prayerName, t)}`);
    }, 2800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prayerComplete, partIndex, plan.length]);

  // Calibration = ONE 10-second ambient measurement. There is no second
  // "cover the sensor" step anymore: both switching thresholds are derived from
  // the average room light alone (a covered sensor reads far below ambient).
  useEffect(() => {
    if (appState !== 'CALIBRATING_AMBIENT') return;
    ambientSumRef.current = 0;
    ambientCountRef.current = 0;
    setCalibSeconds(Math.round(CALIBRATION_MS / 1000));

    const countdown = setInterval(() => {
      setCalibSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    const timer = setTimeout(() => {
      const samples = ambientCountRef.current;
      const average = samples > 0 ? ambientSumRef.current / samples : lightRef.current;
      const ambient = Math.max(0, Math.round(average));

      // Sujud covers the light sensor, so it reads far BELOW the ambient level.
      // Dark switches at 45% of ambient, light at 70% — the 45-70% band is the
      // hysteresis that stops one reading from flipping the state back and forth.
      let dark = Math.round(ambient * 0.45);
      let light = Math.round(ambient * 0.7);
      if (ambient < 8) {
        // Very dark room: percentages would collapse to the same number.
        dark = 1;
        light = Math.max(2, ambient - 1);
      }
      if (light <= dark) light = dark + 2;

      setAmbientLight(ambient);
      setDarkThreshold(dark);
      setLightThreshold(light);
      addLog(
        `Calibrated — ambient ${ambient} lux (${samples} samples) → sujud under ${dark}, up above ${light}`,
      );
      setAppState('PRAYING');
    }, CALIBRATION_MS);

    return () => {
      clearTimeout(timer);
      clearInterval(countdown);
    };
    // addLog is memoised in App, so its identity is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appState]);

  useEffect(() => { activateKeepAwakeAsync(); return () => { deactivateKeepAwake(); }; }, []);

  const calibrating = appState === 'CALIBRATING_AMBIENT';

  if (calibrating) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={[styles.calibScreen, { backgroundColor: theme.bg }]}>
        <View
          style={[
            styles.calibBadge,
            {
              backgroundColor: theme.accentSoft,
              borderColor: theme.border,
              shadowColor: theme.accent,
              shadowOpacity: theme.isDark ? 0.4 : 0.2,
            },
          ]}
        >
          <MaterialCommunityIcons name="white-balance-sunny" size={44} color={theme.accent} />
        </View>

        <Text style={[styles.calibStep, { color: theme.textMuted }]}>
          {t('MEASURING ROOM LIGHT')}
        </Text>
        <Text style={[styles.calibTitle, { color: theme.text }]}>{t('Calibrating…')}</Text>
        <Text style={[styles.calibHint, { color: theme.textMuted }]}>
          {t('Hold the phone where you normally pray and keep the top uncovered.')}
        </Text>

        <ActivityIndicator size="large" color={theme.accent} style={{ marginVertical: 22 }} />

        <View style={styles.calibPillRow}>
          <View style={[styles.luxPill, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <MaterialCommunityIcons name="weather-sunny" size={15} color={theme.textMuted} />
            <Text style={[styles.luxPillText, { color: theme.accent }]}>{lightLevel} lux</Text>
          </View>
          <View style={[styles.luxPill, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <MaterialCommunityIcons name="timer-sand" size={15} color={theme.textMuted} />
            <Text style={[styles.luxPillText, { color: theme.gold }]}>
              {t('{n}s', { n: calibSeconds })}
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Calibration-only visit (started from Home): once the sensor has learned the
  // room light, show a short success screen and let the user go back — no prayer
  // counters are involved in this mode.
  if (calibrateOnly && appState === 'PRAYING') {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={[styles.calibScreen, { backgroundColor: theme.bg }]}>
        <View
          style={[
            styles.calibBadge,
            {
              backgroundColor: theme.accentSoft,
              borderColor: theme.border,
              shadowColor: theme.accent,
              shadowOpacity: theme.isDark ? 0.4 : 0.2,
            },
          ]}
        >
          <Ionicons name="checkmark" size={50} color={theme.accent} />
        </View>
        <Text style={[styles.calibTitle, { color: theme.text }]}>{t('Calibration complete')}</Text>
        <Text style={[styles.calibHint, { color: theme.textMuted }]}>
          {t('The sensor is ready for your next prayer.')}
        </Text>
        <View style={[styles.luxPill, { backgroundColor: theme.surface, borderColor: theme.border, marginTop: 18 }]}>
          <MaterialCommunityIcons name="weather-sunny" size={15} color={theme.textMuted} />
          <Text style={[styles.luxPillText, { color: theme.accent }]}>
            {t('Ambient {lux} lux', { lux: ambientLight })}
          </Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('Back to Home')}
          style={[
            styles.primaryButton,
            { backgroundColor: theme.accent, shadowColor: theme.accent, marginTop: 30 },
          ]}
        >
          <Ionicons name="home" size={19} color={theme.isDark ? '#04150E' : '#FFFFFF'} />
          <Text style={[styles.primaryButtonText, { color: theme.isDark ? '#04150E' : '#FFFFFF' }]}>
            {t('Back to Home')}
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const progress = part.rakaat > 0 ? Math.min(rakaat / part.rakaat, 1) : 0;

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: theme.bg }]}>
      <View style={styles.prayerBody}>
        {/* Which part of the prayer this is: "2 Rakaat Sunnah Fajr", then after
            the الحمدلله beat it becomes "2 Rakaat Fard Fajr" by itself. */}
        <View style={styles.prayerTopRow}>
          <Text style={[styles.prayerTitle, { color: theme.text }]} numberOfLines={2}>
            {partTitle(part, prayerName, t)}
          </Text>
          {partTotal > 1 && (
            <Text style={[styles.partStep, { color: theme.textMuted }]}>
              {t('PART {i} OF {n}', { i: partIndex + 1, n: partTotal })}
            </Text>
          )}
        </View>

        <View
          style={[
            styles.counterCard,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              shadowColor: theme.shadow,
              shadowOpacity: theme.shadowOpacity,
            },
          ]}
        >
          <Text style={[styles.bigCount, { color: theme.text }]}>{rakaat}</Text>
          <Text style={[styles.counterLabel, { color: theme.textMuted }]}>{t('RAKAAT')}</Text>
          <View style={[styles.progressTrack, { backgroundColor: theme.borderSoft }]}>
            <View
              style={[
                styles.progressFill,
                { backgroundColor: theme.accent, width: `${Math.round(progress * 100)}%` },
              ]}
            />
          </View>
        </View>

        <View style={styles.prayerRow}>
          <View
            style={[
              styles.smallCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.smallCount, { color: theme.text }]}>{totalSujud}</Text>
            <Text style={[styles.counterLabel, { color: theme.textMuted }]}>{t('SUJUD')}</Text>
          </View>
        </View>

        <QiblaCompass t={t} />

        {prayerComplete && (
          <View
            style={[
              styles.completeCard,
              { backgroundColor: theme.goldSoft, borderColor: theme.gold },
            ]}
          >
            <Text style={[styles.alhamdulillah, { color: theme.gold }]}>الحمدلله</Text>
            <Text style={[styles.completeHint, { color: theme.textMuted }]}>
              {partIndex + 1 < partTotal
                ? t('Next: {title}', { title: partTitle(plan[partIndex + 1], prayerName, t) })
                : t('Tap Stop Prayer when you are ready.')}
            </Text>
          </View>
        )}

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => { addLog('Prayer stopped.'); resetCounters(); navigation.goBack(); }}
          accessibilityRole="button"
          accessibilityLabel="Stop prayer"
          style={[
            styles.stopButton,
            { backgroundColor: theme.dangerSoft, borderColor: theme.danger },
          ]}
        >
          <Ionicons name="stop-circle" size={19} color={theme.danger} />
          <Text style={[styles.stopButtonText, { color: theme.danger }]}>{t('Stop Prayer')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// Initial great-circle bearing to the Kaaba, in degrees clockwise from true
// north (the standard "bearing between two coordinates" formula). For Iran this
// lands South-West — e.g. Tehran 218°, Mashhad 235°, Shiraz 238° — which is the
// only direction the arrow should ever show.
function qiblaBearing(lat: number, lon: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const phi1 = toRad(lat); // observer latitude
  const phi2 = toRad(KAABA.lat); // Kaaba latitude
  const deltaLon = toRad(KAABA.lon - lon); // longitude difference
  const y = Math.sin(deltaLon) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Compass heading of the phone's TOP edge, degrees clockwise from magnetic north.
// Magnetometer X/Y are chip axes (X = right edge, Y = top edge), so the raw
// atan2(y, x) angle sits 90° away from a real compass heading: holding the phone
// with its top toward north gives atan2 = 90°. Subtracting that 90° is what makes
// the arrow point South-West instead of North-West. Hold the phone flat — a
// tilted phone mixes the vertical field component into the reading.
function compassHeading(x: number, y: number): number {
  const raw = (Math.atan2(y, x) * 180) / Math.PI;
  return (raw - 90 + 360) % 360;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// --- Qibla Compass (shown on the Prayer screen, under the Sujud counter) ---
// Heading comes from the magnetometer; the bearing to the Kaaba is computed from
// the user's coordinates. The needle rotates by (bearing - heading), so it points
// at the Qibla regardless of which way the phone is turned.
// The compass is a switch, not a permanently running sensor: white and idle by
// default, bright green and live once tapped (that tap is what asks for location).
const QIBLA_GREEN = '#22C55E';

function QiblaCompass({ t }: any) {
  const { isDarkMode } = useContext(SettingsContext);
  const theme = getTheme(isDarkMode);
  const [active, setActive] = useState(false);
  const [heading, setHeading] = useState<number | null>(null);
  const [target, setTarget] = useState<{ bearing: number; distanceKm: number } | null>(null);
  // true / false once known, null while the sensor has not been probed yet.
  const [sensorOk, setSensorOk] = useState<boolean | null>(null);
  const [locState, setLocState] = useState<'idle' | 'loading' | 'ok' | 'denied'>('idle');

  // A position becomes the Qibla target. `persist` stores it, so every later
  // prayer can compute the bearing without touching the location API at all.
  const applyPosition = useCallback((latitude: number, longitude: number, persist: boolean) => {
    setTarget({
      bearing: qiblaBearing(latitude, longitude),
      distanceKm: haversineKm(latitude, longitude, KAABA.lat, KAABA.lon),
    });
    setLocState('ok');
    if (persist) {
      AsyncStorage.setItem(
        LOCATION_STORAGE_KEY,
        JSON.stringify({ latitude, longitude })
      ).catch(() => {});
    }
  }, []);

  // Tapping the compass IS the consent. Nothing is asked here: the cached fix
  // (from any earlier prayer) is used straight away, and the location API is only
  // touched once the OS has already granted it — so no repeated Google dialogs.
  const locate = useCallback(async (allowPrompt: boolean) => {
    // 1. instant — coordinates saved by a previous session, zero API call
    let hasCached = false;
    try {
      const raw = await AsyncStorage.getItem(LOCATION_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (typeof saved?.latitude === 'number' && typeof saved?.longitude === 'number') {
          applyPosition(saved.latitude, saved.longitude, false);
          hasCached = true;
        }
      }
    } catch {
      // unreadable cache is not an error — fall through to the API path
    }
    if (!hasCached) setLocState('loading');

    try {
      const perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted) {
        // Android itself must show the sheet once (a runtime permission cannot be
        // granted silently). It is allowed exactly ONCE, and only while the user
        // is looking at the compass — after that a refusal is answered with the
        // small Settings line, never with another popup.
        let alreadyAsked = false;
        try {
          alreadyAsked = (await AsyncStorage.getItem(LOCATION_ASKED_KEY)) === '1';
        } catch {
          // unreadable flag must not lock the feature — treat as not asked
        }
        if (allowPrompt && !alreadyAsked && perm.canAskAgain) {
          AsyncStorage.setItem(LOCATION_ASKED_KEY, '1').catch(() => {});
          const asked = await Location.requestForegroundPermissionsAsync();
          if (!asked.granted) {
            setLocState(hasCached ? 'ok' : 'denied');
            return;
          }
        } else {
          setLocState(hasCached ? 'ok' : 'denied');
          return;
        }
      }
      const last = await Location.getLastKnownPositionAsync();
      if (last?.coords) {
        applyPosition(last.coords.latitude, last.coords.longitude, true);
      }
      // mayShowUserSettingsDialog:false stops Android/Google Play services from
      // popping the "improve location accuracy" dialog — the compass works from
      // whatever fix the device already has instead of interrupting the prayer.
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        mayShowUserSettingsDialog: false,
      });
      applyPosition(pos.coords.latitude, pos.coords.longitude, true);
    } catch {
      setLocState(hasCached ? 'ok' : 'denied');
    }
  }, [applyPosition]);

  // The compass is ON for as long as the Prayer screen is in front of the user and
  // OFF the moment they leave it — the magnetometer is a real sensor and has no
  // business running on Home/Settings. Tapping the card still toggles it manually.
  useFocusEffect(
    useCallback(() => {
      setActive(true);
      return () => setActive(false);
    }, [])
  );

  // Nothing is subscribed while inactive; the sensor starts inside this effect.
  useEffect(() => {
    if (!active) {
      setHeading(null);
      return;
    }
    let sub: any;
    let cancelled = false;
    Magnetometer.isAvailableAsync()
      .then((available) => {
        if (cancelled) return;
        setSensorOk(available);
        if (!available) return;
        Magnetometer.setUpdateInterval(150);
        sub = Magnetometer.addListener(({ x, y }) => {
          setHeading(compassHeading(x, y));
        });
      })
      .catch(() => {
        if (!cancelled) setSensorOk(false);
      });
    locate(true);
    return () => {
      cancelled = true;
      if (sub) sub.remove();
    };
  }, [active, locate]);

  // Rotation for the arrow: bearing minus the phone's heading. 0° means the
  // phone's top edge is already facing the Qibla.
  const needle =
    target && heading !== null ? (((target.bearing - heading) % 360) + 360) % 360 : null;

  // "Pointing correctly" = within 10° of the Qibla (a human hand cannot hold
  // tighter than that, and a stricter gate would just never turn green).
  const aligned = needle !== null && (needle < 10 || needle > 350);

  // The card is gone — only the arrow and the word below it. A status line is
  // shown only when something actually needs the user's attention.
  let note: string | null = null;
  if (sensorOk === false) note = t('Compass is not available on this device.');
  else if (active && locState === 'denied') note = t('Location is off for this app.');
  else if (active && locState === 'loading') note = t('Finding your location…');

  // White on the dark theme (the owner's reference), inverted on the light one
  // where white would be invisible; green the moment it is on target.
  const arrowColor = aligned
    ? QIBLA_GREEN
    : theme.isDark
    ? '#FFFFFF'
    : theme.text;
  const labelColor = aligned ? QIBLA_GREEN : theme.isDark ? 'rgba(255,255,255,0.9)' : theme.textMuted;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => setActive((prev) => !prev)}
      accessibilityRole="button"
      accessibilityLabel={t('Qibla')}
      accessibilityState={{ selected: aligned }}
      style={styles.qiblaSimple}
    >
      <View style={[styles.qiblaArrowWrap, { transform: [{ rotate: `${needle ?? 0}deg` }] }]}>
        <MaterialCommunityIcons name="navigation" size={76} color={arrowColor} />
      </View>
      <Text style={[styles.qiblaLabel, { color: labelColor }]}>{t('Qibla')}</Text>
      {note && (
        <Text style={[styles.qiblaSmall, { color: theme.textMuted }]} numberOfLines={2}>
          {note}
        </Text>
      )}
      {active && locState === 'denied' && (
        // No popup, no second ask: a small line that opens the app's settings
        // where the OS-level permission actually lives.
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={(event: any) => {
            event?.stopPropagation?.();
            Linking.openSettings().catch(() => {});
          }}
          accessibilityRole="button"
          accessibilityLabel={t('Enable Location in Settings')}
        >
          <Text style={[styles.qiblaSmall, { color: theme.accent, textDecorationLine: 'underline' }]}>
            {t('Enable Location in Settings')}
          </Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

// --- 3. Settings Screen ---
function SettingsScreen() {
  const {
    isDarkMode,
    vibrationEnabled,
    toggleDarkMode,
    toggleVibration,
    lang,
    madhhab,
    setMadhhab,
    t,
    setLanguage,
  } = useContext(SettingsContext);
  const theme = getTheme(isDarkMode);

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={styles.pageScroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.pageTitle, { color: theme.text }]}>{t('Settings')}</Text>
        <Text style={[styles.pageSub, { color: theme.textMuted }]}>
          {t('Personalise how the app looks and feels.')}
        </Text>

        <View
          style={[
            styles.group,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              shadowColor: theme.shadow,
              shadowOpacity: theme.shadowOpacity,
            },
          ]}
        >
          <SettingRow
            icon={isDarkMode ? 'weather-night' : 'white-balance-sunny'}
            iconColor={isDarkMode ? theme.accent : theme.gold}
            iconBg={isDarkMode ? theme.accentSoft : theme.goldSoft}
            label={t('Night Mode')}
            hint={t('Dark theme across the app')}
            theme={theme}
            control={
              <Switch
                value={isDarkMode}
                onValueChange={toggleDarkMode}
                trackColor={{ false: theme.switchTrack, true: theme.accent }}
                thumbColor={theme.isDark ? '#E8F5EE' : '#FFFFFF'}
              />
            }
          />
          <View style={[styles.groupDivider, { backgroundColor: theme.borderSoft }]} />
          <SettingRow
            icon="vibrate"
            iconColor={theme.accent}
            iconBg={theme.accentSoft}
            label={t('Vibration')}
            hint={t('Buzz on every detected sujud')}
            theme={theme}
            control={
              <Switch
                value={vibrationEnabled}
                onValueChange={toggleVibration}
                trackColor={{ false: theme.switchTrack, true: theme.accent }}
                thumbColor={theme.isDark ? '#E8F5EE' : '#FFFFFF'}
              />
            }
          />
          <View style={[styles.groupDivider, { backgroundColor: theme.borderSoft }]} />
          <SettingRow
            icon="translate"
            iconColor={theme.gold}
            iconBg={theme.goldSoft}
            label={t('Language')}
            hint={t('Choose the app language')}
            theme={theme}
            control={
              <View
                style={[
                  styles.langToggle,
                  { borderColor: theme.border, backgroundColor: theme.surfaceAlt },
                ]}
              >
                {(['en', 'fa'] as Lang[]).map((code) => {
                  const active = lang === code;
                  return (
                    <TouchableOpacity
                      key={code}
                      activeOpacity={0.8}
                      onPress={() => setLanguage(code)}
                      accessibilityRole="button"
                      accessibilityLabel={code === 'en' ? 'English' : 'Persian'}
                      style={[styles.langOption, active && { backgroundColor: theme.accent }]}
                    >
                      <Text
                        style={[
                          styles.langOptionText,
                          {
                            color: active
                              ? theme.isDark
                                ? '#04150E'
                                : '#FFFFFF'
                              : theme.textMuted,
                          },
                        ]}
                      >
                        {code === 'en' ? 'EN' : 'FA'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            }
          />
        </View>

        {/* Madhhab — decides the Rakaat counts shown on Home */}
        <View
          style={[
            styles.group,
            styles.groupPad,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              shadowColor: theme.shadow,
              shadowOpacity: theme.shadowOpacity,
            },
          ]}
        >
          <View style={styles.settingRowInline}>
            <View style={[styles.settingIcon, { backgroundColor: theme.goldSoft, borderColor: theme.border }]}>
              <MaterialCommunityIcons name="book-open-variant" size={19} color={theme.gold} />
            </View>
            <View style={styles.settingTextWrap}>
              <Text style={[styles.settingLabel, { color: theme.text }]}>{t('Madhhab')}</Text>
              <Text style={[styles.settingHint, { color: theme.textMuted }]}>
                {t('Rakaat counts follow your school of jurisprudence')}
              </Text>
            </View>
          </View>

          <View style={styles.madhhabGrid}>
            {MADHHABS.map((option) => {
              const active = madhhab === option.id;
              return (
                <TouchableOpacity
                  key={option.id}
                  activeOpacity={0.85}
                  onPress={() => setMadhhab(option.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={option.label}
                  style={[
                    styles.madhhabChip,
                    {
                      backgroundColor: active ? theme.accent : theme.surfaceAlt,
                      borderColor: active ? theme.accent : theme.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.madhhabChipText,
                      {
                        color: active
                          ? theme.isDark
                            ? '#04150E'
                            : '#FFFFFF'
                          : theme.textMuted,
                      },
                    ]}
                  >
                    {t(option.label)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function SettingRow({ icon, iconColor, iconBg, label, hint, theme, control }: any) {
  return (
    <View style={styles.settingRow}>
      <View style={[styles.settingIcon, { backgroundColor: iconBg, borderColor: theme.border }]}>
        <MaterialCommunityIcons name={icon} size={19} color={iconColor} />
      </View>
      <View style={styles.settingTextWrap}>
        <Text style={[styles.settingLabel, { color: theme.text }]}>{label}</Text>
        <Text style={[styles.settingHint, { color: theme.textMuted }]}>{hint}</Text>
      </View>
      {control}
    </View>
  );
}

// --- 4. Debug Logs Screen ---
function LogsScreen() {
  const { isDarkMode, t } = useContext(SettingsContext);
  const { logs } = useContext(LogContext);
  const theme = getTheme(isDarkMode);
  const [copied, setCopied] = useState(false);

  // Copies every entry currently shown, newest first, one per line.
  const copyLogs = async () => {
    if (logs.length === 0) return;
    try {
      await Clipboard.setStringAsync(logs.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (error: any) {
      Alert.alert(t('Copy failed'), String(error?.message || error));
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <View style={styles.logsHeader}>
        <View style={styles.pageHeaderRow}>
          <Text style={[styles.pageTitle, { color: theme.text }]}>{t('Debug Logs')}</Text>
          <View style={[styles.countPill, { backgroundColor: theme.accentSoft, borderColor: theme.border }]}>
            <Text style={[styles.countPillText, { color: theme.accent }]}>{logs.length}</Text>
          </View>
          <View style={styles.headerSpacer} />
          <TouchableOpacity
            onPress={copyLogs}
            disabled={logs.length === 0}
            activeOpacity={0.7}
            style={[
              styles.copyButton,
              {
                backgroundColor: theme.accentSoft,
                borderColor: theme.border,
                opacity: logs.length === 0 ? 0.45 : 1,
              },
            ]}
          >
            <Ionicons
              name={copied ? 'checkmark-outline' : 'copy-outline'}
              size={15}
              color={theme.accent}
            />
            <Text style={[styles.copyButtonText, { color: theme.accent }]}>
              {copied ? t('Copied!') : t('Copy Logs')}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.pageSub, { color: theme.textMuted }]}>
          {t('Live sensor and state events, newest first.')}
        </Text>
      </View>

      <View
        style={[
          styles.logCard,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            shadowColor: theme.shadow,
            shadowOpacity: theme.shadowOpacity,
          },
        ]}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          {logs.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="terminal-outline" size={26} color={theme.textMuted} />
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>
                {t('No events yet. Start a prayer to see logs.')}
              </Text>
            </View>
          ) : (
            logs.map((log, index) => (
              <View key={index} style={styles.logRow}>
                <View style={[styles.logDot, { backgroundColor: theme.accent }]} />
                <Text style={[styles.logText, { color: theme.textMuted }]}>{log}</Text>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </View>
  );
}

// --- 5. Help Screen ---
function HelpScreen() {
  const { isDarkMode, t } = useContext(SettingsContext);
  const theme = getTheme(isDarkMode);

  const steps = [
    'Place your phone on the prayer mat with the top edge clear.',
    'Wait 10 seconds while the app measures the room light.',
    'Keep the phone in the same place for the whole prayer.',
    'Start praying. The app counts sajdahs and rakaats automatically.',
  ];

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={styles.pageScroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.pageTitle, { color: theme.text }]}>{t('How to use')}</Text>
        <Text style={[styles.pageSub, { color: theme.textMuted }]}>
          {t('Four quick steps to accurate counting.')}
        </Text>

        {steps.map((step, index) => (
          <View
            key={index}
            style={[
              styles.stepCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View style={[styles.stepNum, { backgroundColor: theme.accentSoft, borderColor: theme.border }]}>
              <Text style={[styles.stepNumText, { color: theme.accent }]}>{index + 1}</Text>
            </View>
            <Text style={[styles.stepText, { color: theme.text }]}>{t(step)}</Text>
          </View>
        ))}

        <View style={[styles.tipCard, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderSoft }]}>
          <MaterialCommunityIcons name="information-outline" size={18} color={theme.accent} />
          <Text style={[styles.tipText, { color: theme.textMuted }]}>
            {t('Two sajdahs complete one rakaat. The counter resets itself for each rakaat.')}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// --- 6. Support Screen (Rubika contact) + 6b. Donate Screen (crypto) ---
// The owner's own share copy — verbatim, emoji and line breaks included, in both
// languages. The Share screen picks the one matching the CURRENT app language.
const SHARE_URL = 'https://elyasyy23-lgtm.github.io/FocusBlocker/';
const SHARE_MESSAGE_FA =
  'تمرکز کامل در نماز، بدون نگرانی از فراموشی رکعت‌ها. 🌙\n' +
  'شمارنده هوشمند رکعت با قابلیت تشخیص خودکار سجده. همین حالا تجربه کنید:\n' +
  SHARE_URL;
const SHARE_MESSAGE_EN =
  'Complete focus in prayer, without worrying about forgetting your rakats. 🌙\n' +
  'A smart rakat counter that detects sujud automatically. Try it now:\n' +
  SHARE_URL;

const RUBIKA_URL = 'https://rubika.ir/yasmajyd';
const RUBIKA_ID = '@yasmajyd';
// USDT on the TRON network (TRC20). A wrong network loses the money, so the
// network is spelled out next to the address — never shown as a bare string.
const DONATION_USDT_TRC20 = 'TANP1ibS4DsF2C1p1rBGAZ5MrGZyS5sUmU';

function SupportScreen() {
  const { isDarkMode, t } = useContext(SettingsContext);
  const theme = getTheme(isDarkMode);

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={styles.supportScroll} showsVerticalScrollIndicator={false}>
        <View
          style={[
            styles.heroBadge,
            {
              backgroundColor: theme.accentSoft,
              borderColor: theme.border,
              shadowColor: theme.accent,
              shadowOpacity: theme.isDark ? 0.4 : 0.2,
            },
          ]}
        >
          <MaterialCommunityIcons name="hand-heart" size={50} color={theme.accent} />
        </View>

        <Text style={[styles.heroTitle, { color: theme.text }]}>{t('Support Us')}</Text>
        <Text style={[styles.supportSub, { color: theme.textMuted }]}>
          {t('Questions, ideas or a problem? Message me on Rubika.')}
        </Text>

        {/* Rubika — the direct line to the developer */}
        <View style={[styles.supportCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.supportCardHead}>
            <Ionicons name="chatbubbles-outline" size={18} color={theme.accent} />
            <Text style={[styles.supportCardTitle, { color: theme.text }]}>{t('Rubika')}</Text>
          </View>
          <Text style={[styles.supportCardText, { color: theme.textMuted }]}>
            {t('Message me on Rubika for questions, ideas or a problem.')}
          </Text>
          <Text style={[styles.supportId, { color: theme.text }]} selectable>
            {RUBIKA_ID}
          </Text>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => Linking.openURL(RUBIKA_URL).catch(() => {})}
            accessibilityRole="button"
            accessibilityLabel={t('Open Rubika')}
            style={[styles.supportButton, { backgroundColor: theme.accent }]}
          >
            <Ionicons name="open-outline" size={17} color={theme.isDark ? '#04150E' : '#FFFFFF'} />
            <Text style={[styles.supportButtonText, { color: theme.isDark ? '#04150E' : '#FFFFFF' }]}>
              {t('Open Rubika')}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.supportFootnote, { color: theme.textMuted }]}>
          {t('Want to support the app financially? Open “Donate” in the menu.')}
        </Text>
      </ScrollView>
    </View>
  );
}

// --- 6b. Donate Screen (USDT TRC20) ---
function DonateScreen() {
  const { isDarkMode, t } = useContext(SettingsContext);
  const theme = getTheme(isDarkMode);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<any>(null);

  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); }, []);

  const copyAddress = async () => {
    try {
      await Clipboard.setStringAsync(DONATION_USDT_TRC20);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      Alert.alert(t('Could not copy the address.'));
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={styles.supportScroll} showsVerticalScrollIndicator={false}>
        <View
          style={[
            styles.heroBadge,
            {
              backgroundColor: theme.goldSoft,
              borderColor: theme.border,
              shadowColor: theme.gold,
              shadowOpacity: theme.isDark ? 0.35 : 0.2,
            },
          ]}
        >
          <MaterialCommunityIcons name="currency-usd" size={50} color={theme.gold} />
        </View>

        <Text style={[styles.heroTitle, { color: theme.text }]}>{t('Donate')}</Text>
        <Text style={[styles.supportSub, { color: theme.textMuted }]}>
          {t('Your support keeps this app free and ad-free — every contribution is a step in serving those who pray. 🌙')}
        </Text>

        <View style={[styles.supportCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.supportCardHead}>
            <MaterialCommunityIcons name="currency-usd" size={18} color={theme.gold} />
            <Text style={[styles.supportCardTitle, { color: theme.text }]}>{t('Crypto Donation')}</Text>
          </View>
          <Text style={[styles.supportCardText, { color: theme.textMuted }]}>
            {t('Send only USDT on the TRC20 (Tron) network.')}
          </Text>

          <View style={[styles.addressBox, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderSoft }]}>
            <Text style={[styles.addressNet, { color: theme.gold }]}>{t('USDT · TRC20')}</Text>
            <Text
              style={[styles.addressText, { color: theme.text }]}
              selectable
              numberOfLines={2}
            >
              {DONATION_USDT_TRC20}
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={copyAddress}
            accessibilityRole="button"
            accessibilityLabel={t('Copy Address')}
            style={[
              styles.supportButton,
              {
                backgroundColor: copied ? theme.accentSoft : 'transparent',
                borderWidth: 1,
                borderColor: copied ? theme.accent : theme.border,
              },
            ]}
          >
            <Ionicons
              name={copied ? 'checkmark-circle' : 'copy-outline'}
              size={17}
              color={copied ? theme.accent : theme.text}
            />
            <Text style={[styles.supportButtonText, { color: copied ? theme.accent : theme.text }]}>
              {copied ? t('Copied!') : t('Copy Address')}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

// --- 7. Share Screen ---
function ShareScreen() {
  const { isDarkMode, lang, t } = useContext(SettingsContext);
  const theme = getTheme(isDarkMode);

  const onShare = async () => {
    try {
      await Share.share({
        message: lang === 'en' ? SHARE_MESSAGE_EN : SHARE_MESSAGE_FA,
      });
    } catch (error: any) {
      Alert.alert(error.message);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={styles.shareScroll} showsVerticalScrollIndicator={false}>
        <View
          style={[
            styles.heroBadge,
            {
              backgroundColor: theme.accentSoft,
              borderColor: theme.border,
              shadowColor: theme.accent,
              shadowOpacity: theme.isDark ? 0.4 : 0.2,
            },
          ]}
        >
          <MaterialCommunityIcons name="hand-heart" size={54} color={theme.accent} />
        </View>

        <Text style={[styles.heroTitle, { color: theme.text }]}>{t('Share & Support')}</Text>
        <Text style={[styles.shareSub, { color: theme.textMuted }]}>
          {t('Help a friend track their salah — every share keeps this app free.')}
        </Text>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onShare}
          accessibilityRole="button"
          accessibilityLabel="Share the app"
          style={[styles.primaryButton, { backgroundColor: theme.accent, shadowColor: theme.accent }]}
        >
          <Ionicons name="share-social" size={19} color={theme.isDark ? '#04150E' : '#FFFFFF'} />
          <Text style={[styles.primaryButtonText, { color: theme.isDark ? '#04150E' : '#FFFFFF' }]}>
            {t('Share App')}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// --- Theme ---
function getTheme(isDark: boolean) {
  const p = isDark
    ? {
        bg: '#07130F',
        surface: '#0F261D',
        surfaceAlt: '#123024',
        border: '#1D4534',
        borderSoft: '#163527',
        text: '#F2F8F4',
        textMuted: '#8AA69A',
        accent: '#4ADE80',
        accentSoft: 'rgba(74,222,128,0.13)',
        gold: '#FBBF24',
        goldSoft: 'rgba(251,191,36,0.13)',
        danger: '#F87171',
        dangerSoft: 'rgba(248,113,113,0.12)',
        shadow: '#000000',
        shadowOpacity: 0.45,
        switchTrack: '#1D4534',
        drawerBg: '#0A1D16',
      }
    : {
        bg: '#F1F6F3',
        surface: '#FFFFFF',
        surfaceAlt: '#F7FAF8',
        border: '#DCE8E1',
        borderSoft: '#EAF2ED',
        text: '#08170F',
        textMuted: '#5C7268',
        accent: '#0E9F6E',
        accentSoft: 'rgba(14,159,110,0.10)',
        gold: '#B45309',
        goldSoft: 'rgba(180,83,9,0.10)',
        danger: '#DC2626',
        dangerSoft: 'rgba(220,38,38,0.08)',
        shadow: '#0B1F17',
        shadowOpacity: 0.08,
        switchTrack: '#CFE0D8',
        drawerBg: '#FFFFFF',
      };

  return { ...p, isDark };
}

// --- Styles ---
const CARD_SHADOW = {
  shadowOffset: { width: 0, height: 6 },
  shadowRadius: 14,
  elevation: 5,
} as const;

const styles = StyleSheet.create({
  bootScreen: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bootText: { marginTop: 18, fontSize: 15, fontFamily: F.medium, letterSpacing: 1.2 },

  screen: { flex: 1 },

  // Drawer
  drawerRoot: { flex: 1 },
  drawerHeader: { paddingHorizontal: 22, paddingBottom: 20 },
  drawerBadge: {
    width: 52,
    height: 52,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  drawerTitle: { fontSize: 19, fontFamily: F.bold, letterSpacing: -0.3 },
  drawerSub: { fontSize: 12.5, fontFamily: F.medium, marginTop: 3, letterSpacing: 0.3 },
  drawerDivider: { height: 1, marginHorizontal: 22, marginBottom: 6 },
  drawerScroll: { paddingTop: 4, paddingBottom: 12 },
  drawerFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
  },
  drawerFooterText: { fontSize: 12, fontFamily: F.medium, letterSpacing: 0.4 },

  // Home
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 4,
  },
  brandTitle: { fontSize: 19, fontFamily: F.extra, letterSpacing: -0.4 },
  topBarSpacer: { flex: 1 },
  menuButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeScroll: { paddingHorizontal: 18, paddingBottom: 32 },
  hero: { alignItems: 'center', marginTop: 8, marginBottom: 26 },
  heroBadge: {
    width: 128,
    height: 128,
    borderRadius: 64,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 22,
    elevation: 10,
  },
  heroTitle: {
    fontSize: 31,
    fontFamily: F.extra,
    letterSpacing: -0.8,
    marginTop: 22,
    marginBottom: 7,
  },
  heroSub: {
    fontSize: 13.5,
    fontFamily: F.medium,
    letterSpacing: 0.5,
    textAlign: 'center',
    marginTop: 16,
  },

  sectionHeadRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  sectionLabel: {
    fontSize: 11,
    fontFamily: F.bold,
    letterSpacing: 1.6,
    marginLeft: 2,
  },
  madhhabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  madhhabPillText: { fontSize: 11, fontFamily: F.bold, letterSpacing: 0.4 },

  // Home — the five daily prayers
  prayerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 13,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 9,
    ...CARD_SHADOW,
  },
  prayerIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prayerTextWrap: { flex: 1, marginLeft: 13, marginRight: 8 },
  prayerName: { fontSize: 16, fontFamily: F.bold, letterSpacing: -0.2 },
  prayerDetail: { fontSize: 12, fontFamily: F.regular, marginTop: 3, lineHeight: 16 },
  prayerCountWrap: { alignItems: 'center', minWidth: 46 },
  prayerCount: { fontSize: 26, fontFamily: F.extra, letterSpacing: -0.8, lineHeight: 30 },
  prayerCountLabel: { fontSize: 9, fontFamily: F.bold, letterSpacing: 1.2, marginTop: 1 },

  totalsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    padding: 13,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 6,
  },
  totalsText: { flex: 1, fontSize: 12, fontFamily: F.regular, lineHeight: 17 },

  taraweehCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 14,
    ...CARD_SHADOW,
  },
  taraweehBadge: {
    width: 46,
    height: 46,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taraweehText: { flex: 1, marginLeft: 14 },
  taraweehTitle: { fontSize: 16.5, fontFamily: F.bold, letterSpacing: -0.2 },
  taraweehSub: { fontSize: 12.5, fontFamily: F.medium, marginTop: 2 },

  recalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 12,
    ...CARD_SHADOW,
  },
  recalCardBadge: {
    width: 46,
    height: 46,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  tipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 20,
  },
  tipText: { flex: 1, fontSize: 12.5, fontFamily: F.regular, lineHeight: 18 },

  // Prayer — calibration
  calibScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  calibBadge: {
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 20,
    elevation: 8,
    marginBottom: 26,
  },
  calibStep: { fontSize: 10.5, fontFamily: F.bold, letterSpacing: 1.8, marginBottom: 8 },
  calibPillRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  calibTitle: { fontSize: 25, fontFamily: F.extra, letterSpacing: -0.6, textAlign: 'center' },
  calibHint: {
    fontSize: 14,
    fontFamily: F.regular,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 21,
    paddingHorizontal: 10,
  },
  luxPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 22,
    borderWidth: 1,
  },
  luxPillText: { fontSize: 17, fontFamily: F.bold, letterSpacing: 0.3 },

  // Prayer — live
  prayerBody: { flex: 1, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 26 },
  prayerTopRow: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    paddingHorizontal: 6,
  },
  prayerTitle: {
    fontSize: 20,
    fontFamily: F.bold,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  partStep: { fontSize: 10.5, fontFamily: F.bold, letterSpacing: 1.6, marginTop: 6 },

  counterCard: {
    alignItems: 'center',
    paddingVertical: 26,
    paddingHorizontal: 22,
    borderRadius: 24,
    borderWidth: 1,
    ...CARD_SHADOW,
  },
  bigCount: { fontSize: 84, fontFamily: F.extra, lineHeight: 94, letterSpacing: -3 },
  counterLabel: { fontSize: 10.5, fontFamily: F.bold, letterSpacing: 2, marginTop: 2 },
  progressTrack: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    marginTop: 18,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 3 },

  prayerRow: { flexDirection: 'row', gap: 12, marginTop: 14 },
  smallCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  smallCount: { fontSize: 44, fontFamily: F.extra, lineHeight: 50, letterSpacing: -1.5 },

  // Shown in place of the old completion alert. The Arabic line carries NO custom
  // fontFamily on purpose: the app's Inter font has no Arabic glyphs, so we let
  // Android fall back to its own Arabic typeface instead of risking tofu boxes.
  completeCard: {
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: 20,
    borderWidth: 1,
  },
  alhamdulillah: { fontSize: 34, lineHeight: 46, letterSpacing: 0.5 },
  completeHint: { fontSize: 12.5, fontFamily: F.medium, textAlign: 'center' },

  // Qibla compass — just an arrow and the word below it: no card, no dial, no
  // numbers. Colours are applied inline (they flip when the arrow lines up with
  // the Qibla), so this block only carries geometry.
  qiblaSimple: { alignItems: 'center', paddingVertical: 10 },
  qiblaArrowWrap: { alignItems: 'center', justifyContent: 'center' },
  qiblaLabel: { fontSize: 13.5, fontFamily: F.semi, letterSpacing: 0.6, marginTop: 2 },
  qiblaSmall: { fontSize: 11.5, fontFamily: F.medium, textAlign: 'center', marginTop: 4 },

  stopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingVertical: 16,
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 22,
  },
  stopButtonText: { fontSize: 15.5, fontFamily: F.bold, letterSpacing: 0.2 },

  // Pages
  pageScroll: { padding: 20, paddingBottom: 36 },
  logsHeader: { paddingHorizontal: 20, paddingTop: 8 },
  pageHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pageTitle: { fontSize: 26, fontFamily: F.extra, letterSpacing: -0.6 },
  pageSub: {
    fontSize: 13,
    fontFamily: F.regular,
    lineHeight: 19,
    marginTop: 6,
    marginBottom: 18,
  },
  countPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  countPillText: { fontSize: 12, fontFamily: F.bold },
  headerSpacer: { flex: 1 },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
  },
  copyButtonText: { fontSize: 12.5, fontFamily: F.semi },

  // Settings
  group: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 4, ...CARD_SHADOW },
  groupPad: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 14, marginTop: 14 },
  groupDivider: { height: 1, marginHorizontal: 16 },
  settingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 12 },
  settingRowInline: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  madhhabGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  madhhabChip: {
    flexGrow: 1,
    flexBasis: '44%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
  },
  madhhabChipText: { fontSize: 13.5, fontFamily: F.semi, letterSpacing: 0.2 },
  settingIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingTextWrap: { flex: 1, marginLeft: 13, marginRight: 10 },
  settingLabel: { fontSize: 15.5, fontFamily: F.semi, letterSpacing: -0.1 },
  settingHint: { fontSize: 12, fontFamily: F.regular, marginTop: 3, lineHeight: 16 },
  langToggle: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 3,
    gap: 3,
  },
  langOption: {
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langOptionText: { fontSize: 12.5, fontFamily: F.bold, letterSpacing: 0.5 },

  // Logs
  logCard: {
    flex: 1,
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    ...CARD_SHADOW,
  },
  logRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginBottom: 10 },
  logDot: { width: 5, height: 5, borderRadius: 3, marginTop: 6 },
  logText: { flex: 1, fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', lineHeight: 17 },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 50, gap: 12 },
  emptyText: { fontSize: 13, fontFamily: F.regular, textAlign: 'center', paddingHorizontal: 24 },

  // Help
  stepCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 15,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 11,
  },
  stepNum: {
    width: 34,
    height: 34,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: { fontSize: 15, fontFamily: F.bold },
  stepText: { flex: 1, fontSize: 14, fontFamily: F.regular, lineHeight: 20 },

  // Support
  supportScroll: { padding: 22, paddingBottom: 40, alignItems: 'stretch', flexGrow: 1 },
  supportSub: {
    fontSize: 13.5,
    fontFamily: F.regular,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 22,
    paddingHorizontal: 10,
  },
  supportCard: { borderRadius: 20, borderWidth: 1, padding: 18, marginBottom: 14 },
  supportCardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  supportCardTitle: { fontSize: 16, fontFamily: F.bold, letterSpacing: 0.2 },
  supportCardText: { fontSize: 13, fontFamily: F.regular, lineHeight: 19, marginBottom: 14 },
  supportId: { fontSize: 16, fontFamily: F.semi, letterSpacing: 0.4, marginBottom: 14 },
  addressBox: { borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 12 },
  addressNet: { fontSize: 11, fontFamily: F.bold, letterSpacing: 1, marginBottom: 6 },
  addressText: { fontSize: 13, fontFamily: F.regular, lineHeight: 19, letterSpacing: 0.6 },
  supportFootnote: {
    fontSize: 12.5,
    fontFamily: F.regular,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 8,
  },
  supportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
  },
  supportButtonText: { fontSize: 14.5, fontFamily: F.semi, letterSpacing: 0.2 },

  // Share
  shareScroll: { padding: 24, paddingBottom: 40, alignItems: 'center', justifyContent: 'center', flexGrow: 1 },
  shareSub: {
    fontSize: 13.5,
    fontFamily: F.regular,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 28,
    paddingHorizontal: 12,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 34,
    paddingVertical: 16,
    borderRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
  },
  primaryButtonText: { fontSize: 16, fontFamily: F.bold, letterSpacing: 0.2 },
});
