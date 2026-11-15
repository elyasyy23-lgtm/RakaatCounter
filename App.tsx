import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView, ActivityIndicator, StatusBar, Switch, Share, Alert, ScrollView, Vibration } from 'react-native';
import { LightSensor } from 'expo-sensors';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { NavigationContainer } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'; // Assuming expo vector icons are available

// --- Global Log Context ---
const LogContext = createContext<{ logs: string[]; addLog: (msg: string) => void }>({ logs: [], addLog: () => {} });

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
  
  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [`[${time}] ${msg}`, ...prev].slice(0, 50));
  };

  return (
    <SettingsContext.Provider value={{
      isDarkMode, vibrationEnabled,
      toggleDarkMode: () => setIsDarkMode(!isDarkMode),
      toggleVibration: () => setVibrationEnabled(!vibrationEnabled)
    }}>
      <LogContext.Provider value={{ logs, addLog }}>
        <NavigationContainer>
          <Drawer.Navigator 
            initialRouteName="Home"
            screenOptions={({ route }) => ({
              headerStyle: { backgroundColor: isDarkMode ? '#0a1f1a' : '#ffffff', elevation: 0, shadowOpacity: 0 },
              headerTintColor: isDarkMode ? '#ffffff' : '#000000',
              drawerStyle: { backgroundColor: isDarkMode ? '#0f2e24' : '#f0f0f0', width: 280 },
              drawerActiveTintColor: '#4cd964',
              drawerInactiveTintColor: isDarkMode ? '#a0b0a8' : '#555555',
              drawerLabelStyle: { fontSize: 16, fontWeight: '600', marginLeft: -10 },
              drawerIcon: ({ color, size, focused }) => {
                let iconName;
                if (route.name === 'Home') iconName = focused ? 'home' : 'home-outline';
                else if (route.name === 'Settings') iconName = focused ? 'settings' : 'settings-outline';
                else if (route.name === 'Help') iconName = focused ? 'help-circle' : 'help-circle-outline';
                else if (route.name === 'Share App') iconName = focused ? 'share-social' : 'share-social-outline';
                else if (route.name === 'Debug Logs') iconName = focused ? 'terminal' : 'terminal-outline';
                return <Ionicons name={iconName as any} size={size} color={color} />;
              },
            })}
          >
            <Drawer.Screen name="Home" component={HomeScreen} />
            <Drawer.Screen name="Settings" component={SettingsScreen} />
            <Drawer.Screen name="Debug Logs" component={LogsScreen} />
            <Drawer.Screen name="Help" component={HelpScreen} />
            <Drawer.Screen name="Share App" component={ShareScreen} />
            <Drawer.Screen name="Prayer" component={PrayerScreen} options={{ drawerItemStyle: { display: 'none' }, headerShown: false }} />
          </Drawer.Navigator>
        </NavigationContainer>
      </LogContext.Provider>
    </SettingsContext.Provider>
  );
}

const Drawer = createDrawerNavigator();

