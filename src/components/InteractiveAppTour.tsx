import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Image,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTour, TOUR_STEPS } from '../context/TourContext';
import { useAppTheme } from '../context/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function InteractiveAppTour() {
  const insets = useSafeAreaInsets();
  const { isTourActive, currentStepIndex, currentStep, nextStep, prevStep, closeTour } = useTour();
  const { colors, accentColors, isDark } = useAppTheme();

  if (!isTourActive || !currentStep) return null;

  const isLast = currentStepIndex === TOUR_STEPS.length - 1;
  const isFirst = currentStepIndex === 0;
  const progressPct = ((currentStepIndex + 1) / TOUR_STEPS.length) * 100;

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        styles.overlay,
        { zIndex: 999999, elevation: 999999 },
      ]}
      pointerEvents="auto"
    >
        {/* Top Header bar with Skip Tour button */}
        <View style={[styles.topHeader, { top: insets.top + 12 }]}>
          <View style={styles.brandBadge}>
            <Image
              source={require('../../assets/images/teamzen_mark.png')}
              style={styles.headerBrandMark}
              resizeMode="contain"
            />
            <Text style={styles.headerBrandText}>Interactive Guide</Text>
          </View>

          <TouchableOpacity
            style={styles.skipTourButton}
            onPress={closeTour}
            activeOpacity={0.7}
          >
            <Text style={styles.skipTourText}>Skip Tour</Text>
            <Ionicons name="close" size={16} color="#ffffff" style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        </View>

        {/* Center Tour Card */}
        <View style={styles.cardWrapper}>
          <View
            style={[
              styles.cardContainer,
              {
                backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.98)',
                borderColor: isDark ? 'rgba(99, 102, 241, 0.35)' : 'rgba(99, 102, 241, 0.25)',
              },
            ]}
          >
            {/* Top Progress Line */}
            <View style={styles.progressBarBackground}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${progressPct}%`,
                    backgroundColor: accentColors.primary || '#6366f1',
                  },
                ]}
              />
            </View>

            {/* Step Badge & Icon Header */}
            <View style={styles.stepHeaderRow}>
              <View
                style={[
                  styles.iconGlowBox,
                  {
                    backgroundColor: (accentColors.primary || '#6366f1') + '18',
                    borderColor: (accentColors.primary || '#6366f1') + '40',
                  },
                ]}
              >
                {currentStep.useImage ? (
                  <Image
                    source={require('../../assets/images/assistant-mark.webp')}
                    style={styles.assistantMark}
                    resizeMode="contain"
                  />
                ) : (
                  <Ionicons
                    name={currentStep.icon as any}
                    size={28}
                    color={accentColors.primary || '#6366f1'}
                  />
                )}
              </View>

              <View style={styles.stepMetaText}>
                <Text
                  style={[
                    styles.stepBadgeText,
                    { color: accentColors.primary || '#6366f1' },
                  ]}
                >
                  {currentStep.badge}
                </Text>
                <Text
                  style={[
                    styles.stepSubtitle,
                    { color: colors.textMuted || '#94a3b8' },
                  ]}
                  numberOfLines={1}
                >
                  {currentStep.subtitle}
                </Text>
              </View>
            </View>

            {/* Title */}
            <Text
              style={[
                styles.stepTitle,
                { color: colors.text || '#0f172a' },
              ]}
            >
              {currentStep.title}
            </Text>

            {/* Description */}
            <Text
              style={[
                styles.stepDescription,
                { color: isDark ? '#cbd5e1' : '#475569' },
              ]}
            >
              {currentStep.description}
            </Text>

            {/* Feature Bullets */}
            <View style={styles.bulletsContainer}>
              {currentStep.bullets.map((bullet, idx) => (
                <View key={idx} style={styles.bulletRow}>
                  <View
                    style={[
                      styles.bulletCheck,
                      { backgroundColor: (accentColors.primary || '#6366f1') + '20' },
                    ]}
                  >
                    <Ionicons
                      name="checkmark"
                      size={13}
                      color={accentColors.primary || '#6366f1'}
                    />
                  </View>
                  <Text
                    style={[
                      styles.bulletText,
                      { color: isDark ? '#e2e8f0' : '#334155' },
                    ]}
                  >
                    {bullet}
                  </Text>
                </View>
              ))}
            </View>

            {/* Bottom Actions */}
            <View style={styles.actionsRow}>
              {/* Back button */}
              {!isFirst ? (
                <TouchableOpacity
                  style={[
                    styles.backButton,
                    {
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
                      borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)',
                    },
                  ]}
                  onPress={prevStep}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="chevron-back"
                    size={16}
                    color={colors.text || '#ffffff'}
                  />
                  <Text style={[styles.backButtonText, { color: colors.text || '#ffffff' }]}>
                    Back
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={{ width: 80 }} />
              )}

              {/* Step indicator dots */}
              <View style={styles.dotsRow}>
                {TOUR_STEPS.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.miniDot,
                      {
                        backgroundColor:
                          i === currentStepIndex
                            ? accentColors.primary || '#6366f1'
                            : isDark
                            ? 'rgba(255, 255, 255, 0.2)'
                            : 'rgba(0, 0, 0, 0.15)',
                        width: i === currentStepIndex ? 18 : 6,
                      },
                    ]}
                  />
                ))}
              </View>

              {/* Next / Finish button */}
              <TouchableOpacity
                style={[
                  styles.nextButton,
                  { backgroundColor: accentColors.primary || '#6366f1' },
                ]}
                onPress={nextStep}
                activeOpacity={0.85}
              >
                <Text style={styles.nextButtonText}>
                  {isLast ? 'Finish Tour' : 'Next'}
                </Text>
                {!isLast && (
                  <Ionicons
                    name="arrow-forward"
                    size={16}
                    color="#ffffff"
                    style={{ marginLeft: 4 }}
                  />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 10, 24, 0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  topHeader: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 99,
  },
  brandBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    gap: 6,
  },
  headerBrandMark: {
    width: 16,
    height: 16,
  },
  headerBrandText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  skipTourButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  skipTourText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  cardWrapper: {
    width: '100%',
    maxWidth: 420,
  },
  cardContainer: {
    borderRadius: 24,
    borderWidth: 1.5,
    overflow: 'hidden',
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 28,
    elevation: 16,
  },
  progressBarBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  progressBarFill: {
    height: '100%',
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  stepHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 4,
    marginBottom: 16,
  },
  iconGlowBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  assistantMark: {
    width: 32,
    height: 32,
  },
  stepMetaText: {
    flex: 1,
  },
  stepBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  stepSubtitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 28,
    marginBottom: 8,
  },
  stepDescription: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 16,
  },
  bulletsContainer: {
    gap: 10,
    marginBottom: 22,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(99, 102, 241, 0.05)',
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bulletCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  bulletText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
  },
  backButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  miniDot: {
    height: 6,
    borderRadius: 3,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
    gap: 4,
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  nextButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
