import React, { useRef, useEffect, useState } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider, Stack, useRouter, useSegments } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';

import { AuthProvider, useAuth } from '../context/AuthContext';
import { AppThemeProvider, useAppTheme } from '../context/ThemeContext';
import { ToastProvider } from '../context/ToastContext';
import { TourProvider } from '../context/TourContext';
import InteractiveAppTour from '../components/InteractiveAppTour';
import { OnboardingStorage } from '../utils/onboardingStorage';
import '../services/heartbeat';

function RootLayoutNav() {
  const { accessToken, isLoading } = useAuth();
  const { isDark, colors, accentColors } = useAppTheme();
  const router = useRouter();
  const segments = useSegments();
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);

  // Auto-check for OTA updates from EAS on launch (only when running standalone/production)
  useEffect(() => {
    async function checkCloudUpdates() {
      try {
        if (!Updates.isEnabled || __DEV__) return;
        const update = await Updates.checkForUpdateAsync();
        if (update?.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch {
        // Silently skip if offline, running in Expo Go or local dev
      }
    }
    checkCloudUpdates();
  }, []);

  // Guard to prevent double navigation calls
  const isNavigating = useRef(false);

  // Check onboarding flag once on mount
  useEffect(() => {
    OnboardingStorage.hasSeenOnboarding().then((seen) => {
      setHasSeenOnboarding(seen);
      setOnboardingChecked(true);
    });
  }, []);

  useEffect(() => {
    if (isLoading || !onboardingChecked) return;
    if (isNavigating.current) return;

    // Read current route from segments (don't add segments to deps — it changes ref every render)
    const root = segments[0] as string | undefined;
    const inAuthGroup = root === 'login';
    const inOnboarding = root === 'onboarding';
    const inTabs = root === '(tabs)';

    if (!accessToken && !inAuthGroup) {
      // Not authenticated → always send to login first
      isNavigating.current = true;
      router.replace('/login');
    } else if (accessToken && !hasSeenOnboarding && !inOnboarding) {
      // First time after login → trigger app onboarding tour!
      isNavigating.current = true;
      router.replace('/onboarding');
    } else if (accessToken && hasSeenOnboarding && inAuthGroup) {
      // Already logged in & completed tour → skip login to dashboard
      isNavigating.current = true;
      router.replace('/(tabs)');
    }

    // Reset navigation guard after a short debounce
    const timer = setTimeout(() => { isNavigating.current = false; }, 500);
    return () => clearTimeout(timer);
  }, [accessToken, isLoading, hasSeenOnboarding, onboardingChecked]);

  if (isLoading || !onboardingChecked) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={accentColors.primary} />
      </View>
    );
  }

  const navTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
      background: colors.background,
      card: colors.backgroundCard,
      text: colors.text,
      border: colors.border,
    }
  };

  return (
    <TourProvider>
      <ThemeProvider value={navTheme}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <View style={{ flex: 1, position: 'relative' }}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="notifications" />
            <Stack.Screen name="attendance-requests" />
            <Stack.Screen name="employee-onboarding" />
            <Stack.Screen name="profile" />
            <Stack.Screen name="payroll" />
            <Stack.Screen name="documents" />
            <Stack.Screen name="login" />
          </Stack>
          <InteractiveAppTour />
        </View>
      </ThemeProvider>
    </TourProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <AppThemeProvider>
        <ToastProvider>
          <RootLayoutNav />
        </ToastProvider>
      </AppThemeProvider>
    </AuthProvider>
  );
}
