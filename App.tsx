import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView, ActivityIndicator, StatusBar, Switch, Share, Alert, ScrollView, FlatList, Vibration } from 'react-native';
import { LightSensor } from 'expo-sensors';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { NavigationContainer } from '@react-navigation/native';
import { createDrawerNavigator, DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';

// --- Context for Settings (Theme, Vibration) ---
const SettingsContext = createContext({
  isDarkMode: true,
  vibrationEnabled: true,
  toggleDarkMode: () => {},
  toggleVibration: () => {},
});

// --- Debug log store (module-level, survives screen navigation) ---
type LogEntry = { id: number; t: number; tag: string; msg: string };
const LOG_CAP = 400;
const logStore = {
  entries: [] as LogEntry[],
  listeners: new Set<() => void>(),
  nextId: 1,
  add(tag: string, msg: string) {
    logStore.entries = [...logStore.entries, { id: logStore.nextId++, t: Date.now(), tag, msg }];
    if (logStore.entries.length > LOG_CAP) logStore.entries = logStore.entries.slice(-LOG_CAP);
    logStore.listeners.forEach((l) => l());
  },
  clear() {
    logStore.entries = [];
    logStore.listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    logStore.listeners.add(l);
    return () => { logStore.listeners.delete(l); };
  },
};

function logEvent(tag: string, msg: string) { logStore.add(tag, msg); }

function useDebugLogs() {
  const [, force] = useState(0);
  useEffect(() => logStore.subscribe(() => force((n) => n + 1)), []);
  return logStore.entries;
}

function formatTime(t: number) {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// --- Main App Component ---
export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);

  return (
    <SettingsContext.Provider value={{
      isDarkMode, vibrationEnabled,
      toggleDarkMode: () => setIsDarkMode(!isDarkMode),
      toggleVibration: () => setVibrationEnabled(!vibrationEnabled)
    }}>
      <NavigationContainer>
        <Drawer.Navigator 
          initialRouteName="Home"
          screenOptions={{
            headerStyle: { backgroundColor: isDarkMode ? '#0a1f1a' : '#ffffff' },
            headerTintColor: isDarkMode ? '#ffffff' : '#000000',
            drawerStyle: { backgroundColor: isDarkMode ? '#0f2e24' : '#f0f0f0' },
            drawerActiveTintColor: '#4cd964',
            drawerInactiveTintColor: isDarkMode ? '#a0b0a8' : '#555555',
          }}
        >
          <Drawer.Screen name="Home" component={HomeScreen} />
          <Drawer.Screen name="Settings" component={SettingsScreen} />
          <Drawer.Screen name="Help" component={HelpScreen} />
          <Drawer.Screen name="Share App" component={ShareScreen} />
          <Drawer.Screen name="Debug Logs" component={DebugLogScreen} />
          <Drawer.Screen name="Prayer" component={PrayerScreen} options={{ drawerItemStyle: { display: 'none' } }} />
        </Drawer.Navigator>
      </NavigationContainer>
    </SettingsContext.Provider>
  );
}

const Drawer = createDrawerNavigator();

// --- 1. Home Screen (Rakaat Selection) ---
function HomeScreen({ navigation }: any) {
  const { isDarkMode } = useContext(SettingsContext);
  const theme = getTheme(isDarkMode);

  const startPrayer = (rakaatCount: number) => {
    navigation.navigate('Prayer', { targetRakaat: rakaatCount });
  };

  return (
    <SafeAreaView style={[styles.container, theme.container]}>
      <Text style={[styles.title, theme.text]}>Rakaat Tracker</Text>
      <Text style={[styles.subtitle, theme.subtitle]}>Choose rakaat to start</Text>
      
      <View style={styles.buttonRow}>
        <TouchableOpacity style={[styles.rakaatButton, theme.rakaatButton]} onPress={() => startPrayer(2)}>
          <Text style={[styles.rakaatButtonText, theme.text]}>Two</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.rakaatButton, theme.rakaatButton]} onPress={() => startPrayer(3)}>
          <Text style={[styles.rakaatButtonText, theme.text]}>Three</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.rakaatButton, theme.rakaatButton]} onPress={() => startPrayer(4)}>
          <Text style={[styles.rakaatButtonText, theme.text]}>Four</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={[styles.rakaatButton, theme.rakaatButton, { width: 200, marginTop: 10 }]} onPress={() => startPrayer(20)}>
        <Text style={[styles.rakaatButtonText, theme.text]}>Taraweeh</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// --- 2. Prayer Screen (Sensor & Counting) ---
