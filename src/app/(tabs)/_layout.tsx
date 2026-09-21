import React from 'react';
import { Tabs } from 'expo-router';
import { Platform, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../context/ThemeContext';

export default function TabsLayout() {
  const { colors, accentColors, isDark } = useAppTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarLabel: 'Home',
          tabBarStyle: { display: 'none' },
          tabBarIcon: ({ color, size }: any) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="attendance"
        options={{
          title: 'Attendance Tracking',
          tabBarLabel: 'Attendance',
          tabBarIcon: ({ color, size }: any) => <Ionicons name="time" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'AI Workplace Assistant',
          tabBarLabel: 'AI Chat',
          tabBarStyle: { display: 'none' },
          tabBarIcon: ({ color, size }: any) => (
            <Image
              source={require('../../../assets/images/assistant-mark.webp')}
              style={{ width: size, height: size, resizeMode: 'contain' }}
              fadeDuration={0}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="leave"
        options={{
          title: 'Leave',
          tabBarLabel: 'Leaves',
          tabBarIcon: ({ color, size }: any) => <Ionicons name="calendar" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="team"
        options={{
          title: 'My Team',
          tabBarLabel: 'Team',
          tabBarIcon: ({ color, size }: any) => <Ionicons name="people" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
