import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  FlatList,
  StatusBar,
  ViewToken,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeInDown,
} from 'react-native-reanimated';
import { OnboardingStorage } from '../utils/onboardingStorage';
import { useAuth } from '../context/AuthContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Slide Data ──────────────────────────────────────────────────────────────
interface OnboardingSlide {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  gradient: [string, string, string];
  accentColor: string;
  features: string[];
}

const SLIDES: OnboardingSlide[] = [
  {
    id: 'welcome',
    title: 'Welcome to\nTeamzen',
    subtitle: 'Your all-in-one HR & payroll companion. Manage your work life smarter, faster, and easier.',
    emoji: '✨',
    gradient: ['#0a0f1e', '#0d1b3e', '#1a1040'],
    accentColor: '#6366f1',
    features: ['Payroll & Payslips', 'Leave Management', 'AI Assistant'],
  },
  {
    id: 'attendance',
    title: 'Smart\nAttendance',
    subtitle: 'Clock in and out with a single tap. Verified by face recognition and GPS location.',
    emoji: '🕐',
    gradient: ['#0a1628', '#0d2137', '#062030'],
    accentColor: '#06b6d4',
    features: ['Face ID verification', 'GPS check-in', 'Real-time tracking'],
  },
  {
    id: 'payroll',
    title: 'Payroll &\nPayslips',
    subtitle: 'View your complete salary breakdown, tax deductions, and download payslips anytime.',
    emoji: '💳',
    gradient: ['#150b2e', '#1e0b42', '#2a0a3d'],
    accentColor: '#8b5cf6',
    features: ['Salary breakdown', 'Tax & deductions', 'Download payslips'],
  },
  {
    id: 'leaves',
    title: 'Leave\nManagement',
    subtitle: 'Apply for leaves in seconds. Track your balances and get instant approval notifications.',
    emoji: '🌿',
    gradient: ['#061a18', '#082a22', '#0a3328'],
    accentColor: '#10b981',
    features: ['One-tap apply', 'Balance tracking', 'Instant approvals'],
  },
  {
    id: 'ai',
    title: 'AI-Powered\nAssistant',
    subtitle: 'Ask anything about HR policies, payslips, or attendance. Get instant, intelligent answers.',
    emoji: '🤖',
    gradient: ['#1a0e08', '#2a1408', '#351a05'],
    accentColor: '#f97316',
    features: ['HR policy answers', 'Payslip queries', 'Attendance insights'],
  },
];