function PrayerScreen({ route, navigation }: any) {
  const { isDarkMode, vibrationEnabled } = useContext(SettingsContext);
  const theme = getTheme(isDarkMode);
  const { targetRakaat } = route.params;
  
  const [appState, setAppState] = useState('CALIBRATING_AMBIENT');
  const [lightLevel, setLightLevel] = useState(0);
  const [rakaat, setRakaat] = useState(0);
  const [sajdahCount, setSajdahCount] = useState(0);
  const [isSujud, setIsSujud] = useState(false);
  
  const [ambientLight, setAmbientLight] = useState(0);
  const [sujudLight, setSujudLight] = useState(0);
  const [darkThreshold, setDarkThreshold] = useState(50);
  const [lightThreshold, setLightThreshold] = useState(100);

  // Latest lux (read by the calibration timer) + throttle for the live lux log
  const lightRef = useRef(0);
  const lastLuxLog = useRef(0);

  // Sensor Logic
  useEffect(() => {
    let subscription: { remove: () => void } | undefined;
    LightSensor.isAvailableAsync().then((available) => {
      logEvent('SENSOR', available ? 'Light sensor available' : 'Light sensor NOT available');
      if (available) {
        subscription = LightSensor.addListener(({ illuminance }) => {
          const currentLight = Math.round(illuminance);
          lightRef.current = currentLight;
          setLightLevel(currentLight);
          if (Date.now() - lastLuxLog.current >= 1000) {
            lastLuxLog.current = Date.now();
            logEvent('LUX', `${currentLight} lux`);
          }
          if (appState === 'PRAYING') {
            if (currentLight < darkThreshold && !isSujud) {
              setIsSujud(true);
              logEvent('SAJDAH', `dark ${currentLight} < ${darkThreshold} → In Sujud`);
              if (vibrationEnabled) Vibration.vibrate(50);
            } else if (currentLight > lightThreshold && isSujud) {
              setIsSujud(false);
              logEvent('SAJDAH', `light ${currentLight} > ${lightThreshold} → Standing`);
              if (vibrationEnabled) Vibration.vibrate(50);
              setSajdahCount((prev) => {
                const newCount = prev + 1;
                if (newCount === 2) {
                  setRakaat((r) => {
                    const nextRakaat = r + 1;
                    logEvent('RAKAAT', `completed → ${nextRakaat} / ${targetRakaat}`);
                    if (nextRakaat === targetRakaat) {
                      logEvent('DONE', 'Prayer complete');
                      Alert.alert('Prayer Complete', 'You have finished your prayer.');
                      navigation.goBack();
                    }
                    return nextRakaat;
                  });
                  return 0;
                }
                return newCount;
              });
            }
          }
        });
      }
    });
    return () => { if (subscription) subscription.remove(); };
  }, [appState, isSujud, darkThreshold, lightThreshold]);

  // Calibration Timer — samples the latest lux via a ref, so live light changes
  // do NOT restart the 3s timer (they would otherwise reset it forever).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (appState === 'CALIBRATING_AMBIENT') {
      logEvent('STATE', 'Calibrating ambient light (3s)…');
      timer = setTimeout(() => {
        const lv = lightRef.current;
        setAmbientLight(lv);
        logEvent('CAL', `ambient = ${lv} lux`);
        setAppState('CALIBRATING_SUJUD');
      }, 3000);
    } else if (appState === 'CALIBRATING_SUJUD') {
      logEvent('STATE', 'Simulating sujud — cover the sensor (3s)…');
      timer = setTimeout(() => {
        const lv = lightRef.current;
        setSujudLight(lv);
        const midPoint = (lv + ambientLight) / 2;
        setDarkThreshold(midPoint - 10);
        setLightThreshold(midPoint + 10);
        logEvent('CAL', `sujud = ${lv} lux → dark<${midPoint - 10}, light>${midPoint + 10}`);
        setAppState('PRAYING');
        logEvent('STATE', `Praying started (target ${targetRakaat} rakaat)`);
      }, 3000);
    }
    return () => clearTimeout(timer);
  }, [appState, ambientLight, targetRakaat]);

  useEffect(() => {
    logEvent('STATE', `Prayer screen opened (target ${targetRakaat} rakaat)`);
  }, []);

  useEffect(() => { activateKeepAwakeAsync(); return () => { deactivateKeepAwake(); }; }, []);

  if (appState === 'CALIBRATING_AMBIENT' || appState === 'CALIBRATING_SUJUD') {
    return (
      <View style={[styles.center, theme.container]}>
        <Text style={[styles.calibrationTitle, theme.text]}>
          {appState === 'CALIBRATING_AMBIENT' ? 'Calibrating Ambient Light...' : 'Simulating Sujud...'}
        </Text>
        <ActivityIndicator size="large" color="#4cd964" style={{ marginVertical: 30 }} />
        <Text style={[styles.calibrationHint, theme.subtitle]}>
          {appState === 'CALIBRATING_AMBIENT' ? 'Do not cover the phone.' : 'Cover the top of the phone.'}
        </Text>
        <Text style={styles.lightText}>{lightLevel} lux</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.center, theme.container]}>
      <Text style={[styles.prayerTitle, theme.subtitle]}>Rakaat {rakaat} / {targetRakaat}</Text>
      <Text style={[styles.prayerCount, theme.text]}>{rakaat}</Text>
      <Text style={[styles.sajdahText, theme.subtitle]}>Sajdah: {sajdahCount} / 2</Text>
      <Text style={[styles.statusText, { color: isSujud ? '#f1c40f' : '#4cd964' }]}>
        {isSujud ? '🧎 In Sujud' : '🧍 Standing'}
      </Text>
      
      <TouchableOpacity style={styles.stopButton} onPress={() => { logEvent('STATE', 'Prayer stopped by user'); navigation.goBack(); }}>
        <Text style={styles.stopButtonText}>Stop Prayer</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// --- 3. Settings Screen ---
