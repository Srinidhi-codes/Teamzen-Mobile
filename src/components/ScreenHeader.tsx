import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAppTheme } from '../context/ThemeContext';
import { NotificationService, subscribeUnreadCount } from '../services/notifications';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  onBackPress?: () => void;
  showMenu?: boolean;
  onMenu?: () => void;
  onMenuPress?: () => void;
  showNotifications?: boolean;
  rightElement?: React.ReactNode;
  style?: any;
}

export default function ScreenHeader({
  title,
  subtitle,
  showBack = true,
  onBack,
  onBackPress,
  showMenu,
  onMenu,
  onMenuPress,
  showNotifications = false,
  rightElement,
  style,
}: ScreenHeaderProps) {
  const router = useRouter();
  const { colors, accentColors, isDark } = useAppTheme();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (showNotifications) {
      const unsub = subscribeUnreadCount(setUnreadCount);
      NotificationService.fetchUnreadCount();
      return unsub;
    }
  }, [showNotifications]);

  const handleBack = () => {
    const cb = onBackPress || onBack;
    if (cb) {
      cb();
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.push('/(tabs)');
    }
  };

  const handleMenu = onMenuPress || onMenu;
  const shouldShowMenu = showMenu !== undefined ? showMenu : Boolean(handleMenu);

  return (
    <View
      style={[
        styles.headerContainer,
        {
          backgroundColor: colors.background,
          borderBottomColor: colors.borderLight,
        },
        style,
      ]}
    >
      <View style={styles.leftContainer}>
        {showBack && (
          <TouchableOpacity
            style={[
              styles.iconBtn,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
                borderColor: colors.border,
              },
            ]}
            onPress={handleBack}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            accessibilityHint="Navigates to previous screen"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </TouchableOpacity>
        )}

        {shouldShowMenu && (
          <TouchableOpacity
            style={[
              styles.iconBtn,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
                borderColor: colors.border,
              },
            ]}
            onPress={handleMenu}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Open Menu"
            accessibilityHint="Opens navigation sidebar"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="menu" size={20} color={colors.text} />
          </TouchableOpacity>
        )}

        <View style={styles.titleWrapper}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.rightContainer}>
        {showNotifications && (
          <TouchableOpacity
            style={[
              styles.iconBtn,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
                borderColor: colors.border,
                position: 'relative',
              },
            ]}
            onPress={() => router.push('/notifications')}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name={unreadCount > 0 ? "notifications" : "notifications-outline"}
              size={20}
              color={colors.text}
            />
            {unreadCount > 0 && (
              <View style={styles.headerBadge}>
                <Text style={styles.headerBadgeText}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )}
        {rightElement}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    minHeight: 56,
  },
  leftContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  titleWrapper: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  rightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 8,
  },
  headerBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#ef4444',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  headerBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '900',
  },
});
