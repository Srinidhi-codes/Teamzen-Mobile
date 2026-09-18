import React, { memo } from 'react';
import { StyleSheet, View, Text, Image, TouchableOpacity } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';

const LOGO_SOURCE = require('../../assets/images/teamzen_mark.png');

interface BrandLogoProps {
  size?: number;
  showWordmark?: boolean;
  subtitle?: string;
  onPress?: () => void;
  style?: any;
}

function BrandLogoComponent({
  size = 32,
  showWordmark = true,
  subtitle,
  onPress,
  style,
}: BrandLogoProps) {
  const { colors, accentColors, isDark } = useAppTheme();

  const content = (
    <View style={[styles.container, style]}>
      <View
        style={[
          styles.iconContainer,
          {
            width: size + 8,
            height: size + 8,
            borderRadius: Math.round((size + 8) * 0.28),
            backgroundColor: isDark ? '#1e293b' : '#ffffff',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
          },
        ]}
      >
        <Image
          source={LOGO_SOURCE}
          defaultSource={LOGO_SOURCE}
          fadeDuration={0}
          style={{ width: size, height: size }}
          resizeMode="contain"
        />
      </View>

      {showWordmark && (
        <View style={styles.textContainer}>
          <Text style={[styles.brandText, { color: colors.text }]}>
            Team<Text style={{ color: accentColors.primary }}>zen</Text>
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitleText, { color: colors.textMuted }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.75} onPress={onPress}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

export const BrandLogo = memo(BrandLogoComponent);
export default BrandLogo;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  textContainer: {
    justifyContent: 'center',
  },
  brandText: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitleText: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
});
