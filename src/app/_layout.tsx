import React, { useRef } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider, Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { AppThemeProvider, useAppTheme } from '../context/ThemeContext';
import { StatusBar } from 'expo-status-bar';
import { OnboardingStorage } from '../utils/onboardingStorage';

function RootLayoutNav() {
  const { accessToken, isLoading } = useAuth();
  const { isDark, colors, accentColors } = useAppTheme();
  const router = useRouter();
  const segments = useSegments();
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);

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
  // ⚠️  `segments` intentionally omitted from deps — it changes object reference every render
  //     and would cause an infinite navigation loop. We read it inside the effect safely.

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
    <ThemeProvider value={navTheme}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
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
    </ThemeProvider>
  );
}

import { ToastProvider } from '../context/ToastContext';

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
