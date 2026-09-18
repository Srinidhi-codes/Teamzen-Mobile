import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthService } from '../services/auth';
import { graphqlRequest } from '../services/api';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ColorAccent = 'teal' | 'indigo' | 'blue' | 'green' | 'red' | 'orange' | 'purple' | 'slate' | 'neutral';

export interface ThemeContextType {
  themeMode: ThemeMode;
  accent: ColorAccent;
  isDark: boolean;
  colors: typeof themeColors.dark;
  accentColors: {
    primary: string;
    active: string;
    light: string;
  };
  setThemeMode: (mode: ThemeMode) => void;
  setAccent: (accent: ColorAccent) => void;
  setOrgAccent: (accent?: string | null) => void;
}

const themeColors = {
  dark: {
    background: '#020817',
    backgroundCard: '#0f172a',
    border: '#1e293b',
    borderLight: '#1e293b80',
    text: '#f8fafc',
    textSecondary: '#94a3b8',
    textMuted: '#64748b',
    cardElement: '#1e293b',
    inputBg: '#0f172a',
    tabBarBg: '#020817',
    gradientBg: ['#020817', '#0f172a'] as [string, string],
    gradientCard: ['#0f172a', '#1e293b'] as [string, string],
  },
  light: {
    background: '#f8fafc',
    backgroundCard: '#ffffff',
    border: '#e2e8f0',
    borderLight: '#f1f5f9',
    text: '#0f172a',
    textSecondary: '#475569',
    textMuted: '#94a3b8',
    cardElement: '#f1f5f9',
    inputBg: '#f1f5f9',
    tabBarBg: '#ffffff',
    gradientBg: ['#f8fafc', '#e2e8f0'] as [string, string],
    gradientCard: ['#ffffff', '#f1f5f9'] as [string, string],
  },
};

const accentColorsMap: Record<ColorAccent, { primary: string; active: string; light: string }> = {
  teal: { primary: '#0d9488', active: '#0f766e', light: '#0d948818' },
  indigo: { primary: '#6366f1', active: '#4f46e5', light: '#6366f115' },
  blue: { primary: '#3b82f6', active: '#2563eb', light: '#3b82f615' },
  green: { primary: '#10b981', active: '#059669', light: '#10b98115' },
  red: { primary: '#ef4444', active: '#dc2626', light: '#ef444415' },
  orange: { primary: '#f97316', active: '#ea580c', light: '#f9731615' },
  purple: { primary: '#8b5cf6', active: '#7c3aed', light: '#8b5cf615' },
  slate: { primary: '#64748b', active: '#475569', light: '#64748b15' },
  neutral: { primary: '#71717a', active: '#52525b', light: '#71717a15' },
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const AppThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [accent, setAccentState] = useState<ColorAccent>('teal');

  const setOrgAccent = useCallback(async (orgAccent?: string | null) => {
    if (!orgAccent) return;
    const clean = orgAccent.toLowerCase().trim() as ColorAccent;
    if (clean in accentColorsMap) {
      setAccentState(clean);
      try {
        await AsyncStorage.setItem('org_accent_color', clean);
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    // Load persisted settings
    const loadSettings = async () => {
      try {
        const storedThemeMode = await AsyncStorage.getItem('theme_mode');
        const storedOrgAccent = await AsyncStorage.getItem('org_accent_color');

        if (storedThemeMode) setThemeModeState(storedThemeMode as ThemeMode);
        
        // Prioritize organization accent from backend
        if (storedOrgAccent && (storedOrgAccent in accentColorsMap)) {
          setAccentState(storedOrgAccent as ColorAccent);
        } else {
          setAccentState('teal');
        }

        // Live check with backend if authenticated
        const token = await AuthService.getAccessToken();
        if (token) {
          try {
            const res = await graphqlRequest<{ me?: { organization?: { accent?: string } } }>(
              `query GetOrgAccent { me { organization { accent } } }`
            );
            if (res?.me?.organization?.accent) {
              setOrgAccent(res.me.organization.accent);
            }
          } catch (e) {}
        }
      } catch (error) {
        console.error('Failed to load theme settings from storage:', error);
      }
    };
    loadSettings();
  }, [setOrgAccent]);

  const setThemeMode = async (mode: ThemeMode) => {
    setThemeModeState(mode);
    try {
      await AsyncStorage.setItem('theme_mode', mode);
    } catch (e) {}
  };

  const setAccent = async (newAccent: ColorAccent) => {
    setAccentState(newAccent);
    try {
      await AsyncStorage.setItem('accent_color', newAccent);
      await AsyncStorage.setItem('org_accent_color', newAccent);
    } catch (e) {}
  };

  const isDark = themeMode === 'system' ? systemColorScheme === 'dark' : themeMode === 'dark';
  const colors = isDark ? themeColors.dark : themeColors.light;
  
  // Dynamic accent colors with dark mode enhancement
  const baseAccent = accentColorsMap[accent] || accentColorsMap.teal;
  const accentColors = {
    primary: isDark && accent === 'teal' ? '#14b8a6' : baseAccent.primary,
    active: isDark && accent === 'teal' ? '#0d9488' : baseAccent.active,
    light: isDark && accent === 'teal' ? '#14b8a622' : baseAccent.light,
  };

  return (
    <ThemeContext.Provider
      value={{
        themeMode,
        accent,
        isDark,
        colors,
        accentColors,
        setThemeMode,
        setAccent,
        setOrgAccent,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useAppTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useAppTheme must be used within an AppThemeProvider');
  }
  return context;
};