function SettingsScreen() {
  const { isDarkMode, vibrationEnabled, toggleDarkMode, toggleVibration } = useContext(SettingsContext);
  const theme = getTheme(isDarkMode);

  return (
    <SafeAreaView style={[styles.container, theme.container]}>
      <Text style={[styles.title, theme.text]}>Settings</Text>
      
      <View style={styles.settingRow}>
        <Text style={[styles.settingLabel, theme.text]}>Night Mode</Text>
        <Switch value={isDarkMode} onValueChange={toggleDarkMode} trackColor={{ false: '#767577', true: '#4cd964' }} />
      </View>

      <View style={styles.settingRow}>
        <Text style={[styles.settingLabel, theme.text]}>Vibration</Text>
        <Switch value={vibrationEnabled} onValueChange={toggleVibration} trackColor={{ false: '#767577', true: '#4cd964' }} />
      </View>
    </SafeAreaView>
  );
}

// --- 4. Help Screen ---
function HelpScreen() {
  const { isDarkMode } = useContext(SettingsContext);
  const theme = getTheme(isDarkMode);
  return (
    <SafeAreaView style={[styles.container, theme.container]}>
      <Text style={[styles.title, theme.text]}>How to use</Text>
      <Text style={[styles.helpText, theme.subtitle]}>1. Place your phone on the prayer mat.</Text>
      <Text style={[styles.helpText, theme.subtitle]}>2. Do not cover the top of the phone during calibration.</Text>
      <Text style={[styles.helpText, theme.subtitle]}>3. When it says "Simulating Sujud", cover the top with your hand for 3 seconds.</Text>
      <Text style={[styles.helpText, theme.subtitle]}>4. Start praying. The app will count sajdahs and rakaats automatically.</Text>
    </SafeAreaView>
  );
}

