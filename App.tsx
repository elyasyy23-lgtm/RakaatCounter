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
} from 'react-native';
import { LightSensor } from 'expo-sensors';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Clipboard from 'expo-clipboard';
import { useFonts } from 'expo-font';
import {
  SafeAreaProvider,
  SafeAreaView,
  initialWindowMetrics,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
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

const APP_VERSION = '1.2.0';

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
const SettingsContext = createContext({
  isDarkMode: true,
  vibrationEnabled: true,
  toggleDarkMode: () => {},
  toggleVibration: () => {},
});

// --- Main App Component ---
export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [logs, setLogs] = useState<string[]>([]);

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
        <Text style={[styles.bootText, { color: theme.textMuted }]}>Rakaat Tracker</Text>
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
        toggleDarkMode: () => setIsDarkMode(!isDarkMode),
        toggleVibration: () => setVibrationEnabled(!vibrationEnabled),
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
              headerTitleStyle: {
                fontFamily: F.bold,
                fontSize: 18,
                letterSpacing: -0.2,
              },
              headerTitleAlign: 'left',
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
  const { isDarkMode } = useContext(SettingsContext);
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
        <Text style={[styles.drawerTitle, { color: theme.text }]}>Rakaat Tracker</Text>
        <Text style={[styles.drawerSub, { color: theme.textMuted }]}>
          Enhancing Your Salah
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
  const { isDarkMode } = useContext(SettingsContext);
  const theme = getTheme(isDarkMode);

  const startPrayer = (rakaatCount: number) => {
    // A fresh id per tap: the Prayer screen resets its counters whenever this
    // changes, so a new prayer always starts from absolute zero — the drawer
    // navigator keeps that screen mounted between visits, so relying on a
    // remount would leak the previous prayer's numbers.
    navigation.navigate('Prayer', { targetRakaat: rakaatCount, sessionId: Date.now() });
  };

  const cards = [
    { value: 2, label: 'Two' },
    { value: 3, label: 'Three' },
    { value: 4, label: 'Four' },
  ];

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: theme.bg }]}>
      <View style={styles.topBar}>
        <TouchableOpacity
          style={[styles.menuButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={() => navigation.openDrawer()}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Open menu"
        >
          <Ionicons name="menu" size={22} color={theme.text} />
        </TouchableOpacity>
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
          <Text style={[styles.heroTitle, { color: theme.text }]}>Rakaat Tracker</Text>
          <Text style={[styles.heroSub, { color: theme.textMuted }]}>
            Enhancing Your Salah Experience
          </Text>
        </View>

        <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>CHOOSE RAKAAT</Text>

        <View style={styles.cardRow}>
          {cards.map((c) => (
            <TouchableOpacity
              key={c.value}
              activeOpacity={0.85}
              onPress={() => startPrayer(c.value)}
              accessibilityRole="button"
              accessibilityLabel={`Start ${c.value} rakaat prayer`}
              style={[
                styles.rakaatCard,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  shadowColor: theme.shadow,
                  shadowOpacity: theme.shadowOpacity,
                },
              ]}
            >
              <Text style={[styles.rakaatNum, { color: theme.accent }]}>{c.value}</Text>
              <Text style={[styles.rakaatCardLabel, { color: theme.textMuted }]}>
                {c.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => startPrayer(20)}
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
            <Text style={[styles.taraweehTitle, { color: theme.text }]}>Taraweeh</Text>
            <Text style={[styles.taraweehSub, { color: theme.textMuted }]}>20 Rakaat</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
        </TouchableOpacity>

        <View style={[styles.tipCard, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderSoft }]}>
          <MaterialCommunityIcons name="lightbulb-on-outline" size={18} color={theme.accent} />
          <Text style={[styles.tipText, { color: theme.textMuted }]}>
            Keep the phone on your prayer mat with the top edge clear.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// --- 2. Prayer Screen ---
function PrayerScreen({ route, navigation }: any) {
  const { isDarkMode, vibrationEnabled } = useContext(SettingsContext);
  const { addLog } = useContext(LogContext);
  const theme = getTheme(isDarkMode);
  const { targetRakaat, sessionId } = route.params;

  const [appState, setAppState] = useState('CALIBRATING_AMBIENT');
  const [lightLevel, setLightLevel] = useState(0);
  const [rakaat, setRakaat] = useState(0);
  const [sajdahCount, setSajdahCount] = useState(0);
  // Cumulative for the whole prayer — deliberately NOT reset per rakaat.
  const [totalSujud, setTotalSujud] = useState(0);
  const [isSujud, setIsSujud] = useState(false);

  const [ambientLight, setAmbientLight] = useState(0);
  const [sujudLight, setSujudLight] = useState(0);
  const [darkThreshold, setDarkThreshold] = useState(50);
  const [lightThreshold, setLightThreshold] = useState(100);

  // Latest lux, read by the calibration timer. Kept in a ref so live light
  // changes do not restart the 3s countdown (which would stall calibration).
  const lightRef = useRef(0);

  // Fires the completion alert exactly once, even if the effect re-runs.
  const completedRef = useRef(false);

  // The single place that puts every counter back to absolute zero:
  // rakaat, the displayed Sujud total, and the internal 0-1 sajdah counter.
  const resetCounters = useCallback(() => {
    setRakaat(0);
    setSajdahCount(0);
    setTotalSujud(0);
    setIsSujud(false);
    completedRef.current = false;
  }, []);

  // Re-runs the 3s ambient + 3s sujud calibration without touching the prayer
  // counters — used when the room light changes and the stored thresholds stop
  // matching (symptom: "Sujud START" logs forever, never "Sujud END").
  const recalibrate = useCallback(() => {
    // Drop any in-progress sujud so the first dark reading after calibration
    // starts a fresh sujud instead of being compared against a stale one.
    setIsSujud(false);
    setAppState('CALIBRATING_AMBIENT');
    addLog('Recalibration started.');
  }, [addLog]);

  // A new prayer session (fresh id handed over by Home) starts from absolute
  // zero. This screen stays mounted between visits, so a remount cannot be
  // relied on to clear the previous prayer's numbers.
  useEffect(() => {
    resetCounters();
  }, [sessionId, resetCounters]);

  useEffect(() => {
    let subscription: any;
    LightSensor.isAvailableAsync().then((available) => {
      if (available) {
        subscription = LightSensor.addListener(({ illuminance }) => {
          const currentLight = Math.round(illuminance);
          lightRef.current = currentLight;
          setLightLevel(currentLight);

          if (appState === 'PRAYING') {
            if (currentLight < darkThreshold && !isSujud) {
              setIsSujud(true);
              addLog(`Sujud START (Lux: ${currentLight})`);
              if (vibrationEnabled) Vibration.vibrate(50);
            } else if (currentLight > lightThreshold && isSujud) {
              setIsSujud(false);
              addLog(`Sujud END (Lux: ${currentLight})`);
              setTotalSujud((prev) => prev + 1);
              if (vibrationEnabled) Vibration.vibrate(50);
              // PURE updater only. Side effects (logging, Alert, navigation) must
              // never run inside it: React can execute an updater during the render
              // phase, and addLog() updates App (a different component) → the crash
              // "Cannot update a component (App) while rendering PrayerScreen".
              // The 2-sajdah → 1-rakaat transition is handled in the effect below.
              setSajdahCount((prev) => prev + 1);
            }
          }
        });
      }
    });
    return () => { if (subscription) subscription.remove(); };
  }, [appState, isSujud, darkThreshold, lightThreshold]);

  // 2 sajdahs = 1 rakaat. Deliberately an effect and NOT inside the updater above:
  // state updaters must stay pure, and addLog() writes to a different component.
  useEffect(() => {
    if (sajdahCount >= 2) {
      setSajdahCount(0);
      setRakaat((r) => r + 1);
    }
  }, [sajdahCount]);

  // Log each completed rakaat, and finish the prayer on the last one.
  useEffect(() => {
    if (rakaat === 0) return;
    addLog(`Rakaat ${rakaat} completed!`);
    if (rakaat >= targetRakaat && !completedRef.current) {
      completedRef.current = true;
      Alert.alert('Prayer Complete', 'You have finished your prayer.');
      // Prayer is over: zero every counter before leaving the screen.
      resetCounters();
      navigation.goBack();
    }
    // addLog is memoised in App (useCallback), so its identity is stable — but we
    // leave it out of the deps so this effect keys strictly off rakaat/target.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rakaat, targetRakaat]);

  useEffect(() => {
    let timer: any;
    if (appState === 'CALIBRATING_AMBIENT') {
      timer = setTimeout(() => { setAmbientLight(lightRef.current); setAppState('CALIBRATING_SUJUD'); }, 3000);
    } else if (appState === 'CALIBRATING_SUJUD') {
      timer = setTimeout(() => {
        const lv = lightRef.current;
        setSujudLight(lv);
        const midPoint = (lv + ambientLight) / 2;
        setDarkThreshold(midPoint - 10); setLightThreshold(midPoint + 10); setAppState('PRAYING');
      }, 3000);
    }
    return () => clearTimeout(timer);
  }, [appState, ambientLight]);

  useEffect(() => { activateKeepAwakeAsync(); return () => { deactivateKeepAwake(); }; }, []);

  const calibrating = appState === 'CALIBRATING_AMBIENT' || appState === 'CALIBRATING_SUJUD';

  if (calibrating) {
    const firstStep = appState === 'CALIBRATING_AMBIENT';
    return (
      <SafeAreaView edges={['top', 'bottom']} style={[styles.calibScreen, { backgroundColor: theme.bg }]}>
        <View
          style={[
            styles.calibBadge,
            {
              backgroundColor: firstStep ? theme.accentSoft : theme.goldSoft,
              borderColor: theme.border,
              shadowColor: firstStep ? theme.accent : theme.gold,
              shadowOpacity: theme.isDark ? 0.4 : 0.2,
            },
          ]}
        >
          <MaterialCommunityIcons
            name={firstStep ? 'white-balance-sunny' : 'weather-night'}
            size={44}
            color={firstStep ? theme.accent : theme.gold}
          />
        </View>

        <Text style={[styles.calibStep, { color: theme.textMuted }]}>
          {firstStep ? 'STEP 1 OF 2' : 'STEP 2 OF 2'}
        </Text>
        <Text style={[styles.calibTitle, { color: theme.text }]}>
          {firstStep ? 'Calibrating…' : 'Simulating Sujud…'}
        </Text>
        <Text style={[styles.calibHint, { color: theme.textMuted }]}>
          {firstStep
            ? 'Do not cover the top of the phone.'
            : 'Cover the top of the phone with your hand.'}
        </Text>

        <ActivityIndicator size="large" color={theme.accent} style={{ marginVertical: 26 }} />

        <View style={[styles.luxPill, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <MaterialCommunityIcons name="timer-sand" size={15} color={theme.textMuted} />
          <Text style={[styles.luxPillText, { color: theme.accent }]}>{lightLevel} lux</Text>
        </View>
      </SafeAreaView>
    );
  }

  const progress = targetRakaat > 0 ? Math.min(rakaat / targetRakaat, 1) : 0;

  return (
    <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: theme.bg }]}>
      <View style={styles.prayerBody}>
        <View style={styles.prayerTopRow}>
          <View style={styles.prayerTopSpacer} />
          <View style={[styles.targetPill, { backgroundColor: theme.accentSoft, borderColor: theme.border }]}>
            <MaterialCommunityIcons name="target" size={15} color={theme.accent} />
            <Text style={[styles.targetPillText, { color: theme.accent }]}>
              TARGET {targetRakaat} RAKAAT
            </Text>
          </View>
          <View style={[styles.prayerTopSpacer, styles.prayerTopSpacerEnd]}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={recalibrate}
              accessibilityRole="button"
              accessibilityLabel="Recalibrate light sensor"
              style={[styles.recalButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
            >
              <Ionicons name="refresh" size={17} color={theme.accent} />
            </TouchableOpacity>
          </View>
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
          <Text style={[styles.counterLabel, { color: theme.textMuted }]}>RAKAAT</Text>
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
            <Text style={[styles.counterLabel, { color: theme.textMuted }]}>SUJUD</Text>
          </View>
        </View>

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
          <Text style={[styles.stopButtonText, { color: theme.danger }]}>Stop Prayer</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// --- 3. Settings Screen ---
function SettingsScreen() {
  const { isDarkMode, vibrationEnabled, toggleDarkMode, toggleVibration } = useContext(SettingsContext);
  const theme = getTheme(isDarkMode);

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={styles.pageScroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.pageTitle, { color: theme.text }]}>Settings</Text>
        <Text style={[styles.pageSub, { color: theme.textMuted }]}>
          Personalise how the app looks and feels.
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
            label="Night Mode"
            hint="Dark theme across the app"
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
            label="Vibration"
            hint="Buzz on every detected sujud"
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
  const { isDarkMode } = useContext(SettingsContext);
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
      Alert.alert('Copy failed', String(error?.message || error));
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <View style={styles.logsHeader}>
        <View style={styles.pageHeaderRow}>
          <Text style={[styles.pageTitle, { color: theme.text }]}>Debug Logs</Text>
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
              {copied ? 'Copied!' : 'Copy Logs'}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.pageSub, { color: theme.textMuted }]}>
          Live sensor and state events, newest first.
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
                No events yet. Start a prayer to see logs.
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
  const { isDarkMode } = useContext(SettingsContext);
  const theme = getTheme(isDarkMode);

  const steps = [
    'Place your phone on the prayer mat.',
    'Do not cover the top of the phone during calibration.',
    'When it says "Simulating Sujud", cover the top with your hand for 3 seconds.',
    'Start praying. The app counts sajdahs and rakaats automatically.',
  ];

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={styles.pageScroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.pageTitle, { color: theme.text }]}>How to use</Text>
        <Text style={[styles.pageSub, { color: theme.textMuted }]}>
          Four quick steps to accurate counting.
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
            <Text style={[styles.stepText, { color: theme.text }]}>{step}</Text>
          </View>
        ))}

        <View style={[styles.tipCard, { backgroundColor: theme.surfaceAlt, borderColor: theme.borderSoft }]}>
          <MaterialCommunityIcons name="information-outline" size={18} color={theme.accent} />
          <Text style={[styles.tipText, { color: theme.textMuted }]}>
            Two sajdahs complete one rakaat. The counter resets itself for each rakaat.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// --- 6. Share Screen ---
function ShareScreen() {
  const { isDarkMode } = useContext(SettingsContext);
  const theme = getTheme(isDarkMode);

  const onShare = async () => {
    try {
      await Share.share({
        message: 'Check out Rakaat Tracker! https://github.com/elyasyy23-lgtm/RakaatCounter',
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

        <Text style={[styles.heroTitle, { color: theme.text }]}>Share & Support</Text>
        <Text style={[styles.shareSub, { color: theme.textMuted }]}>
          Help a friend track their salah — every share keeps this app free.
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
            Share App
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
  topBar: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 4 },
  menuButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeScroll: { paddingHorizontal: 18, paddingBottom: 32 },
  hero: { alignItems: 'center', marginTop: 8, marginBottom: 30 },
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
  heroSub: { fontSize: 13.5, fontFamily: F.medium, letterSpacing: 0.5, textAlign: 'center' },

  sectionLabel: {
    fontSize: 11,
    fontFamily: F.bold,
    letterSpacing: 1.6,
    marginBottom: 12,
    marginLeft: 2,
  },

  cardRow: { flexDirection: 'row', marginHorizontal: -5, marginBottom: 12 },
  rakaatCard: {
    flex: 1,
    marginHorizontal: 5,
    paddingVertical: 22,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    ...CARD_SHADOW,
  },
  rakaatNum: { fontSize: 30, fontFamily: F.extra, letterSpacing: -1, lineHeight: 36 },
  rakaatCardLabel: {
    fontSize: 10.5,
    fontFamily: F.bold,
    letterSpacing: 1.4,
    marginTop: 4,
    textTransform: 'uppercase',
  },

  taraweehCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 22,
  },
  prayerTopSpacer: { width: 40 },
  prayerTopSpacerEnd: { alignItems: 'flex-end' },
  recalButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 7,
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  targetPillText: { fontSize: 11, fontFamily: F.bold, letterSpacing: 1.3 },

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
  groupDivider: { height: 1, marginHorizontal: 16 },
  settingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 12 },
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
