import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
import { graphqlRequest } from '../services/api';

const REQUEST_CORRECTION_MUTATION = `
  mutation RequestAttendanceCorrection($input: AttendanceCorrectionInput!) {
    requestAttendanceCorrection(input: $input) {
      id
      status
      reason
      correctedLoginTime
      correctedLogoutTime
    }
  }
`;

interface Props {
  visible: boolean;
  attendanceRecordId?: string | null;
  currentLoginTime?: string | null;
  currentLogoutTime?: string | null;
  attendanceDate?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AttendanceCorrectionModal({
  visible,
  attendanceRecordId,
  currentLoginTime,
  currentLogoutTime,
  attendanceDate,
  onClose,
  onSuccess,
}: Props) {
  const { colors, accentColors, isDark } = useAppTheme();
  const [loginTime, setLoginTime] = useState(currentLoginTime || '09:00:00');
  const [logoutTime, setLogoutTime] = useState(currentLogoutTime || '18:00:00');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync initial values when modal opens
  React.useEffect(() => {
    if (visible) {
      setLoginTime(currentLoginTime || '09:00:00');
      setLogoutTime(currentLogoutTime || '18:00:00');
      setReason('');
    }
  }, [visible, currentLoginTime, currentLogoutTime]);

  const handleSubmit = async () => {
    if (!attendanceRecordId) {
      Alert.alert('Error', 'No attendance record found for today to correct. Please punch in first.');
      return;
    }

    if (!reason.trim()) {
      Alert.alert('Reason Required', 'Please provide a reason explaining the correction request.');
      return;
    }

    setIsSubmitting(true);
    try {
      await graphqlRequest(REQUEST_CORRECTION_MUTATION, {
        input: {
          attendanceRecordId,
          correctedLoginTime: loginTime,
          correctedLogoutTime: logoutTime,
          reason: reason.trim(),
        },
      });

      Alert.alert('Request Submitted', 'Your attendance correction request has been sent for manager review.');
      onSuccess();
      onClose();
    } catch (error: any) {
      Alert.alert('Submission Failed', error?.message || 'Could not submit correction request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const styles = getStyles(colors, accentColors, isDark);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={styles.iconContainer}>
                <Ionicons name="create-outline" size={22} color={accentColors.primary} />
              </View>
              <View>
                <Text style={styles.title}>Request Correction</Text>
                <Text style={styles.subtitle}>
                  {attendanceDate ? `For date: ${attendanceDate}` : "Today's Attendance"}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Current Recorded Values */}
            <View style={styles.recordedCard}>
              <Text style={styles.recordedLabel}>CURRENT RECORDED TIMES</Text>
              <View style={styles.recordedRow}>
                <View style={styles.recordedCol}>
                  <Text style={styles.recordedKey}>Check In</Text>
                  <Text style={styles.recordedVal}>{currentLoginTime || '—'}</Text>
                </View>
                <View style={styles.recordedDivider} />
                <View style={styles.recordedCol}>
                  <Text style={styles.recordedKey}>Check Out</Text>
                  <Text style={styles.recordedVal}>{currentLogoutTime || '—'}</Text>
                </View>
              </View>
            </View>

            {/* Corrected Login Time */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Corrected Check-In Time (HH:mm:ss)</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="log-in-outline" size={18} color={colors.textSecondary} style={styles.fieldIcon} />
                <TextInput
                  style={styles.input}
                  value={loginTime}
                  onChangeText={setLoginTime}
                  placeholder="09:00:00"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                />
              </View>
            </View>

            {/* Corrected Logout Time */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Corrected Check-Out Time (HH:mm:ss)</Text>
              <View style={styles.inputContainer}>
                <Ionicons name="log-out-outline" size={18} color={colors.textSecondary} style={styles.fieldIcon} />
                <TextInput
                  style={styles.input}
                  value={logoutTime}
                  onChangeText={setLogoutTime}
                  placeholder="18:00:00"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                />
              </View>
            </View>

            {/* Reason */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Reason for Correction *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={reason}
                onChangeText={setReason}
                placeholder="e.g., Forgot to clock in due to client meeting off-site..."
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            {/* Notice */}
            <View style={styles.noticeCard}>
              <Ionicons name="information-circle-outline" size={18} color={accentColors.primary} />
              <Text style={styles.noticeText}>
                Correction requests require approval from HR or your direct manager before updating your records.
              </Text>
            </View>

            {/* Actions */}
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={onClose}
                disabled={isSubmitting}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={18} color="#ffffff" />
                    <Text style={styles.submitBtnText}>Submit Request</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const getStyles = (colors: any, accentColors: any, isDark: boolean) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
    },
    backdrop: {
      flex: 1,
    },
    sheetContainer: {
      backgroundColor: colors.backgroundCard,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      borderWidth: 1,
      borderColor: colors.border,
      maxHeight: '85%',
      paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 22,
      paddingTop: 20,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
    },
    headerTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    iconContainer: {
      width: 42,
      height: 42,
      borderRadius: 12,
      backgroundColor: accentColors.light,
      justifyContent: 'center',
      alignItems: 'center',
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    subtitle: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    closeBtn: {
      padding: 6,
    },
    scrollContent: {
      paddingHorizontal: 22,
      paddingTop: 18,
      paddingBottom: 24,
    },
    recordedCard: {
      backgroundColor: isDark ? '#1e293b50' : '#f1f5f980',
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.borderLight,
      marginBottom: 18,
    },
    recordedLabel: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.8,
      color: colors.textMuted,
      marginBottom: 8,
    },
    recordedRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'center',
    },
    recordedCol: {
      alignItems: 'center',
    },
    recordedKey: {
      fontSize: 11,
      color: colors.textSecondary,
    },
    recordedVal: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
      marginTop: 2,
    },
    recordedDivider: {
      width: 1,
      height: 24,
      backgroundColor: colors.border,
    },
    fieldGroup: {
      marginBottom: 16,
    },
    fieldLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 8,
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.inputBg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
    },
    fieldIcon: {
      marginRight: 10,
    },
    input: {
      flex: 1,
      height: 46,
      fontSize: 14,
      color: colors.text,
    },
    textArea: {
      height: 96,
      backgroundColor: colors.inputBg,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingTop: 12,
    },
    noticeCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      backgroundColor: accentColors.light,
      padding: 12,
      borderRadius: 12,
      marginBottom: 20,
    },
    noticeText: {
      flex: 1,
      fontSize: 12,
      lineHeight: 17,
      color: colors.textSecondary,
    },
    actionsRow: {
      flexDirection: 'row',
      gap: 12,
    },
    cancelBtn: {
      flex: 1,
      height: 48,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.backgroundCard,
    },
    cancelBtnText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    submitBtn: {
      flex: 2,
      height: 48,
      borderRadius: 14,
      backgroundColor: accentColors.primary,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
    },
    submitBtnDisabled: {
      opacity: 0.6,
    },
    submitBtnText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#ffffff',
    },
  });
