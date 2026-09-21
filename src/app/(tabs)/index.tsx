import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Image,
  ImageBackground,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import { API_URL, graphqlRequest } from '../../services/api';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Sidebar from '../../components/Sidebar';
import { useAppTheme } from '../../context/ThemeContext';
import { getHeroBannerConfig } from '../../utils/heroImages';
import AttendanceTrendChart from '../../components/AttendanceTrendChart';
import { NotificationService, subscribeUnreadCount } from '../../services/notifications';

const DASHBOARD_QUERY = `
  query GetDashboardData {
    me {
      id
      firstName
      lastName
      email
      role
      profilePictureUrl
      department {
        name
      }
      designation {
        name
      }
      organization {
        id
        name
        accent
      }
      officeLocation {
        id
        name
        latitude
        longitude
        geoRadiusMeters
      }
    }
    myAttendance {
      id
      loginTime
      logoutTime
      isWithinGeofence
    }
    userDashboardStats {
      attendanceRate
      leaveBalances {
        name
        leaveType
        balance
        total
      }
      pendingRequestsCount
      daysPresent
      wishMessage
      last7Days {
        date
        dayStr
        status
      }
      recentActivities {
        id
        user
        action
        time
      }
      upcomingEvents {
        id
        user
        type
        date
        profilePicture
        daysUntil
      }
      aiInsights {
        title
        message
        type
        query
        path
        label
      }
      attendanceTrend {
        month
        value
      }
    }
  }
`;

interface UserLeaveBalance {
  name: string;
  leaveType: string;
  balance: number;
  total: number;
}

interface ActivityStat {
  id: string;
  user: string;
  action: string;
  time: string;
}

interface DayStatus {
  date: string;
  dayStr: string;
  status: string;
}

interface MonthlyStat {
  month: string;
  value: number;
}

interface UpcomingEvent {
  id: string;
  user: string;
  type: string; // birthday | anniversary | holiday | optional_holiday
  date: string;
  profilePicture?: string | null;
  daysUntil: number;
}

interface AIInsight {
  title: string;
  message: string;
  type: string;
  query: string;
  path?: string | null;
  label?: string | null;
}

interface UserDashboardStats {
  attendanceRate: number;
  leaveBalances: UserLeaveBalance[];
  pendingRequestsCount: number;
  daysPresent: number;
  recentActivities: ActivityStat[];
  last7Days: DayStatus[];
  attendanceTrend: MonthlyStat[];
  upcomingEvents: UpcomingEvent[];
  aiInsights: AIInsight[];
  wishMessage: string | null;
}

interface DashboardData {
  me: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    profilePictureUrl?: string | null;
    department?: { name: string } | null;
    designation?: { name: string } | null;
    organization?: {
      id: string;
      name: string;
      accent?: string | null;
    } | null;
    officeLocation?: {
      id: string;
      name: string;
      latitude: number;
      longitude: number;
      geoRadiusMeters: number;
    };
  };
  myAttendance: Array<{
    id: string;
    loginTime: string | null;
    logoutTime: string | null;
    isWithinGeofence: boolean;
  }>;
  userDashboardStats: UserDashboardStats;
}

