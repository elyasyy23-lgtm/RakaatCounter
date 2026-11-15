import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView, ActivityIndicator } from 'react-native';
import { LightSensor } from 'expo-sensors';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

type AppState = 'IDLE' | 'CALIBRATING_AMBIENT' | 'CALIBRATING_SUJUD' | 'READY' | 'PRAYING';

export default function App() {
  const [appState, setAppState] = useState<AppState>('IDLE');
  const [lightLevel, setLightLevel] = useState(0);
  
  const [rakaat, setRakaat] = useState(0);
  const [sajdahCount, setSajdahCount] = useState(0);
  const [isSujud, setIsSujud] = useState(false);

  const [ambientLight, setAmbientLight] = useState(0);
  const [sujudLight, setSujudLight] = useState(0);
  const [darkThreshold, setDarkThreshold] = useState(50);
  const [lightThreshold, setLightThreshold] = useState(100);

  useEffect(() => {
    let subscription: any;
    
    LightSensor.isAvailableAsync().then((available) => {
      if (available) {
        subscription = LightSensor.addListener(({ illuminance }) => {
          const currentLight = Math.round(illuminance);
          setLightLevel(currentLight);

          if (appState === 'PRAYING') {
            if (currentLight < darkThreshold && !isSujud) {
              setIsSujud(true);
            } else if (currentLight > lightThreshold && isSujud) {
              setIsSujud(false);
              setSajdahCount((prev) => {
                const newCount = prev + 1;
                if (newCount === 2) {
                  setRakaat((r) => r + 1);
                  return 0;
                }
                return newCount;
              });
            }
          }
        });
      }
    });

    return () => {
      if (subscription) subscription.remove();
    };
  }, [appState, isSujud, darkThreshold, lightThreshold]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    if (appState === 'CALIBRATING_AMBIENT') {
      timer = setTimeout(() => {
        setAmbientLight(lightLevel);
        setAppState('CALIBRATING_SUJUD');
      }, 3000);
    } 
    else if (appState === 'CALIBRATING_SUJUD') {
      timer = setTimeout(() => {
        setSujudLight(lightLevel);
        const midPoint = (lightLevel + ambientLight) / 2;
        setDarkThreshold(midPoint - 10); 
        setLightThreshold(midPoint + 10); 
        setAppState('READY');
      }, 3000);
    }

    return () => clearTimeout(timer);
  }, [appState, lightLevel, ambientLight]);

  const startCalibration = () => {
    setAppState('CALIBRATING_AMBIENT');
    activateKeepAwakeAsync();
  };

  return (
    <SafeAreaView style={styles.container}>
      
      {/* 1. Start Screen */}
      {appState === 'IDLE' && (
        <View style={styles.center}>
          <Text style={styles.title}>Rakaat Counter</Text>
          <Text style={styles.subtitle}>Position the phone on your prayer mat and press Start.</Text>
          <TouchableOpacity style={styles.mainButton} onPress={startCalibration}>
            <Text style={styles.mainButtonText}>Start</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 2. Calibration Screen */}
      {(appState === 'CALIBRATING_AMBIENT' || appState === 'CALIBRATING_SUJUD') && (
        <View style={styles.center}>
          <Text style={styles.calibrationTitle}>
            {appState === 'CALIBRATING_AMBIENT' 
              ? 'Calibration in progress ...' 
              : 'Simulating Sujud ...'}
          </Text>
          
          <ActivityIndicator size="large" color="#2ecc71" style={{ marginVertical: 30 }} />

          <Text style={styles.calibrationHint}>
            {appState === 'CALIBRATING_AMBIENT' 
              ? 'Do not cover the phone. Measuring ambient light...' 
              : 'Cover the top of the phone with your hand...'}
          </Text>
          
          <View style={styles.lightBox}>
             <Text style={styles.lightText}>Lux: {lightLevel}</Text>
          </View>
        </View>
      )}

      {/* 3. Ready Screen */}
      {appState === 'READY' && (
        <View style={styles.center}>
          <Text style={styles.title}>Calibration Complete ✅</Text>
          <View style={styles.resultBox}>
            <Text style={styles.resultText}>Ambient: {ambientLight} lux</Text>
            <Text style={styles.resultText}>Sujud: {sujudLight} lux</Text>
            <Text style={styles.resultText}>(Threshold: {darkThreshold})</Text>
          </View>
          
          <TouchableOpacity 
            style={[styles.mainButton, { backgroundColor: '#2ecc71', marginTop: 30 }]} 
            onPress={() => setAppState('PRAYING')}
          >
            <Text style={styles.mainButtonText}>Start Prayer</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 4. Prayer Screen */}
      {appState === 'PRAYING' && (
        <View style={styles.center}>
          <Text style={styles.title}>Rakaat: {rakaat}</Text>
          <Text style={styles.subtitle}>Sajdah: {sajdahCount} / 2</Text>
          
          <Text style={[styles.statusText, { color: isSujud ? '#f1c40f' : '#2ecc71' }]}>
            {isSujud ? '🧎 In Sujud...' : '🧍 Standing'}
          </Text>

          <Text style={styles.lightInfo}>Light: {lightLevel} lux</Text>

          <TouchableOpacity 
            style={[styles.mainButton, { backgroundColor: '#e74c3c', marginTop: 40 }]} 
            onPress={() => {
              setAppState('IDLE');
              setRakaat(0);
              setSajdahCount(0);
              deactivateKeepAwake();
            }}
          >
            <Text style={styles.mainButtonText}>Stop Prayer</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f2027', padding: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 36, color: '#ffffff', marginBottom: 10, fontWeight: 'bold' },
  subtitle: { fontSize: 16, color: '#bdc3c7', marginBottom: 30, textAlign: 'center', paddingHorizontal: 20 },
  mainButton: { backgroundColor: '#2ecc71', paddingHorizontal: 50, paddingVertical: 15, borderRadius: 30, width: '80%', alignItems: 'center', marginTop: 20 },
  mainButtonText: { fontSize: 22, color: '#ffffff', fontWeight: 'bold' },
  
  calibrationTitle: { fontSize: 22, color: '#f1c40f', marginBottom: 20, textAlign: 'center' },
  calibrationHint: { fontSize: 16, color: '#ffffff', textAlign: 'center', marginBottom: 20, paddingHorizontal: 20 },
  lightBox: { backgroundColor: '#1a2a33', padding: 15, borderRadius: 10, marginTop: 10 },
  lightText: { fontSize: 20, color: '#2ecc71', fontWeight: 'bold' },

  resultBox: { backgroundColor: '#1a2a33', padding: 20, borderRadius: 10, width: '80%', alignItems: 'center' },
  resultText: { fontSize: 18, color: '#ffffff', marginBottom: 5 },

  statusText: { fontSize: 28, marginTop: 20, fontWeight: 'bold' },
  lightInfo: { fontSize: 16, color: '#7f8c8d', marginTop: 10 }
});
