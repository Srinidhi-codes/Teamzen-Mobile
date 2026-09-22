import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Animated,
  Dimensions,
  ScrollView,
  Platform,
  Alert,
  Modal,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { useAppTheme } from '../context/ThemeContext';
import { NotificationService, subscribeUnreadCount } from '../services/notifications';
import { OnboardingStorage } from '../utils/onboardingStorage';
import { graphqlRequest } from '../services/api';
import BrandLogo from './BrandLogo';
import { useTour } from '../context/TourContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window') || { width: 375 };
const SIDEBAR_WIDTH = 280;

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { signOut } = useAuth();
  const { isDark, colors, accentColors } = useAppTheme();
  const { startTour } = useTour();
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [hasActiveOnboarding, setHasActiveOnboarding] = React.useState(false);
  const [hasSeenAppTour, setHasSeenAppTour] = React.useState(false);
  
  const insets = useSafeAreaInsets();
  const [modalVisible, setModalVisible] = React.useState(isOpen);

  // Animation values
  const slideAnim = useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const unsub = subscribeUnreadCount(setUnreadCount);
    NotificationService.fetchUnreadCount();
    return unsub;
  }, []);

  useEffect(() => {
    if (isOpen) {
      // Check onboarding tour and HR status
      OnboardingStorage.hasSeenOnboarding().then((seen) => setHasSeenAppTour(seen));
      graphqlRequest<{ myOnboarding?: { id?: string; status?: string; progressPct?: number } }>(
        `query CheckOnboarding { myOnboarding { id status progressPct } }`
      ).then((res) => {
        const ob = res?.myOnboarding;
        const status = (ob?.status || '').toLowerCase();
        const pct = ob?.progressPct ?? 0;
        // Only show if onboarding exists, is NOT completed, and progress is < 100%
        if (ob && ob.id && status !== 'completed' && pct < 100) {
          setHasActiveOnboarding(true);
        } else {
          setHasActiveOnboarding(false);
        }
      }).catch(() => {
        setHasActiveOnboarding(false);
      });
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setModalVisible(true);
      slideAnim.setValue(-SIDEBAR_WIDTH);
      fadeAnim.setValue(0);
      NotificationService.fetchUnreadCount();

      // Slide In & Fade In
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 280,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (modalVisible) {
      // Slide Out & Fade Out smoothly, then unmount modal
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -SIDEBAR_WIDTH,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setModalVisible(false);
      });
    }
  }, [isOpen]);

  const handleNavigate = (path: string, isWebOnly = false) => {
    onClose();
    if (isWebOnly) {
      Alert.alert(
        'Web Only Portal', 
        'This module contains administrative panels and is optimized for desktop web screens. Please log in from your computer to access.'
      );
      return;
    }
    
    // Slight delay to allow drawer closing animation to finish
    setTimeout(() => {
      router.push(path as any);
    }, 240);
  };

  // Nav Item helper
  const renderNavItem = (
    icon: any,
    label: string,
    targetPath: string,
    activePaths: string[],
    isWebOnly = false,
    badge?: number | string | null,
    customIcon?: React.ReactNode
  ) => {
    const isActive = activePaths.some(p => pathname === p || pathname.startsWith(p + '/'));
    return (
      <TouchableOpacity
        style={[
          styles.navItem, 
          isActive && { backgroundColor: accentColors.light }
        ]}
        onPress={() => handleNavigate(targetPath, isWebOnly)}
      >
        {customIcon ? (
          customIcon
        ) : (
          <Ionicons 
            name={icon} 
            size={20} 
            color={isActive ? accentColors.primary : colors.textSecondary} 
            style={styles.navIcon}
          />
        )}
        <Text 
          style={[
            styles.navLabel, 
            { color: colors.textSecondary }, 
            isActive && { color: accentColors.primary }
          ]}
        >
          {label}
        </Text>
        {badge !== undefined && badge !== null && Number(badge) > 0 && (
          <View style={[styles.badgeContainer, { backgroundColor: '#ef4444' }]}>
            <Text style={styles.badgeText}>{Number(badge) > 99 ? '99+' : badge}</Text>
          </View>
        )}
        {isActive && <View style={[styles.activeDot, { backgroundColor: accentColors.primary }]} />}
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.modalRoot}>
        {/* Backdrop overlay */}
        <Animated.View 
          style={[styles.backdrop, { opacity: fadeAnim }]}
          pointerEvents={isOpen ? 'auto' : 'none'}
        >
          <TouchableOpacity style={styles.backdropPressable} activeOpacity={1} onPress={onClose} />
        </Animated.View>

        {/* Sidebar Panel */}
        <Animated.View
          style={[
            styles.sidebarPanel,
            {
              transform: [{ translateX: slideAnim }],
              backgroundColor: colors.background,
              borderRightColor: colors.border,
              paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 52 : 36),
            },
          ]}
        >
        {/* Header */}
        <View style={[styles.sidebarHeader, { borderBottomColor: colors.border }]}>
          <BrandLogo size={28} subtitle="Workforce Platform" />
        </View>

        {/* Scrollable Navigation */}
        <ScrollView style={styles.sidebarBody} contentContainerStyle={styles.sidebarBodyContent}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Core Navigation</Text>
          {renderNavItem('home-outline', 'Dashboard', '/(tabs)', ['/(tabs)', '/index'])}
          {renderNavItem('time-outline', 'Attendance', '/attendance', ['/attendance'])}
          {renderNavItem('calendar-outline', 'Leaves', '/leave', ['/leave'])}
          {renderNavItem('people-outline', 'My Team', '/team', ['/team'])}
          {renderNavItem('folder-outline', 'Documents', '/documents', ['/documents'])}
          {renderNavItem('receipt-outline', 'Payroll', '/payroll', ['/payroll'])}
          {hasActiveOnboarding && renderNavItem('checkbox-outline', 'My Onboarding', '/employee-onboarding', ['/employee-onboarding'])}
          {renderNavItem('person-outline', 'Profile', '/profile', ['/profile'])}
          {renderNavItem(
            'notifications-outline',
            'Notifications',
            '/notifications',
            ['/notifications'],
            false,
            unreadCount
          )}

          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>App Guide</Text>
          <TouchableOpacity
            style={styles.navItem}
            onPress={() => {
              onClose();
              setTimeout(() => {
                startTour();
              }, 250);
            }}
            activeOpacity={0.7}
          >
            <Ionicons
              name="compass-outline"
              size={20}
              color={colors.textSecondary}
              style={styles.navIcon}
            />
            <Text style={[styles.navLabel, { color: colors.textSecondary }]}>App Tour</Text>
          </TouchableOpacity>
          {renderNavItem('information-circle-outline', 'About App', '/onboarding', ['/onboarding'])}

          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Corporate Portals</Text>
          {renderNavItem('book-outline', 'Policies & Handbook', '/policies', ['/policies'])}
          {renderNavItem('chatbubble-outline', 'Submit Feedback', '/feedback', ['/feedback'])}
        </ScrollView>

        {/* Footer */}
        <View
          style={[
            styles.sidebarFooter,
            {
              backgroundColor: colors.tabBarBg,
              borderTopColor: colors.border,
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
          <TouchableOpacity 
            style={styles.logoutBtn}
            onPress={async () => {
              onClose();
              try {
                await signOut();
                router.replace('/login');
              } catch (e) {}
            }}
          >
            <Ionicons name="log-out-outline" size={20} color="#ef4444" style={styles.navIcon} />
            <Text style={styles.logoutLabel}>Log Out</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    position: 'relative',
    width: '100%',
    height: '100%',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    zIndex: 1000,
  },
  backdropPressable: {
    width: '100%',
    height: '100%',
  },
  sidebarPanel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: SIDEBAR_WIDTH,
    backgroundColor: '#0a0f1d',
    borderRightWidth: 1,
    borderRightColor: '#1f2937',
    zIndex: 1001,
    display: 'flex',
    flexDirection: 'column',
    shadowColor: '#000000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 25,
  },
  sidebarHeader: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoIconBg: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#3b82f615',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  logoTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  sidebarBody: {
    flex: 1,
  },
  sidebarBodyContent: {
    paddingHorizontal: 12,
    paddingVertical: 20,
  },
  sectionLabel: {
    color: '#475569',
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: 12,
    marginTop: 14,
    marginBottom: 8,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    marginBottom: 4,
  },
  navItemActive: {
    backgroundColor: '#3b82f612',
  },
  navIcon: {
    marginRight: 12,
  },
  navLabel: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  navLabelActive: {
    color: '#3b82f6',
  },
  activeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#3b82f6',
  },
  badgeContainer: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  sidebarFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
    backgroundColor: '#0b1121',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#ef444408',
    borderColor: '#ef444420',
    borderWidth: 1,
  },
  logoutLabel: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '800',
  },
});