function timeAgo(dateString?: string | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffInSeconds < 60) return 'Just now';
  const minutes = Math.floor(diffInSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getAbsoluteUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${API_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

const getFormattedDate = () => {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
};

const DAY_STATUS_MAP: Record<
  string,
  { label: string; dot: string; bg: string; icon: any }
> = {
  present: {
    label: 'Present',
    dot: '#10b981',
    bg: 'rgba(16, 185, 129, 0.12)',
    icon: 'checkmark-circle',
  },
  leave: {
    label: 'On leave',
    dot: '#f97316',
    bg: 'rgba(249, 115, 22, 0.12)',
    icon: 'airplane',
  },
  absent: {
    label: 'Absent',
    dot: '#ef4444',
    bg: 'rgba(239, 68, 68, 0.12)',
    icon: 'close-circle',
  },
  pending: {
    label: 'Pending',
    dot: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.12)',
    icon: 'time',
  },
  weekend: {
    label: 'Weekend',
    dot: '#94a3b8',
    bg: 'rgba(148, 163, 184, 0.15)',
    icon: 'calendar',
  },
  not_started: {
    label: 'Pending check-in',
    dot: '#cbd5e1',
    bg: 'rgba(203, 213, 225, 0.20)',
    icon: 'time-outline',
  },
};

// In-memory cache to eliminate loading flashes on tab switching
let cachedDashboardData: DashboardData | null = null;

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const router = useRouter();
  const { colors, accentColors, isDark, setThemeMode, setOrgAccent } = useAppTheme();
  const styles = useMemo(() => getStyles(colors, accentColors, isDark), [colors, accentColors, isDark]);

  const [data, setData] = useState<DashboardData | null>(cachedDashboardData);
  const [isLoading, setIsLoading] = useState<boolean>(!cachedDashboardData);
  const [refreshing, setRefreshing] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  const heroConfig = useMemo(() => getHeroBannerConfig(), []);

  useEffect(() => {
    const unsub = subscribeUnreadCount(setUnreadCount);
    NotificationService.fetchUnreadCount();
    return unsub;
  }, []);

  const fetchDashboardData = async () => {
    try {
      const response = await graphqlRequest<DashboardData>(DASHBOARD_QUERY);
      if (response && response.me === null) {
        signOut();
        return;
      }
      cachedDashboardData = response;
      setData(response);

      if (response?.me?.organization?.accent) {
        setOrgAccent(response.me.organization.accent);
      }
    } catch (error: any) {
      console.error('Error fetching dashboard:', error);
      const msg = error?.message?.toLowerCase() || '';
      if (
        msg.includes('session expired') ||
        msg.includes('not authenticated') ||
        msg.includes('unauthorized') ||
        msg.includes('permission denied') ||
        msg.includes('signature has expired')
      ) {
        signOut();
      } else {
        if (!cachedDashboardData) {
          Alert.alert('Error', 'Failed to fetch dashboard data. Please pull down to refresh.');
        }
      }
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
    NotificationService.fetchUnreadCount();
  };

  const getAttendanceStatus = () => {
    if (!data || !data.myAttendance || data.myAttendance.length === 0) {
      return { status: 'Not Checked In', color: '#ef4444', isPresent: false };
    }
    const today = data.myAttendance[0];
    if (today.loginTime && !today.logoutTime) {
      return { status: 'Checked In', color: '#10b981', isPresent: true };
    }
    if (today.loginTime && today.logoutTime) {
      return { status: 'Checked Out', color: accentColors.primary, isPresent: true };
    }
    return { status: 'Not Checked In', color: '#ef4444', isPresent: false };
  };

  if (isLoading && !data) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={accentColors.primary} />
      </View>
    );
  }

  const attendanceInfo = getAttendanceStatus();
  const stats = data?.userDashboardStats;
  const leaveBalances = stats?.leaveBalances || [];
  const last7Days = stats?.last7Days || [];
  const upcomingEvents = stats?.upcomingEvents || [];
  const recentActivities = stats?.recentActivities || [];

  const totalLeaveLeft = leaveBalances.reduce(
    (sum, b) => sum + (Number(b.balance) || 0),
    0
  );
  const primaryLeave = leaveBalances[0];
  const presentDays = last7Days.filter((d) => d.status === 'present').length;

  const todayDayAbbr = new Date().toLocaleDateString(undefined, { weekday: 'short' }).toLowerCase().slice(0, 2);

  const orgDesignationLine = [
    data?.me?.designation?.name,
    data?.me?.department?.name,
    data?.me?.organization?.name,
  ]
    .filter(Boolean)
    .join(' · ') || 'Workforce Platform';

  return (
    <SafeAreaView style={styles.safeContainer} edges={['right', 'left']}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={accentColors.primary}
          />
        }
      >
        {/* ── 1. PRODUCTION HERO BANNER ── */}
        <View style={styles.heroWrapper}>
          <ImageBackground
            source={heroConfig.imageSource}
            style={styles.heroBackground}
            imageStyle={styles.heroImage}
            resizeMode="cover"
            fadeDuration={0}
          >
            <LinearGradient
              colors={
                heroConfig.dark
                  ? ['rgba(15, 12, 30, 0.90)', 'rgba(22, 18, 42, 0.50)', 'rgba(22, 18, 42, 0.96)']
                  : isDark
                  ? ['rgba(15, 23, 42, 0.94)', 'rgba(15, 23, 42, 0.58)', 'rgba(15, 23, 42, 0.96)']
                  : ['rgba(232, 238, 244, 0.95)', 'rgba(232, 238, 244, 0.65)', 'rgba(232, 238, 244, 0.95)']
              }
              style={[
                styles.heroGradient,
                { paddingTop: Math.max(insets.top + 8, Platform.OS === 'ios' ? 52 : 36) },
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
            >
              {/* Header Navigation Bar */}
              <View style={styles.header}>
                <TouchableOpacity
                  style={[
                    styles.headerIconBtn,
                    {
                      backgroundColor: heroConfig.dark || isDark
                        ? 'rgba(255, 255, 255, 0.16)'
                        : 'rgba(255, 255, 255, 0.85)',
                    },
                  ]}
                  onPress={() => setIsSidebarOpen(true)}
                  accessibilityLabel="Open menu"
                >
                  <Ionicons
                    name="menu"
                    size={22}
                    color={heroConfig.dark || isDark ? '#ffffff' : '#0f172a'}
                  />
                </TouchableOpacity>

                <View style={styles.headerActions}>
                  {/* Notifications */}
                  <TouchableOpacity
                    style={[
                      styles.headerIconBtn,
                      {
                        backgroundColor: heroConfig.dark || isDark
                          ? 'rgba(255, 255, 255, 0.16)'
                          : 'rgba(255, 255, 255, 0.85)',
                      },
                    ]}
                    activeOpacity={0.75}
                    onPress={() => router.push('/notifications')}
                    accessibilityLabel="View Notifications"
                  >
                    <Ionicons
                      name={unreadCount > 0 ? 'notifications' : 'notifications-outline'}
                      size={18}
                      color={heroConfig.dark || isDark ? '#ffffff' : '#0f172a'}
                    />
                    {unreadCount > 0 && (
                      <View style={styles.heroNotifBadge}>
                        <Text style={styles.heroNotifBadgeText}>
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  {/* Dark/Light Mode toggle */}
                  <TouchableOpacity
                    style={[
                      styles.headerIconBtn,
                      {
                        backgroundColor: heroConfig.dark || isDark
                          ? 'rgba(255, 255, 255, 0.16)'
                          : 'rgba(255, 255, 255, 0.85)',
                      },
                    ]}
                    activeOpacity={0.75}
                    onPress={() => setThemeMode(isDark ? 'light' : 'dark')}
                    accessibilityLabel="Toggle Theme"
                  >
                    <Ionicons
                      name={isDark ? 'sunny' : 'moon'}
                      size={18}
                      color={isDark ? '#f59e0b' : '#3b82f6'}
                    />
                  </TouchableOpacity>

                  {/* Profile Avatar */}
                  <TouchableOpacity style={styles.avatarBtn} onPress={() => router.push('/profile')}>
                    {data?.me?.profilePictureUrl ? (
                      <Image
                        source={{ uri: getAbsoluteUrl(data.me.profilePictureUrl)! }}
                        style={styles.headerAvatar}
                        fadeDuration={0}
                      />
                    ) : (
                      <View style={[styles.headerAvatarPlaceholder, { backgroundColor: accentColors.primary }]}>
                        <Text style={styles.headerAvatarText}>
                          {((data?.me?.firstName?.charAt(0) || '') + (data?.me?.lastName?.charAt(0) || '')).toUpperCase() || 'EE'}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Banner Info */}
              <View style={styles.heroTextContainer}>
                <Text
                  style={[
                    styles.dateText,
                    { color: heroConfig.dark || isDark ? 'rgba(255, 255, 255, 0.75)' : '#475569' },
                  ]}
                >
                  {getFormattedDate()}
                </Text>

                <Text
                  style={[
                    styles.greetingText,
                    { color: heroConfig.dark || isDark ? '#ffffff' : '#0f172a' },
                  ]}
                >
                  {heroConfig.greeting},{' '}
                  <Text style={{ color: accentColors.primary }}>
                    {data?.me?.firstName || 'there'}
                  </Text>
                </Text>

                <Text
                  style={[
                    styles.subtitleText,
                    { color: heroConfig.dark || isDark ? 'rgba(255, 255, 255, 0.70)' : '#64748b' },
                  ]}
                  numberOfLines={1}
                >
                  {orgDesignationLine}
                </Text>

                {/* Status Pill */}
                <View
                  style={[
                    styles.statusPill,
                    {
                      backgroundColor: heroConfig.dark || isDark
                        ? 'rgba(255, 255, 255, 0.14)'
                        : 'rgba(255, 255, 255, 0.90)',
                      borderColor: heroConfig.dark || isDark
                        ? 'rgba(255, 255, 255, 0.22)'
                        : 'rgba(203, 213, 225, 0.90)',
                    },
                  ]}
                >
                  <View style={[styles.statusDot, { backgroundColor: attendanceInfo.color }]} />
                  <Text
                    style={[
                      styles.statusPillText,
                      { color: heroConfig.dark || isDark ? '#ffffff' : '#1e293b' },
                    ]}
                  >
                    Today · {attendanceInfo.status}
                  </Text>
                </View>

                {/* Action Buttons */}
                <View style={styles.heroActionsRow}>
                  <TouchableOpacity
                    style={[
                      styles.heroPrimaryBtn,
                      { backgroundColor: heroConfig.dark || isDark ? '#ffffff' : '#0f172a' },
                    ]}
                    onPress={() => router.push('/attendance')}
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name="location-sharp"
                      size={16}
                      color={heroConfig.dark || isDark ? '#0f172a' : '#ffffff'}
                    />
                    <Text
                      style={[
                        styles.heroPrimaryBtnText,
                        { color: heroConfig.dark || isDark ? '#0f172a' : '#ffffff' },
                      ]}
                    >
                      {attendanceInfo.isPresent ? 'Open Attendance' : 'Check In'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.heroSecondaryBtn,
                      {
                        backgroundColor: heroConfig.dark || isDark
                          ? 'rgba(255, 255, 255, 0.14)'
                          : 'rgba(255, 255, 255, 0.85)',
                        borderColor: heroConfig.dark || isDark
                          ? 'rgba(255, 255, 255, 0.25)'
                          : '#cbd5e1',
                      },
                    ]}
                    onPress={() => router.push('/leave')}
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name="add"
                      size={18}
                      color={heroConfig.dark || isDark ? '#ffffff' : '#0f172a'}
                    />
                    <Text
                      style={[
                        styles.heroSecondaryBtnText,
                        { color: heroConfig.dark || isDark ? '#ffffff' : '#0f172a' },
                      ]}
                    >
                      Request Leave
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </LinearGradient>
          </ImageBackground>
        </View>

        {/* ── 2. CELEBRATION / WISH BANNER (IF ANY) ── */}
        {stats?.wishMessage ? (
          <View style={styles.celebrationBanner}>
            <View style={styles.celebrationIconBg}>
              <Ionicons
                name={stats.wishMessage.toLowerCase().includes('birthday') ? 'gift' : 'sparkles'}
                size={22}
                color="#ffffff"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.celebrationTitle}>Celebration!</Text>
              <Text style={styles.celebrationMessage}>{stats.wishMessage}</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.contentPadding}>
          {/* ── 3. BENTO CARD 1: LEAVE AVAILABLE (MATCHING WEB) ── */}
          <View style={styles.bentoCard}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardTitleGroup}>
                <View style={[styles.accentPill, { backgroundColor: accentColors.primary }]} />
                <Text style={styles.cardTitle}>Leave available</Text>
              </View>
              <TouchableOpacity
                style={styles.cardLinkIcon}
                onPress={() => router.push('/leave')}
                accessibilityLabel="View leaves"
              >
                <Ionicons name="arrow-forward" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.leaveBigCountRow}>
              <Text style={styles.leaveBigNumber}>{totalLeaveLeft}</Text>
              <Text style={styles.leaveBigUnit}>days available</Text>
            </View>

            {/* Progress bars per leave category */}
            <View style={styles.leaveBarsContainer}>
              {leaveBalances.length > 0 ? (
                leaveBalances.slice(0, 3).map((balance, index) => {
                  const pct =
                    balance.total > 0
                      ? Math.min(100, Math.round((balance.balance / balance.total) * 100))
                      : 0;
                  return (
                    <View key={`${balance.name}-${index}`} style={styles.leaveBarItem}>
                      <View style={styles.leaveBarLabels}>
                        <Text style={styles.leaveBarName} numberOfLines={1}>
                          {balance.name}
                        </Text>
                        <Text style={styles.leaveBarFraction}>
                          <Text style={{ fontWeight: '700', color: colors.text }}>
                            {balance.balance}
                          </Text>
                          /{balance.total}
                        </Text>
                      </View>
                      <View style={styles.leaveBarTrack}>
                        <View
                          style={[
                            styles.leaveBarFill,
                            {
                              width: `${pct}%`,
                              backgroundColor: accentColors.primary,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  );
                })
              ) : (
                <Text style={styles.emptyText}>No leave balances configured yet</Text>
              )}

              {(stats?.pendingRequestsCount ?? 0) > 0 && (
                <TouchableOpacity
                  style={styles.pendingLeavePill}
                  onPress={() => router.push('/leave')}
                >
                  <View style={styles.pendingDot} />
                  <Text style={styles.pendingLeaveText}>
                    Pending approval requests
                  </Text>
                  <Text style={styles.pendingLeaveCount}>
                    {stats?.pendingRequestsCount}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* ── 4. BENTO CARD 2: THIS WEEK (7-DAY STRIP MATCHING WEB) ── */}
          <View style={styles.bentoCard}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardTitleGroup}>
                <View style={[styles.accentPill, { backgroundColor: accentColors.primary }]} />
                <View>
                  <Text style={styles.cardTitle}>This week</Text>
                  <Text style={styles.cardSubtitle}>
                    <Text style={{ fontWeight: '700', color: colors.text }}>
                      {presentDays}
                    </Text>{' '}
                    of {last7Days.length || 7} days present
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => router.push('/attendance')}>
                <Text style={[styles.headerLinkText, { color: accentColors.primary }]}>
                  Details
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.weekListContainer}>
              {last7Days.length > 0 ? (
                last7Days.map((d, index) => {
                  const meta = DAY_STATUS_MAP[d.status] || DAY_STATUS_MAP.not_started;
                  const isToday = (d.dayStr || '')
                    .toLowerCase()
                    .startsWith(todayDayAbbr);

                  return (
                    <TouchableOpacity
                      key={`${d.date}-${index}`}
                      style={[
                        styles.weekRow,
                        isToday && {
                          backgroundColor: isDark
                            ? 'rgba(59, 130, 246, 0.12)'
                            : 'rgba(59, 130, 246, 0.05)',
                        },
                      ]}
                      onPress={() => router.push('/attendance')}
                      activeOpacity={0.7}
                    >
                      {/* Left: Day & Date */}
                      <View style={styles.weekDayCol}>
                        <Text
                          style={[
                            styles.weekDayName,
                            isToday && { color: accentColors.primary, fontWeight: '800' },
                          ]}
                        >
                          {d.dayStr}
                        </Text>
                        <Text style={styles.weekDateSub}>{d.date}</Text>
                      </View>

                      {/* Middle: Dot & Status Label */}
                      <View style={styles.weekStatusCol}>
                        <View style={[styles.weekStatusDot, { backgroundColor: meta.dot }]} />
                        <Text style={styles.weekStatusLabel} numberOfLines={1}>
                          {meta.label}
                        </Text>
                        {isToday && (
                          <View
                            style={[
                              styles.todayPillBadge,
                              { backgroundColor: accentColors.light },
                            ]}
                          >
                            <Text
                              style={[
                                styles.todayPillBadgeText,
                                { color: accentColors.primary },
                              ]}
                            >
                              Today
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* Right: Icon Pill */}
                      <View style={[styles.weekIconPill, { backgroundColor: meta.bg }]}>
                        <Ionicons name={meta.icon} size={15} color={meta.dot} />
                      </View>
                    </TouchableOpacity>
                  );
                })
              ) : (
                <Text style={styles.emptyText}>No weekly attendance recorded yet</Text>
              )}
            </View>
          </View>

          {/* ── 5. BENTO CARD 3: KEY METRICS STACK (3 PRODUCTION TILES) ── */}
          <View style={styles.metricsRow}>
            {/* Tile 1: Attendance Rate */}
            <TouchableOpacity
              style={styles.metricTile}
              onPress={() => router.push('/attendance')}
              activeOpacity={0.8}
            >
              <View style={styles.metricIconRow}>
                <Ionicons name="trending-up" size={18} color={accentColors.primary} />
                <Ionicons name="arrow-forward" size={13} color={colors.textSecondary} />
              </View>
              <Text style={styles.metricValue}>
                {stats?.attendanceRate !== undefined ? `${stats.attendanceRate}%` : '0%'}
              </Text>
              <Text style={styles.metricLabel}>Attendance</Text>
              <Text style={styles.metricHint}>Overall rate</Text>
            </TouchableOpacity>

            {/* Tile 2: Days Present */}
            <TouchableOpacity
              style={styles.metricTile}
              onPress={() => router.push('/attendance')}
              activeOpacity={0.8}
            >
              <View style={styles.metricIconRow}>
                <Ionicons name="checkmark-circle" size={18} color="#10b981" />
                <Ionicons name="arrow-forward" size={13} color={colors.textSecondary} />
              </View>
              <Text style={styles.metricValue}>{stats?.daysPresent || 0}</Text>
              <Text style={styles.metricLabel}>Days present</Text>
              <Text style={styles.metricHint}>This cycle</Text>
            </TouchableOpacity>

            {/* Tile 3: Primary Leave */}
            <TouchableOpacity
              style={styles.metricTile}
              onPress={() => router.push('/leave')}
              activeOpacity={0.8}
            >
              <View style={styles.metricIconRow}>
                <Ionicons name="calendar" size={18} color="#f59e0b" />
                <Ionicons name="arrow-forward" size={13} color={colors.textSecondary} />
              </View>
              <Text style={styles.metricValue}>{primaryLeave?.balance ?? 0}</Text>
              <Text style={styles.metricLabel}>Primary leave</Text>
              <Text style={styles.metricHint} numberOfLines={1}>
                {primaryLeave?.name || 'Balance'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── 6. PRODUCTION ENTERPRISE SERVICES GRID (2x3) ── */}
          <View style={styles.bentoCard}>
            <View style={styles.cardHeaderRow}>
              <View style={styles.cardTitleGroup}>
                <View style={[styles.accentPill, { backgroundColor: accentColors.primary }]} />
                <Text style={styles.cardTitle}>Quick Services</Text>
              </View>
            </View>

            <View style={styles.servicesGrid}>
              {/* 1. Clock In */}
              <TouchableOpacity
                style={styles.serviceItem}
                onPress={() => router.push('/attendance')}
                activeOpacity={0.75}
              >
                <View style={[styles.serviceIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                  <Ionicons name="time" size={20} color="#10b981" />
                </View>
                <View style={styles.serviceMeta}>
                  <Text style={styles.serviceTitle}>Attendance</Text>
                  <Text style={styles.serviceSub}>Clock in & out</Text>
                </View>
              </TouchableOpacity>

              {/* 2. Leaves */}
              <TouchableOpacity
                style={styles.serviceItem}
                onPress={() => router.push('/leave')}
                activeOpacity={0.75}
              >
                <View style={[styles.serviceIconBox, { backgroundColor: 'rgba(59, 130, 246, 0.12)' }]}>
                  <Ionicons name="calendar" size={20} color="#3b82f6" />
                </View>
                <View style={styles.serviceMeta}>
                  <Text style={styles.serviceTitle}>Leave Portal</Text>
                  <Text style={styles.serviceSub}>Apply & track</Text>
                </View>
              </TouchableOpacity>

              {/* 3. Documents Vault (NEW!) */}
              <TouchableOpacity
                style={styles.serviceItem}
                onPress={() => router.push('/documents')}
                activeOpacity={0.75}
              >
                <View style={[styles.serviceIconBox, { backgroundColor: 'rgba(139, 92, 246, 0.12)' }]}>
                  <Ionicons name="folder" size={20} color="#8b5cf6" />
                </View>
                <View style={styles.serviceMeta}>
                  <Text style={styles.serviceTitle}>Documents</Text>
                  <Text style={styles.serviceSub}>Form 16 & vault</Text>
                </View>
              </TouchableOpacity>

              {/* 4. Payslips */}
              <TouchableOpacity
                style={styles.serviceItem}
                onPress={() => router.push('/payroll')}
                activeOpacity={0.75}
              >
                <View style={[styles.serviceIconBox, { backgroundColor: 'rgba(245, 158, 11, 0.12)' }]}>
                  <Ionicons name="receipt" size={20} color="#f59e0b" />
                </View>
                <View style={styles.serviceMeta}>
                  <Text style={styles.serviceTitle}>Payslips</Text>
                  <Text style={styles.serviceSub}>Slips & taxes</Text>
                </View>
              </TouchableOpacity>

            </View>
          </View>

          {/* ── 7. ATTENDANCE TREND CHART ── */}
          <AttendanceTrendChart
            data={stats?.attendanceTrend || []}
            currentRate={stats?.attendanceRate}
          />

          {/* ── 8. TEAM MOMENTS & CELEBRATIONS ── */}
          {upcomingEvents.length > 0 && (
            <View style={styles.bentoCard}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.cardTitleGroup}>
                  <View style={[styles.accentPill, { backgroundColor: accentColors.primary }]} />
                  <Text style={styles.cardTitle}>Team moments</Text>
                </View>
                <Text style={styles.monthBadge}>
                  {new Date().toLocaleDateString(undefined, { month: 'short', year: '2-digit' })}
                </Text>
              </View>

              <View style={styles.teamMomentsList}>
                {upcomingEvents.slice(0, 5).map((event) => {
                  const avatarUri = getAbsoluteUrl(event.profilePicture);
                  const isBirthday = event.type === 'birthday';
                  const isAnniversary = event.type === 'anniversary';
                  const isHoliday = event.type === 'holiday' || event.type === 'optional_holiday';

                  const typeLabel = isBirthday
                    ? 'Birthday'
                    : isAnniversary
                    ? 'Anniversary'
                    : event.type === 'optional_holiday'
                    ? 'Optional Holiday'
                    : 'Holiday';

                  const typeColor = isBirthday
                    ? '#f59e0b'
                    : isHoliday
                    ? '#10b981'
                    : '#3b82f6';

                  return (
                    <View key={event.id} style={styles.teamMomentItem}>
                      {avatarUri ? (
                        <Image source={{ uri: avatarUri }} style={styles.eventAvatar} />
                      ) : (
                        <View style={[styles.eventAvatarFallback, { backgroundColor: `${typeColor}20` }]}>
                          <Ionicons
                            name={isBirthday ? 'gift' : isHoliday ? 'calendar' : 'ribbon'}
                            size={16}
                            color={typeColor}
                          />
                        </View>
                      )}

                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.eventUserName} numberOfLines={1}>
                          {event.user}
                        </Text>
                        <Text style={styles.eventTypeDate}>
                          <Text style={{ color: typeColor, fontWeight: '600' }}>{typeLabel}</Text> ·{' '}
                          {new Date(event.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </Text>
                      </View>

                      <View
                        style={[
                          styles.eventDaysBadge,
                          event.daysUntil === 0 && { backgroundColor: 'rgba(239, 68, 68, 0.12)' },
                        ]}
                      >
                        <Text
                          style={[
                            styles.eventDaysBadgeText,
                            event.daysUntil === 0 && { color: '#ef4444', fontWeight: '700' },
                          ]}
                        >
                          {event.daysUntil === 0 ? 'Today' : `in ${event.daysUntil}d`}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* ── 9. RECENT ACTIVITY FEED ── */}
          {recentActivities.length > 0 && (
            <View style={styles.bentoCard}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.cardTitleGroup}>
                  <View style={[styles.accentPill, { backgroundColor: accentColors.primary }]} />
                  <Text style={styles.cardTitle}>Recent Activity</Text>
                </View>
                <TouchableOpacity onPress={() => router.push('/notifications')}>
                  <Text style={[styles.headerLinkText, { color: accentColors.primary }]}>
                    All updates
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.activityList}>
                {recentActivities.slice(0, 5).map((activity) => {
                  const actionLower = (activity.action || '').toLowerCase();
                  const isLeave = actionLower.includes('leave');
                  const isMilestone = actionLower.includes('anniversary') || actionLower.includes('birthday');

                  return (
                    <View key={activity.id} style={styles.activityItem}>
                      <View
                        style={[
                          styles.activityIconBox,
                          {
                            backgroundColor: isLeave
                              ? 'rgba(59, 130, 246, 0.12)'
                              : isMilestone
                              ? 'rgba(245, 158, 11, 0.12)'
                              : 'rgba(16, 185, 129, 0.12)',
                          },
                        ]}
                      >
                        <Ionicons
                          name={isLeave ? 'calendar' : isMilestone ? 'sparkles' : 'checkmark-circle'}
                          size={15}
                          color={isLeave ? '#3b82f6' : isMilestone ? '#f59e0b' : '#10b981'}
                        />
                      </View>

                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.activityText} numberOfLines={2}>
                          <Text style={{ fontWeight: '700', color: colors.text }}>
                            {activity.user ? `${activity.user} ` : ''}
                          </Text>
                          {activity.action}
                        </Text>
                        <Text style={styles.activityTime}>{timeAgo(activity.time)}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* ── 10. AI INSIGHT / NEXT BEST ACTION ── */}
          {stats?.aiInsights && stats.aiInsights.length > 0 && (
            <LinearGradient
              colors={['#7c3aed', '#5b21b6']}
              style={styles.aiInsightCard}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.aiInsightHeader}>
                <View style={styles.aiInsightSparkle}>
                  <Ionicons name="sparkles" size={14} color="#ffffff" />
                </View>
                <Text style={styles.aiInsightCategory}>AI Workplace Insight</Text>
              </View>

              <Text style={styles.aiInsightTitle}>
                {stats.aiInsights[0]?.title || 'Next Step Recommended'}
              </Text>
              <Text style={styles.aiInsightBody}>
                {stats.aiInsights[0]?.message}
              </Text>

              <TouchableOpacity
                style={styles.aiInsightActionBtn}
                onPress={() => router.push('/chat')}
                activeOpacity={0.9}
              >
                <Text style={styles.aiInsightActionBtnText}>Ask Workplace Assistant</Text>
                <Ionicons name="arrow-forward" size={14} color="#7c3aed" />
              </TouchableOpacity>
            </LinearGradient>
          )}
        </View>
      </ScrollView>

      {/* ── Floating AI Chat Action Button ── */}
      <TouchableOpacity
        style={[
          styles.floatingAiBtn,
          { bottom: Math.max(insets.bottom + 16, 24) },
        ]}
        activeOpacity={0.88}
        onPress={() => router.push('/chat')}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel="Ask AI Assistant"
      >
        <LinearGradient
          colors={['#e0f2fe', '#bae6fd']}
          style={styles.floatingAiGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={styles.floatingAiIconBg}>
              <Image
                source={require('../../../assets/images/assistant-mark.webp')}
                style={{ width: 18, height: 18, resizeMode: 'contain', borderRadius: 4 }}
                fadeDuration={0}
              />
            </View>
            <Text style={styles.floatingAiText}>Ask AI Assistant</Text>
          </View>
          <View style={styles.floatingAiPulseDot} />
        </LinearGradient>
      </TouchableOpacity>

      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
    </SafeAreaView>
  );
}

const getStyles = (colors: any, accentColors: any, isDark: boolean) =>
  StyleSheet.create({
    safeContainer: {
      flex: 1,
      backgroundColor: colors.background,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    container: {
      paddingBottom: 110,
    },
    heroWrapper: {
      overflow: 'hidden',
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.4 : 0.08,
      shadowRadius: 8,
      elevation: 4,
    },
    heroBackground: {
      width: '100%',
    },
    heroImage: {
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
    },
    heroGradient: {
      paddingHorizontal: 20,
      paddingBottom: 24,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    headerIconBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.18)',
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    heroNotifBadge: {
      position: 'absolute',
      top: -4,
      right: -4,
      backgroundColor: '#ef4444',
      borderRadius: 10,
      minWidth: 18,
      height: 18,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    heroNotifBadgeText: {
      color: '#ffffff',
      fontSize: 10,
      fontWeight: '800',
    },
    avatarBtn: {
      borderRadius: 14,
    },
    headerAvatar: {
      width: 40,
      height: 40,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: '#ffffff',
    },
    headerAvatarPlaceholder: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: '#ffffff',
    },
    headerAvatarText: {
      color: '#ffffff',
      fontSize: 14,
      fontWeight: '700',
    },
    heroTextContainer: {
      marginTop: 6,
    },
    dateText: {
      fontSize: 13,
      fontWeight: '600',
      letterSpacing: 0.3,
      marginBottom: 4,
    },
    greetingText: {
      fontSize: 26,
      fontWeight: '800',
      letterSpacing: -0.6,
      lineHeight: 32,
    },
    subtitleText: {
      fontSize: 13,
      fontWeight: '500',
      marginTop: 4,
    },
    statusPill: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      borderWidth: 1,
      marginTop: 14,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    statusPillText: {
      fontSize: 12,
      fontWeight: '600',
    },
    heroActionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 18,
    },
    heroPrimaryBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      height: 44,
      borderRadius: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 3,
      elevation: 2,
    },
    heroPrimaryBtnText: {
      fontSize: 13,
      fontWeight: '700',
    },
    heroSecondaryBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      height: 44,
      borderRadius: 12,
      borderWidth: 1,
    },
    heroSecondaryBtnText: {
      fontSize: 13,
      fontWeight: '600',
    },
    celebrationBanner: {
      marginHorizontal: 16,
      marginTop: 14,
      backgroundColor: '#7c3aed',
      borderRadius: 16,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      shadowColor: '#7c3aed',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.25,
      shadowRadius: 6,
      elevation: 3,
    },
    celebrationIconBg: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: 'rgba(255, 255, 255, 0.22)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    celebrationTitle: {
      color: '#ffffff',
      fontSize: 15,
      fontWeight: '800',
    },
    celebrationMessage: {
      color: 'rgba(255, 255, 255, 0.92)',
      fontSize: 12,
      lineHeight: 17,
      marginTop: 2,
    },
    contentPadding: {
      paddingHorizontal: 16,
      paddingTop: 16,
      gap: 16,
    },
    bentoCard: {
      backgroundColor: colors.backgroundCard,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 18,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.25 : 0.04,
      shadowRadius: 4,
      elevation: 1,
    },
    cardHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    cardTitleGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    accentPill: {
      width: 4,
      height: 18,
      borderRadius: 2,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: -0.3,
    },
    cardSubtitle: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 1,
    },
    cardLinkIcon: {
      padding: 4,
    },
    headerLinkText: {
      fontSize: 13,
      fontWeight: '600',
    },
    monthBadge: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    leaveBigCountRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 6,
      marginBottom: 16,
    },
    leaveBigNumber: {
      fontSize: 40,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: -1,
    },
    leaveBigUnit: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    leaveBarsContainer: {
      gap: 12,
    },
    leaveBarItem: {
      gap: 5,
    },
    leaveBarLabels: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    leaveBarName: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.textSecondary,
      flex: 1,
    },
    leaveBarFraction: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    leaveBarTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0',
      overflow: 'hidden',
    },
    leaveBarFill: {
      height: '100%',
      borderRadius: 3,
    },
    pendingLeavePill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : '#fffbeb',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      marginTop: 4,
      gap: 8,
    },
    pendingDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#f59e0b',
    },
    pendingLeaveText: {
      flex: 1,
      fontSize: 12,
      fontWeight: '600',
      color: '#d97706',
    },
    pendingLeaveCount: {
      fontSize: 13,
      fontWeight: '800',
      color: '#d97706',
    },
    weekListContainer: {
      gap: 2,
    },
    weekRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 9,
      paddingHorizontal: 8,
      borderRadius: 10,
    },
    weekDayCol: {
      width: 58,
    },
    weekDayName: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
    },
    weekDateSub: {
      fontSize: 10,
      color: colors.textSecondary,
      marginTop: 1,
    },
    weekStatusCol: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },
    weekStatusDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
    },
    weekStatusLabel: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    todayPillBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
    },
    todayPillBadgeText: {
      fontSize: 10,
      fontWeight: '700',
    },
    weekIconPill: {
      width: 28,
      height: 28,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    metricsRow: {
      flexDirection: 'row',
      gap: 10,
    },
    metricTile: {
      flex: 1,
      backgroundColor: colors.backgroundCard,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0.2 : 0.04,
      shadowRadius: 3,
      elevation: 1,
    },
    metricIconRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    metricValue: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: -0.5,
    },
    metricLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text,
      marginTop: 2,
    },
    metricHint: {
      fontSize: 10,
      color: colors.textSecondary,
      marginTop: 2,
    },
    servicesGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    serviceItem: {
      width: '48%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 12,
      borderRadius: 14,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
      borderWidth: 1,
      borderColor: colors.border,
    },
    serviceIconBox: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    serviceMeta: {
      flex: 1,
    },
    serviceTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
    },
    serviceSub: {
      fontSize: 10,
      color: colors.textSecondary,
      marginTop: 1,
    },
    teamMomentsList: {
      gap: 10,
    },
    teamMomentItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 6,
    },
    eventAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
    },
    eventAvatarFallback: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    eventUserName: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    eventTypeDate: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 1,
    },
    eventDaysBadge: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    eventDaysBadgeText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    activityList: {
      gap: 12,
    },
    activityItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    activityIconBox: {
      width: 30,
      height: 30,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    activityText: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.textSecondary,
    },
    activityTime: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 3,
    },
    aiInsightCard: {
      borderRadius: 20,
      padding: 18,
      shadowColor: '#7c3aed',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 3,
    },
    aiInsightHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 6,
    },
    aiInsightSparkle: {
      width: 22,
      height: 22,
      borderRadius: 6,
      backgroundColor: 'rgba(255, 255, 255, 0.25)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    aiInsightCategory: {
      fontSize: 11,
      fontWeight: '700',
      color: 'rgba(255, 255, 255, 0.85)',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    aiInsightTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: '#ffffff',
      marginBottom: 6,
    },
    aiInsightBody: {
      fontSize: 13,
      lineHeight: 19,
      color: 'rgba(255, 255, 255, 0.90)',
    },
    aiInsightActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: '#ffffff',
      borderRadius: 12,
      height: 40,
      marginTop: 14,
    },
    aiInsightActionBtnText: {
      color: '#7c3aed',
      fontSize: 13,
      fontWeight: '700',
    },
    emptyText: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingVertical: 12,
    },
    floatingAiBtn: {
      position: 'absolute',
      right: 20,
      borderRadius: 28,
      shadowColor: '#7dd3fc',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.4,
      shadowRadius: 10,
      elevation: 8,
      zIndex: 999,
    },
    floatingAiGradient: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 28,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.5)',
    },
    floatingAiIconBg: {
      width: 18,
      height: 18,
      borderRadius: 14,
      backgroundColor: 'rgba(255, 255, 255, 0.7)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    floatingAiText: {
      color: '#0369a1',
      fontSize: 15,
      fontWeight: '700',
      letterSpacing: 0.2,
    },
    floatingAiPulseDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#0284c7',
    },
  });
