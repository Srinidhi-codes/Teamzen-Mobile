import React from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Typography } from './Typography';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';

export interface GenUICardProps {
  type: 'leave' | 'attendance_correction' | 'payroll_alert';
  title: string;
  description: string;
  actionText: string;
  cancelText?: string;
  onAction: () => void;
  onCancel?: () => void;
  isLoading?: boolean;
}

export const GenUIActionCard: React.FC<GenUICardProps> = ({
  type,
  title,
  description,
  actionText,
  cancelText,
  onAction,
  onCancel,
  isLoading = false,
}) => {
  const { colors, isDark } = useAppTheme();

  const getIconName = () => {
    switch (type) {
      case 'leave': return 'calendar';
      case 'attendance_correction': return 'time';
      case 'payroll_alert': return 'alert-circle';
      default: return 'bulb';
    }
  };

  const getIconColor = () => {
    switch (type) {
      case 'leave': return '#3b82f6';
      case 'attendance_correction': return '#10b981';
      case 'payroll_alert': return '#f59e0b';
      default: return '#8b5cf6';
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
      <View style={styles.header}>
        <View style={[styles.iconContainer, { backgroundColor: getIconColor() + '15' }]}>
          <Ionicons name={getIconName()} size={20} color={getIconColor()} />
        </View>
        <Typography variant="subtitle" weight="bold" style={{ flex: 1, marginLeft: 12 }}>
          {title}
        </Typography>
      </View>
      
      <Typography variant="body" color="secondary" style={styles.description}>
        {description}
      </Typography>

      <View style={styles.actionRow}>
        {cancelText && onCancel && (
          <TouchableOpacity
            style={[styles.cancelBtn, { borderColor: colors.border }]}
            onPress={onCancel}
            disabled={isLoading}
          >
            <Typography variant="body" weight="semibold" color="secondary">
              {cancelText}
            </Typography>
          </TouchableOpacity>
        )}
        
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: getIconColor() }]}
          onPress={onAction}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Typography variant="body" weight="semibold" color="white">
              {actionText}
            </Typography>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginVertical: 8,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  description: {
    marginBottom: 16,
    lineHeight: 20,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  actionBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 100,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
});