// ─── Illustration Component ───────────────────────────────────────────────────
function SlideIllustration({
  slide,
  isActive,
}: {
  slide: OnboardingSlide;
  isActive: boolean;
}) {
  return (
    <View style={styles.illustrationContainer}>
      {/* Glowing ring */}
      <View
        style={[
          styles.glowRing,
          {
            borderColor: slide.accentColor + '30',
            shadowColor: slide.accentColor,
          },
        ]}
      />
      <View
        style={[
          styles.glowRingInner,
          {
            borderColor: slide.accentColor + '50',
            shadowColor: slide.accentColor,
          },
        ]}
      />

      {/* Central emoji / brand badge */}
      <View
        style={[
          styles.emojiBadge,
          {
            backgroundColor: slide.accentColor + '20',
            borderColor: slide.accentColor + '40',
            shadowColor: slide.accentColor,
          },
        ]}
      >
        {slide.id === 'ai' ? (
          <Image
            source={require('../../assets/images/assistant-mark.webp')}
            style={{ width: 68, height: 68, resizeMode: 'contain' }}
          />
        ) : (
          <Text style={styles.emojiText}>{slide.emoji}</Text>
        )}
      </View>

      {/* Floating feature chips */}
      {slide.features.map((feature, i) => {
        const positions = [
          { top: -20, left: -80 },
          { top: 40, right: -90 },
          { bottom: -10, left: -70 },
        ];
        const pos = positions[i] || {};
        return (
          <View
            key={feature}
            style={[
              styles.featureChip,
              pos,
              {
                backgroundColor: slide.accentColor + '18',
                borderColor: slide.accentColor + '35',
              },
            ]}
          >
            <View
              style={[styles.featureDot, { backgroundColor: slide.accentColor }]}
            />
            <Text style={[styles.featureChipText, { color: slide.accentColor }]}>
              {feature}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Single Slide ─────────────────────────────────────────────────────────────
function OnboardingSlideItem({
  item,
  index,
  activeIndex,
}: {
  item: OnboardingSlide;
  index: number;
  activeIndex: number;
}) {
  const isActive = index === activeIndex;

  return (
    <View style={styles.slide}>
      <LinearGradient
        colors={item.gradient}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      {/* Decorative blobs */}
      <View
        style={[
          styles.blob1,
          { backgroundColor: item.accentColor + '15' },
        ]}
      />
      <View
        style={[
          styles.blob2,
          { backgroundColor: item.accentColor + '08' },
        ]}
      />

      {/* Illustration */}
      <View style={styles.illustrationWrapper}>
        <SlideIllustration slide={item} isActive={isActive} />
      </View>

      {/* Text content */}
      <View style={styles.textContent}>
        <Animated.View entering={isActive ? FadeInDown.delay(100).springify() : undefined}>
          <Text style={[styles.slideTitle, { color: '#ffffff' }]}>{item.title}</Text>
        </Animated.View>

        <Animated.View entering={isActive ? FadeInDown.delay(200).springify() : undefined}>
          <Text style={[styles.slideSubtitle, { color: 'rgba(255,255,255,0.65)' }]}>
            {item.subtitle}
          </Text>
        </Animated.View>

        {/* Accent line */}
        <Animated.View
          entering={isActive ? FadeInDown.delay(300).springify() : undefined}
          style={[styles.accentLine, { backgroundColor: item.accentColor }]}
        />
      </View>
    </View>
  );
}

// ─── Dot Indicator ────────────────────────────────────────────────────────────
function DotIndicator({
  count,
  activeIndex,
  accentColor,
}: {
  count: number;
  activeIndex: number;
  accentColor: string;
}) {
  return (
    <View style={styles.dotsContainer}>
      {Array.from({ length: count }).map((_, i) => {
        const isActive = i === activeIndex;
        return (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              {
                width: isActive ? 24 : 6,
                backgroundColor: isActive ? accentColor : 'rgba(255,255,255,0.25)',
              },
            ]}
          />
        );
      })}
    </View>
  );
}

// ─── Main Onboarding Screen ───────────────────────────────────────────────────
export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const currentSlide = SLIDES[activeIndex];

  const { accessToken } = useAuth();
  const isAuthenticated = Boolean(accessToken);

  const handleFinish = useCallback(async () => {
    await OnboardingStorage.markOnboardingSeen();
    if (isAuthenticated) {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)');
      }
    } else {
      router.replace('/login');
    }
  }, [router, isAuthenticated]);

  const handleNext = useCallback(() => {
    if (activeIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
    } else {
      handleFinish();
    }
  }, [activeIndex, handleFinish]);

  const handleSkip = useCallback(async () => {
    await OnboardingStorage.markOnboardingSeen();
    if (isAuthenticated) {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)');
      }
    } else {
      router.replace('/login');
    }
  }, [router, isAuthenticated]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems[0]?.index !== null && viewableItems[0]?.index !== undefined) {
        setActiveIndex(viewableItems[0].index);
      }
    }
  );

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 });

  const isLastSlide = activeIndex === SLIDES.length - 1;

  return (
    <View style={styles.container}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Slides */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <OnboardingSlideItem
            item={item}
            index={index}
            activeIndex={activeIndex}
          />
        )}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onViewableItemsChanged={onViewableItemsChanged.current}
        viewabilityConfig={viewabilityConfig.current}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
      />

      {/* Top Header: Skip button positioned at absolute top right */}
      {!isLastSlide && (
        <TouchableOpacity
          style={[styles.topSkipButton, { top: insets.top + 16 }]}
          onPress={handleSkip}
          activeOpacity={0.7}
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      )}

      {/* Bottom controls overlay */}
      <View
        style={[
          styles.bottomControls,
          { paddingBottom: Math.max(insets.bottom, 24) },
        ]}
        pointerEvents="box-none"
      >

        {/* Bottom bar */}
        <View style={styles.bottomBar}>
          {/* Dots */}
          <DotIndicator
            count={SLIDES.length}
            activeIndex={activeIndex}
            accentColor={currentSlide.accentColor}
          />

          {/* Next / Get Started */}
          <TouchableOpacity
            style={[
              styles.nextButton,
              { backgroundColor: currentSlide.accentColor },
            ]}
            onPress={handleNext}
            activeOpacity={0.85}
          >
            <Text style={styles.nextButtonText}>
              {isLastSlide ? 'Get Started' : 'Next'}
            </Text>
            {!isLastSlide && <Text style={styles.nextArrow}> →</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0f1e',
  },
  slide: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    overflow: 'hidden',
  },
  blob1: {
    position: 'absolute',
    width: 360,
    height: 360,
    borderRadius: 180,
    top: -120,
    right: -100,
  },
  blob2: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    bottom: 80,
    left: -80,
  },

  // Illustration
  illustrationWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  illustrationContainer: {
    width: 200,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  glowRing: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 0,
  },
  glowRingInner: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 0,
  },
  emojiBadge: {
    width: 120,
    height: 120,
    borderRadius: 34,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 10,
  },
  emojiText: {
    fontSize: 56,
  },
  featureChip: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    gap: 5,
  },
  featureDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  featureChipText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },

  // Text
  textContent: {
    paddingHorizontal: 32,
    paddingBottom: 160,
  },
  slideTitle: {
    fontSize: 40,
    fontWeight: '800',
    lineHeight: 48,
    letterSpacing: -1,
    marginBottom: 16,
  },
  slideSubtitle: {
    fontSize: 16,
    lineHeight: 26,
    fontWeight: '400',
    marginBottom: 20,
  },
  accentLine: {
    width: 40,
    height: 3,
    borderRadius: 2,
  },

  // Top skip button
  topSkipButton: {
    position: 'absolute',
    right: 20,
    zIndex: 99,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  skipText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },

  // Bottom controls overlay
  bottomControls: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    paddingTop: 20,
    paddingBottom: 8,
  },

  // Dots
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },

  // Next button
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 30,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  nextButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  nextArrow: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 2,
  },
});

