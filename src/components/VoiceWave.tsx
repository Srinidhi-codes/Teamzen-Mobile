import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Text, Animated, Easing } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';

interface VoiceWaveProps {
  isProcessing?: boolean;
  durationSeconds?: number;
}

export const VoiceWave: React.FC<VoiceWaveProps> = ({
  isProcessing = false,
  durationSeconds = 0,
}) => {
  const { colors, accentColors, isDark } = useAppTheme();

  // 5 animated values for vertical bouncing wave bars
  const anims = useRef([
    new Animated.Value(0.3),
    new Animated.Value(0.6),
    new Animated.Value(0.9),
    new Animated.Value(0.5),
    new Animated.Value(0.4),
  ]).current;

  useEffect(() => {
    const loops = anims.map((anim, i) => {
      return Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: isProcessing ? 0.4 : 1.0,
            duration: isProcessing ? 400 + i * 50 : 300 + (i % 3) * 120,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0.25,
            duration: isProcessing ? 400 + i * 50 : 300 + (i % 3) * 120,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
    });

    loops.forEach((loop) => loop.start());

    return () => {
      loops.forEach((loop) => loop.stop());
    };
  }, [isProcessing, anims]);

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : 'rgba(239, 68, 68, 0.08)',
          borderColor: isDark ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.2)',
        },
      ]}
    >
      <View style={styles.barsRow}>
        {anims.map((anim, idx) => (
          <Animated.View
            key={idx}
            style={[
              styles.bar,
              {
                backgroundColor: isProcessing ? accentColors.primary : '#ef4444',
                transform: [{ scaleY: anim }],
              },
            ]}
          />
        ))}
      </View>

      <Text style={[styles.statusText, { color: isProcessing ? accentColors.primary : '#ef4444' }]}>
        {isProcessing ? 'Transcribing…' : `Listening · ${formatTimer(durationSeconds)}`}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 18,
  },
  bar: {
    width: 3,
    height: 16,
    borderRadius: 2,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
