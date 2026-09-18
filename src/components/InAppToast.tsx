import React, { useEffect, useRef } from 'react';
import {
  Animated,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';

export interface ToastData {
  id: string;
  title: string;
  message: string;
  verb?: string;
  imageUrl?: string | null;
  targetType?: string;
  targetId?: string;
  onPress?: () => void;
  onImagePress?: (url: string) => void;
  duration?: number;
}

interface InAppToastProps {
  toast: ToastData | null;
  onDismiss: () => void;
}

export const InAppToast: React.FC<InAppToastProps> = ({ toast, onDismiss }) => {
  const insets = useSafeAreaInsets();
  const { isDark, colors, accentColors } = useAppTheme();

  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(1)).current;
  const dismissTimeout = useRef<any>(null);

  const duration = toast?.duration || 5000;

  // PanResponder to allow swiping up to dismiss
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 5;
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy < 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy < -20 || gestureState.vy < -0.5) {
          hideToast();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 6,
          }).start();
        }
      },
    })
  ).current;

  const hideToast = () => {
    if (dismissTimeout.current) {
      clearTimeout(dismissTimeout.current);
    }
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -140,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss();
    });
  };

  useEffect(() => {
    if (toast) {
      translateY.setValue(-120);
      opacity.setValue(0);
      progressAnim.setValue(1);

      // Slide and fade in
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 7,
          speed: 14,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();

      // Progress bar animation
      Animated.timing(progressAnim, {
        toValue: 0,
        duration: duration,
        useNativeDriver: false,
      }).start();

      // Auto dismiss
      dismissTimeout.current = setTimeout(() => {
        hideToast();
      }, duration);

      return () => {
        if (dismissTimeout.current) clearTimeout(dismissTimeout.current);
      };
    }
  }, [toast]);

  if (!toast) return null;

  // Icon & Theme mapping based on verb
  const getVerbMeta = (verb?: string) => {
    const v = (verb || '').toLowerCase();
    if (v.includes('announcement')) {
      return {
        icon: 'megaphone',
        bg: isDark ? '#312E81' : '#EEF2FF',
        text: isDark ? '#A5B4FC' : '#4F46E5',
        label: 'Announcement',
      };
    }
    if (v.includes('approved')) {
      return {
        icon: 'checkmark-circle',
        bg: isDark ? '#064E3B' : '#ECFDF5',
        text: isDark ? '#6EE7B7' : '#059669',
        label: 'Approved',
      };
    }
    if (v.includes('rejected')) {
      return {
        icon: 'close-circle',
        bg: isDark ? '#7F1D1D' : '#FEF2F2',
        text: isDark ? '#FCA5A5' : '#DC2626',
        label: 'Rejected',
      };
    }
    if (v.includes('leave')) {
      return {
        icon: 'calendar',
        bg: isDark ? '#1E293B' : '#F1F5F9',
        text: accentColors.primary,
        label: 'Leave',
      };
    }
    if (v.includes('attendance')) {
      return {
        icon: 'time',
        bg: isDark ? '#1E293B' : '#F1F5F9',
        text: accentColors.primary,
        label: 'Attendance',
      };
    }
    return {
      icon: 'notifications',
      bg: isDark ? '#1E293B' : '#F1F5F9',
      text: accentColors.primary,
      label: 'Notification',
    };
  };

  const meta = getVerbMeta(toast.verb);
  const topInset = Math.max(insets.top, Platform.OS === 'ios' ? 44 : 24);

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.wrapper,
        {
          top: topInset + 6,
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.92}
        onPress={() => {
          hideToast();
          if (toast.onPress) toast.onPress();
        }}
        style={[
          styles.card,
          {
            backgroundColor: isDark ? '#131825' : '#FFFFFF',
            borderColor: isDark ? '#232B3E' : '#E2E8F0',
            shadowColor: isDark ? '#000000' : '#0F172A',
          },
        ]}
      >
        <View style={styles.contentRow}>
          {/* Leading Icon Badge */}
          <View style={[styles.iconBadge, { backgroundColor: meta.bg }]}>
            <Ionicons name={meta.icon as any} size={20} color={meta.text} />
          </View>

          {/* Text Content */}
          <View style={styles.textContainer}>
            <View style={styles.headerLine}>
              <Text
                style={[
                  styles.title,
                  { color: isDark ? '#F8FAFC' : '#0F172A' },
                ]}
                numberOfLines={1}
              >
                {toast.title || meta.label}
              </Text>
              <Text style={[styles.timeTag, { color: colors.textMuted }]}>
                Just now
              </Text>
            </View>
            <Text
              style={[
                styles.message,
                { color: isDark ? '#CBD5E1' : '#475569' },
              ]}
              numberOfLines={2}
            >
              {toast.message}
            </Text>
          </View>

          {/* Optional Image Thumbnail */}
          {toast.imageUrl && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                if (toast.onImagePress) {
                  toast.onImagePress(toast.imageUrl!);
                }
              }}
              style={styles.thumbnailContainer}
            >
              <Image
                source={{ uri: toast.imageUrl }}
                style={styles.thumbnail}
                resizeMode="cover"
              />
              <View style={styles.thumbnailExpandIcon}>
                <Ionicons name="expand" size={10} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
          )}

          {/* Close Action */}
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              hideToast();
            }}
            style={styles.dismissBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name="close"
              size={18}
              color={isDark ? '#64748B' : '#94A3B8'}
            />
          </TouchableOpacity>
        </View>

        {/* Progress Bar */}
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressBar,
              {
                backgroundColor: meta.text,
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    elevation: 100,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    paddingTop: 12,
    paddingBottom: 0,
    paddingHorizontal: 14,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 8,
    overflow: 'hidden',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 12,
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
    marginRight: 8,
  },
  headerLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
    marginRight: 6,
  },
  timeTag: {
    fontSize: 11,
    fontWeight: '500',
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
  },
  thumbnailContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailExpandIcon: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 4,
    padding: 2,
  },
  dismissBtn: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressTrack: {
    height: 3,
    width: '100%',
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
});
