import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAppTheme } from '../context/ThemeContext';
import ScreenHeader from '../components/ScreenHeader';
import {
  NotificationItem,
  NotificationService,
  subscribeUnreadCount,
} from '../services/notifications';

function formatRelativeTime(dateString: string): string {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateString;
  }
}

import { useToast } from '../context/ToastContext';

export default function NotificationsScreen() {
  const router = useRouter();
  const { colors, accentColors, isDark } = useAppTheme();
  const { showAnnouncement, showImagePreview } = useToast();
  const styles = getStyles(colors, accentColors, isDark);

  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const unsub = subscribeUnreadCount(setUnreadCount);
    return unsub;
  }, []);

  const loadNotifications = useCallback(async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      const data = await NotificationService.fetchNotifications({
        level: 'personal',
        isRead: activeTab === 'unread' ? false : undefined,
        page: 1,
        pageSize: 40,
      });
      setNotifications(data?.results || []);
      await NotificationService.fetchUnreadCount();
    } catch (e: any) {
      console.error('Failed to load notifications:', e);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const onRefresh = () => {
    setIsRefreshing(true);
    loadNotifications(false);
  };

  const handleMarkAllRead = async () => {
    try {
      await NotificationService.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch (e) {
      Alert.alert('Error', 'Failed to mark all notifications as read.');
    }
  };

  const handleDeleteAllRead = async () => {
    Alert.alert(
      'Clear Read Notifications',
      'Are you sure you want to delete all read notifications?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            try {
              await NotificationService.deleteAllRead();
              setNotifications((prev) => prev.filter((n) => !n.isRead));
            } catch (e) {
              Alert.alert('Error', 'Failed to delete read notifications.');
            }
          },
        },
      ]
    );
  };

  const handleNotificationPress = async (item: NotificationItem) => {
    if (!item.isRead) {
      await NotificationService.markAsRead(item.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n))
      );
    }

    if (item.verb === 'announcement') {
      showAnnouncement({
        id: item.id,
        message: item.message,
        imageUrl: item.imageUrl,
        createdAt: item.createdAt,
        actor: item.actor,
      });
      return;
    }

    // Deep link navigation matching web portal
    const target = item.targetType?.toLowerCase() || '';
    if (target.includes('leave')) {
      router.push('/leave');
    } else if (target.includes('attendance') || target.includes('correction')) {
      router.push('/attendance-requests');
    } else if (target.includes('payroll') || target.includes('payslip')) {
      router.push('/payroll');
    }
  };

  const handleDeleteItem = async (id: string) => {
    try {
      await NotificationService.deleteNotification(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (e) {
      Alert.alert('Error', 'Failed to delete notification.');
    }
  };

  const getVerbIcon = (verb?: string, isRead?: boolean) => {
    const v = verb?.toLowerCase() || '';
    if (v === 'announcement') {
      return { name: 'megaphone' as const, color: '#6366f1', bg: '#6366f118' };
    }
    if (v === 'approved') {
      return { name: 'checkmark-circle' as const, color: '#10b981', bg: '#10b98115' };
    }
    if (v === 'rejected') {
      return { name: 'close-circle' as const, color: '#ef4444', bg: '#ef444415' };
    }
    if (v === 'cancelled') {
      return { name: 'remove-circle' as const, color: '#64748b', bg: '#64748b15' };
    }
    if (v === 'requested') {
      return { name: 'time' as const, color: '#3b82f6', bg: '#3b82f615' };
    }
    return isRead
      ? { name: 'mail-open' as const, color: colors.textMuted, bg: isDark ? '#1e293b' : '#f1f5f9' }
      : { name: 'notifications' as const, color: accentColors.primary, bg: accentColors.light };
  };

  const renderItem = ({ item }: { item: NotificationItem }) => {
    const iconConfig = getVerbIcon(item.verb, item.isRead);

    return (
      <TouchableOpacity
        style={[
          styles.notificationCard,
          !item.isRead && styles.unreadCard,
        ]}
        activeOpacity={0.8}
        onPress={() => handleNotificationPress(item)}
      >
        {/* Unread indicator bar on the left */}
        {!item.isRead && <View style={[styles.unreadBar, { backgroundColor: accentColors.primary }]} />}

        {/* Icon */}
        <View style={[styles.iconContainer, { backgroundColor: iconConfig.bg }]}>
          <Ionicons name={iconConfig.name} size={20} color={iconConfig.color} />
        </View>

        {/* Content */}
        <View style={styles.contentContainer}>
          <View style={styles.messageHeader}>
            <Text style={[styles.targetTypeText, { color: accentColors.primary }]}>
              {item.targetType || 'Notification'}
            </Text>
            <Text style={[styles.timeText, { color: colors.textMuted }]}>
              {formatRelativeTime(item.createdAt)}
            </Text>
          </View>

          <Text
            style={[
              styles.messageText,
              { color: colors.text },
              !item.isRead && styles.unreadMessageText,
            ]}
            numberOfLines={3}
          >
            {item.message}
          </Text>

          {item.imageUrl && (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={(e) => {
                e.stopPropagation();
                showImagePreview(item.imageUrl!, item.verb === 'announcement' ? 'Announcement Image' : 'Attachment');
              }}
              style={styles.cardImageContainer}
            >
              <Image
                source={{ uri: item.imageUrl }}
                style={styles.cardImage}
                fadeDuration={0}
                resizeMode="cover"
              />
              <View style={styles.cardImageExpandBtn}>
                <Ionicons name="expand" size={12} color="#FFFFFF" />
                <Text style={styles.cardImageExpandText}>Enlarge</Text>
              </View>
            </TouchableOpacity>
          )}

          {item.actor && (item.actor.firstName || item.actor.lastName) && (
            <Text style={[styles.actorText, { color: colors.textSecondary }]}>
              From: {item.actor.firstName} {item.actor.lastName}
            </Text>
          )}
        </View>

        {/* Delete action */}
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => handleDeleteItem(item.id)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Delete notification"
        >
          <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const filteredNotifications = notifications.filter((n) =>
    activeTab === 'unread' ? !n.isRead : true
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScreenHeader
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
        showBack={true}
        showNotifications={false}
        rightElement={
          <View style={styles.headerRight}>
            {unreadCount > 0 && (
              <TouchableOpacity
                style={[styles.headerActionBtn, { backgroundColor: accentColors.light }]}
                onPress={handleMarkAllRead}
                activeOpacity={0.7}
              >
                <Ionicons name="checkmark-done" size={16} color={accentColors.primary} />
                <Text style={[styles.headerActionText, { color: accentColors.primary }]}>
                  Mark all read
                </Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />

      {/* Filter Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[
            styles.tabButton,
            activeTab === 'all' && [styles.activeTabButton, { borderColor: accentColors.primary }],
          ]}
          onPress={() => setActiveTab('all')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'all'
                ? [styles.activeTabText, { color: accentColors.primary }]
                : { color: colors.textSecondary },
            ]}
          >
            All
          </Text>
          <View
            style={[
              styles.tabBadge,
              {
                backgroundColor:
                  activeTab === 'all' ? accentColors.light : isDark ? '#1e293b' : '#f1f5f9',
              },
            ]}
          >
            <Text
              style={[
                styles.tabBadgeText,
                { color: activeTab === 'all' ? accentColors.primary : colors.textSecondary },
              ]}
            >
              {notifications.length}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabButton,
            activeTab === 'unread' && [styles.activeTabButton, { borderColor: accentColors.primary }],
          ]}
          onPress={() => setActiveTab('unread')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'unread'
                ? [styles.activeTabText, { color: accentColors.primary }]
                : { color: colors.textSecondary },
            ]}
          >
            Unread
          </Text>
          {unreadCount > 0 && (
            <View style={[styles.tabBadge, { backgroundColor: '#ef4444' }]}>
              <Text style={[styles.tabBadgeText, { color: '#ffffff' }]}>
                {unreadCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {notifications.some((n) => n.isRead) && (
          <TouchableOpacity
            style={styles.clearAllBtn}
            onPress={handleDeleteAllRead}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={14} color="#ef4444" />
            <Text style={styles.clearAllText}>Clear Read</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Notification List */}
      {isLoading && !isRefreshing ? (
        <View style={styles.loadingWrapper}>
          <ActivityIndicator size="large" color={accentColors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredNotifications}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.listContent,
            filteredNotifications.length === 0 && styles.emptyListContent,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={accentColors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIconBg, { backgroundColor: accentColors.light }]}>
                <Ionicons
                  name={activeTab === 'unread' ? 'mail-open-outline' : 'notifications-off-outline'}
                  size={42}
                  color={accentColors.primary}
                />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {activeTab === 'unread' ? 'No unread notifications' : 'No notifications yet'}
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                {activeTab === 'unread'
                  ? 'You are all caught up! Check back later for updates on leaves and attendance.'
                  : 'Important notices, approvals, and workplace updates will show up here.'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const getStyles = (colors: any, accentColors: any, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    headerActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 10,
      gap: 5,
    },
    headerActionText: {
      fontSize: 12,
      fontWeight: '700',
    },
    tabsContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
      gap: 10,
    },
    tabButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 6,
    },
    activeTabButton: {
      backgroundColor: isDark ? '#0f172a' : '#ffffff',
      borderWidth: 1.5,
    },
    tabText: {
      fontSize: 13,
      fontWeight: '600',
    },
    activeTabText: {
      fontWeight: '800',
    },
    tabBadge: {
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 8,
      minWidth: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tabBadgeText: {
      fontSize: 11,
      fontWeight: '700',
    },
    clearAllBtn: {
      marginLeft: 'auto',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
    clearAllText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#ef4444',
    },
    loadingWrapper: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    listContent: {
      padding: 16,
      paddingBottom: 40,
    },
    emptyListContent: {
      flexGrow: 1,
      justifyContent: 'center',
    },
    notificationCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: colors.backgroundCard,
      borderRadius: 16,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border,
      position: 'relative',
      overflow: 'hidden',
    },
    unreadCard: {
      borderColor: accentColors.primary + '50',
      backgroundColor: isDark ? '#0b1626' : '#f0fdfa',
    },
    unreadBar: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      width: 4,
    },
    iconContainer: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    contentContainer: {
      flex: 1,
    },
    messageHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    targetTypeText: {
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    timeText: {
      fontSize: 11,
      fontWeight: '500',
    },
    messageText: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '500',
    },
    unreadMessageText: {
      fontWeight: '700',
    },
    actorText: {
      fontSize: 11,
      fontWeight: '500',
      marginTop: 4,
    },
    cardImageContainer: {
      width: '100%',
      height: 140,
      borderRadius: 10,
      overflow: 'hidden',
      marginTop: 8,
      position: 'relative',
      backgroundColor: '#00000015',
    },
    cardImage: {
      width: '100%',
      height: '100%',
    },
    cardImageExpandBtn: {
      position: 'absolute',
      bottom: 6,
      right: 6,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(0,0,0,0.65)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
    },
    cardImageExpandText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '600',
      marginLeft: 4,
    },
    deleteBtn: {
      padding: 6,
      marginLeft: 6,
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
      paddingVertical: 60,
    },
    emptyIconBg: {
      width: 80,
      height: 80,
      borderRadius: 40,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 18,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '800',
      marginBottom: 8,
      textAlign: 'center',
    },
    emptySubtitle: {
      fontSize: 13,
      lineHeight: 20,
      textAlign: 'center',
    },
  });
