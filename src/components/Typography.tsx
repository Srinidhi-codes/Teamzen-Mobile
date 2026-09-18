import React from 'react';
import { Text, TextProps, StyleSheet } from 'react-native';
import { useAppTheme } from '../context/ThemeContext';

export interface TypographyProps extends TextProps {
  variant?: 'h1' | 'h2' | 'h3' | 'h4' | 'body' | 'caption' | 'label' | 'subtitle';
  color?: 'primary' | 'secondary' | 'muted' | 'accent' | 'error' | 'success' | 'white';
  weight?: 'normal' | 'medium' | 'semibold' | 'bold';
  align?: 'auto' | 'left' | 'right' | 'center' | 'justify';
}

export const Typography: React.FC<TypographyProps> = ({
  variant = 'body',
  color = 'primary',
  weight,
  align = 'left',
  style,
  children,
  ...props
}) => {
  const { colors, accentColors } = useAppTheme();

  const getTextColor = () => {
    switch (color) {
      case 'primary': return colors.text;
      case 'secondary': return colors.textSecondary;
      case 'muted': return colors.textMuted;
      case 'accent': return accentColors.primary;
      case 'error': return '#ef4444';
      case 'success': return '#10b981';
      case 'white': return '#ffffff';
      default: return colors.text;
    }
  };

  const getWeightStyle = () => {
    switch (weight) {
      case 'medium': return { fontWeight: '500' as const };
      case 'semibold': return { fontWeight: '600' as const };
      case 'bold': return { fontWeight: '700' as const };
      case 'normal': 
      default: return { fontWeight: '400' as const };
    }
  };

  return (
    <Text
      style={[
        styles[variant],
        { color: getTextColor(), textAlign: align },
        weight && getWeightStyle(),
        style,
      ]}
      {...props}
    >
      {children}
    </Text>
  );
};

const styles = StyleSheet.create({
  h1: { fontSize: 32, lineHeight: 40, fontWeight: '700' },
  h2: { fontSize: 24, lineHeight: 32, fontWeight: '700' },
  h3: { fontSize: 20, lineHeight: 28, fontWeight: '600' },
  h4: { fontSize: 18, lineHeight: 28, fontWeight: '600' },
  subtitle: { fontSize: 16, lineHeight: 24, fontWeight: '500' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5 },
});