// --- 1. Home Screen ---
function HomeScreen({ navigation }: any) {
  const { isDarkMode } = useContext(SettingsContext);
  const theme = getTheme(isDarkMode);

  const startPrayer = (rakaatCount: number) => {
    navigation.navigate('Prayer', { targetRakaat: rakaatCount });
  };

  return (
    <SafeAreaView style={[styles.container, theme.container]}>
      <View style={styles.heroContainer}>
        <MaterialCommunityIcons name="mosque" size={100} color={isDarkMode ? '#4cd964' : '#1b4a3b'} />
        <Text style={[styles.title, theme.text]}>Rakaat Tracker</Text>
        <Text style={[styles.subtitle, theme.subtitle]}>Enhancing Your Salah Experience</Text>
      </View>
      
      <Text style={[styles.sectionTitle, theme.text]}>Choose rakaat to start</Text>
      
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
      <TouchableOpacity style={[styles.rakaatButton, theme.rakaatButton, { width: '60%', marginTop: 15 }]} onPress={() => startPrayer(20)}>
        <Text style={[styles.rakaatButtonText, theme.text]}>Taraweeh</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

// --- 2. Prayer Screen ---
function PrayerScreen({ route, navigation }: any) {
  const { isDarkMode, vibrationEnabled } = useContext(SettingsContext);
  const { addLog } = useContext(LogContext);
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

  // Latest lux, read by the calibration timer. Kept in a ref so live light
  // changes do not restart the 3s countdown (which would stall calibration).
  const lightRef = useRef(0);

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
              if (vibrationEnabled) Vibration.vibrate(50);
              setSajdahCount((prev) => {
                const newCount = prev + 1;
                if (newCount === 2) {
                  setRakaat((r) => {
                    const nextRakaat = r + 1;
                    addLog(`Rakaat ${nextRakaat} completed!`);
                    if (nextRakaat === targetRakaat) {
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

  if (appState === 'CALIBRATING_AMBIENT' || appState === 'CALIBRATING_SUJUD') {
    return (
      <View style={[styles.center, theme.container]}>
        <Text style={[styles.calibrationTitle, theme.text]}>
          {appState === 'CALIBRATING_AMBIENT' ? 'Calibrating...' : 'Simulating Sujud...'}
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
      <Text style={[styles.prayerTitle, theme.subtitle]}>Target: {targetRakaat} Rakaat</Text>
      
      <View style={styles.counterContainer}>
        <Text style={[styles.prayerCount, theme.text]}>{rakaat}</Text>
        <Text style={[styles.counterLabel, theme.subtitle]}>Rakaat</Text>
      </View>
      
      <View style={styles.counterContainer}>
        <Text style={[styles.sajdahCount, theme.text]}>{sajdahCount}</Text>
        <Text style={[styles.counterLabel, theme.subtitle]}>Sujud</Text>
      </View>

      <Text style={[styles.statusText, { color: isSujud ? '#f1c40f' : '#4cd964' }]}>
        {isSujud ? '🧎 In Sujud' : '🧍 Standing'}
      </Text>
      
      <TouchableOpacity style={styles.stopButton} onPress={() => { addLog('Prayer stopped.'); navigation.goBack(); }}>
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
      
      <View style={[styles.settingRow, theme.settingRowBorder]}>
        <Text style={[styles.settingLabel, theme.text]}>Night Mode</Text>
        <Switch value={isDarkMode} onValueChange={toggleDarkMode} trackColor={{ false: '#767577', true: '#4cd964' }} />
      </View>

      <View style={[styles.settingRow, theme.settingRowBorder]}>
        <Text style={[styles.settingLabel, theme.text]}>Vibration</Text>
        <Switch value={vibrationEnabled} onValueChange={toggleVibration} trackColor={{ false: '#767577', true: '#4cd964' }} />
      </View>
    </SafeAreaView>
  );
}

// --- 4. Debug Logs Screen ---
function LogsScreen() {
  const { isDarkMode } = useContext(SettingsContext);
  const { logs } = useContext(LogContext);
  const theme = getTheme(isDarkMode);

  return (
    <SafeAreaView style={[styles.container, theme.container]}>
      <Text style={[styles.title, theme.text]}>Debug Logs</Text>
      <ScrollView style={{ flex: 1, width: '100%' }}>
        {logs.map((log, index) => (
          <Text key={index} style={[styles.logText, theme.subtitle]}>{log}</Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

// --- 5. Help Screen ---
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

// --- 6. Share Screen ---
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

// --- Helpers & Styles ---
function getTheme(isDark: boolean) {
  return {
    container: { backgroundColor: isDark ? '#0a1f1a' : '#f5f5f5' },
    text: { color: isDark ? '#ffffff' : '#1a1a1a' },
    subtitle: { color: isDark ? '#a0b0a8' : '#666666' },
    rakaatButton: { backgroundColor: isDark ? '#112a22' : '#ffffff', borderColor: isDark ? '#1b4a3b' : '#e0e0e0' },
    settingRowBorder: { borderBottomColor: isDark ? '#1b4a3b' : '#e0e0e0' },
  };
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  
  heroContainer: { alignItems: 'center', marginTop: 40, marginBottom: 40 },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 8, letterSpacing: 0.5 },
  subtitle: { fontSize: 14, marginBottom: 20, letterSpacing: 1 },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 20, textAlign: 'center' },
  
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 15 },
  rakaatButton: { 
    flex: 1, 
    paddingVertical: 18, 
    marginHorizontal: 6, 
    borderRadius: 16, 
    alignItems: 'center', 
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  rakaatButtonText: { fontSize: 18, fontWeight: 'bold' },
  
  prayerTitle: { fontSize: 18, letterSpacing: 2, marginBottom: 30 },
  counterContainer: { alignItems: 'center', marginBottom: 20 },
  prayerCount: { fontSize: 90, fontWeight: 'bold', lineHeight: 100 },
  sajdahCount: { fontSize: 60, fontWeight: 'bold', lineHeight: 70 },
  counterLabel: { fontSize: 16, textTransform: 'uppercase', letterSpacing: 2 },
  
  statusText: { fontSize: 24, fontWeight: 'bold', marginVertical: 20 },
  stopButton: { backgroundColor: '#e74c3c', paddingHorizontal: 40, paddingVertical: 15, borderRadius: 30, marginTop: 20 },
  stopButtonText: { fontSize: 18, color: '#ffffff', fontWeight: 'bold' },

  calibrationTitle: { fontSize: 24, marginBottom: 20, textAlign: 'center', fontWeight: 'bold' },
  calibrationHint: { fontSize: 16, textAlign: 'center', marginBottom: 20 },
  lightText: { fontSize: 32, color: '#4cd964', fontWeight: 'bold' },

  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 18, borderBottomWidth: 1 },
  settingLabel: { fontSize: 18 },
  
  logText: { fontSize: 14, marginBottom: 8, fontFamily: 'monospace' },
  
  helpText: { fontSize: 16, marginBottom: 12, lineHeight: 24 },
  mainButton: { backgroundColor: '#1b4a3b', paddingHorizontal: 40, paddingVertical: 15, borderRadius: 30, borderWidth: 1, borderColor: '#4cd964' },
  mainButtonText: { fontSize: 18, color: '#ffffff', fontWeight: 'bold' },
}); 