// --- 5. Share Screen ---
function ShareScreen() {
  const { isDarkMode } = useContext(SettingsContext);
  const theme = getTheme(isDarkMode);
  
  const onShare = async () => {
    try {
      await Share.share({ message: 'Check out Rakaat Tracker! https://github.com/elyasyy23-lgtm/RakaatCounter' });
    } catch (error: any) { Alert.alert(error.message); }
  };

  return (
    <SafeAreaView style={[styles.container, theme.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <Text style={[styles.title, theme.text]}>Share & Support</Text>
      <TouchableOpacity style={[styles.mainButton, { marginTop: 20 }]} onPress={onShare}>
        <Text style={styles.mainButtonText}>Share App</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// --- 6. Debug Logs Screen ---
function DebugLogScreen() {
  const { isDarkMode } = useContext(SettingsContext);
  const theme = getTheme(isDarkMode);
  const logs = useDebugLogs();

  const renderItem = ({ item }: any) => (
    <View style={[styles.logRow, { borderBottomColor: isDarkMode ? '#1b4a3b' : '#e0e0e0' }]}>
      <Text style={[styles.logTime, theme.subtitle]}>{formatTime(item.t)}</Text>
      <Text style={styles.logTag}>{item.tag}</Text>
      <Text style={[styles.logMsg, theme.text]}>{item.msg}</Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, theme.container]}>
      <View style={styles.logHeaderRow}>
        <Text style={[styles.title, theme.text, { marginBottom: 0 }]}>Debug Logs</Text>
        <Text style={[styles.logCount, theme.subtitle]}>{logs.length} events</Text>
      </View>
      <Text style={[styles.subtitle, theme.subtitle, { marginBottom: 12 }]}>
        Live events from the light sensor and the rakaat counter.
      </Text>
      <View style={styles.logButtonRow}>
        <TouchableOpacity style={[styles.logButton, theme.rakaatButton]} onPress={() => logStore.clear()}>
          <Text style={[styles.logButtonText, theme.text]}>Clear</Text>
        </TouchableOpacity>
      </View>
      {logs.length === 0 ? (
        <Text style={[styles.subtitle, theme.subtitle]}>No events yet. Open a prayer to see logs.</Text>
      ) : (
        <FlatList
          data={[...logs].reverse()}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          style={styles.logList}
        />
      )}
    </SafeAreaView>
  );
}

// --- Theme Helper ---
function getTheme(isDark: boolean) {
  return {
    container: { backgroundColor: isDark ? '#0a1f1a' : '#f5f5f5' },
    text: { color: isDark ? '#ffffff' : '#000000' },
    subtitle: { color: isDark ? '#a0b0a8' : '#666666' },
    rakaatButton: { backgroundColor: isDark ? '#112a22' : '#ffffff', borderColor: isDark ? '#1b4a3b' : '#e0e0e0' },
  };
}

// --- Styles ---
const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 32, fontWeight: 'bold', marginBottom: 20 },
  subtitle: { fontSize: 16, marginBottom: 30 },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 20 },
  rakaatButton: { flex: 1, paddingVertical: 15, marginHorizontal: 5, borderRadius: 15, alignItems: 'center', borderWidth: 1 },
  rakaatButtonText: { fontSize: 18, fontWeight: 'bold' },
  
  prayerTitle: { fontSize: 20, letterSpacing: 2, marginBottom: 10 },
  prayerCount: { fontSize: 100, fontWeight: 'bold', lineHeight: 110 },
  sajdahText: { fontSize: 18, marginBottom: 20 },
  statusText: { fontSize: 26, fontWeight: 'bold' },
  stopButton: { backgroundColor: '#e74c3c', paddingHorizontal: 40, paddingVertical: 15, borderRadius: 30, marginTop: 40 },
  stopButtonText: { fontSize: 20, color: '#ffffff', fontWeight: 'bold' },

  calibrationTitle: { fontSize: 22, marginBottom: 20, textAlign: 'center', fontWeight: 'bold' },
  calibrationHint: { fontSize: 16, textAlign: 'center', marginBottom: 20 },
  lightText: { fontSize: 28, color: '#4cd964', fontWeight: 'bold' },

  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#333' },
  settingLabel: { fontSize: 18 },
  helpText: { fontSize: 16, marginBottom: 10, lineHeight: 24 },
  mainButton: { backgroundColor: '#1b4a3b', paddingHorizontal: 40, paddingVertical: 15, borderRadius: 30, borderWidth: 2, borderColor: '#4cd964' },
  mainButtonText: { fontSize: 18, color: '#ffffff', fontWeight: 'bold' },

  logHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  logCount: { fontSize: 14, fontWeight: 'bold' },
  logButtonRow: { flexDirection: 'row', marginBottom: 12 },
  logButton: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  logButtonText: { fontSize: 16, fontWeight: 'bold' },
  logList: { flex: 1 },
  logRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, alignItems: 'flex-start' },
  logTime: { fontSize: 12, width: 68 },
  logTag: { fontSize: 12, width: 66, color: '#4cd964', fontWeight: 'bold' },
  logMsg: { fontSize: 14, flex: 1 },
});
