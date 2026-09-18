import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAppTheme } from '../context/ThemeContext';
import ScreenHeader from '../components/ScreenHeader';
import { graphqlRequest } from '../services/api';
import AttendanceCorrectionModal from '../components/AttendanceCorrectionModal';

interface AttendanceRecordSummary {
  id: string;
  attendanceDate: string;
  loginTime?: string | null;
  logoutTime?: string | null;
  status?: string | null;
}

interface UserSummary {
  id: string;
  firstName?: string;
  lastName?: string;
}

export interface AttendanceCorrectionItem {
  id: string;
  correctedLoginTime?: string | null;
  correctedLogoutTime?: string | null;
  reason: string;
  status: string; // 'pending' | 'approved' | 'rejected' | 'cancelled'
  approvalComments?: string | null;
  createdAt: string;
  attendanceRecord?: AttendanceRecordSummary | null;
  requestedBy?: UserSummary | null;
  approvedBy?: UserSummary | null;
}

interface AttendanceCorrectionsResponse {
  attendanceCorrections: {
    results: AttendanceCorrectionItem[];
    total: number;
    page: number;
    pageSize: number;
  };
}

const GET_ATTENDANCE_CORRECTIONS = `
  query GetAttendanceCorrections($page: Int, $pageSize: Int, $filters: AttendanceCorrectionFilterInput) {
    attendanceCorrections(page: $page, pageSize: $pageSize, filters: $filters) {
      results {
        id
        correctedLoginTime
        correctedLogoutTime
        reason
        status
        approvalComments
        createdAt
        attendanceRecord {
          id
          attendanceDate
          loginTime
          logoutTime
          status
        }
        requestedBy {
          id
          firstName
          lastName
        }
        approvedBy {
          id
          firstName
          lastName
        }
      }
      total
      page
      pageSize
    }
  }
`;

const CANCEL_CORRECTION_MUTATION = `
  mutation CancelAttendanceCorrection($correctionId: ID!) {
    cancelAttendanceCorrection(correctionId: $correctionId) {
      id
      status
    }
  }
`;

const PAGE_SIZE = 8;

export default function AttendanceRequestsScreen() {
  const router = useRouter();
  const { colors, accentColors, isDark } = useAppTheme();
  const styles = getStyles(colors, accentColors, isDark);

  const [corrections, setCorrections] = useState<AttendanceCorrectionItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCancelling, setIsCancelling] = useState<string | null>(null);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);

  const fetchRequests = useCallback(
    async (showLoader = true) => {
      if (showLoader) setIsLoading(true);
      try {
        const filters = statusFilter !== 'all' ? { status: statusFilter } : undefined;
        const res = await graphqlRequest<AttendanceCorrectionsResponse>(
          GET_ATTENDANCE_CORRECTIONS,
          {
            page: currentPage,
            pageSize: PAGE_SIZE,
            filters,
          }
        );

        if (res?.attendanceCorrections) {
          setCorrections(res.attendanceCorrections.results || []);
          setTotalCount(res.attendanceCorrections.total || 0);
        }
      } catch (err: any) {
        console.error('Failed to fetch attendance corrections:', err);
        Alert.alert('Error', 'Unable to load attendance correction requests.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [currentPage, statusFilter]
  );

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchRequests(false);
  };

  const handleFilterChange = (filter: 'all' | 'pending' | 'approved' | 'rejected') => {
    setStatusFilter(filter);
    setCurrentPage(1);
  };

  const handleCancelRequest = (item: AttendanceCorrectionItem) => {
    Alert.alert(
      'Cancel Correction Request',
      `Are you sure you want to cancel your correction request for ${item.attendanceRecord?.attendanceDate || 'this day'}?`,
      [
        { text: 'No, Keep It', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            setIsCancelling(item.id);
            try {
              await graphqlRequest(CANCEL_CORRECTION_MUTATION, { correctionId: item.id });
              Alert.alert('Success', 'Correction request cancelled.');
              fetchRequests(false);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to cancel correction request.');
            } finally {
              setIsCancelling(null);
            }
          },
        },
      ]
    );
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const getStatusBadge = (status?: string) => {
    const s = status?.toLowerCase() || 'pending';
    switch (s) {
      case 'approved':
        return { label: 'APPROVED', bg: '#10b98118', text: '#10b981', border: '#10b98140', icon: 'checkmark-circle' as const };
      case 'rejected':
        return { label: 'REJECTED', bg: '#ef444418', text: '#ef4444', border: '#ef444440', icon: 'close-circle' as const };
      case 'cancelled':
        return { label: 'CANCELLED', bg: '#64748b18', text: '#64748b', border: '#64748b40', icon: 'remove-circle' as const };
      case 'pending':
      default:
        return { label: 'PENDING', bg: '#f59e0b18', text: '#f59e0b', border: '#f59e0b40', icon: 'time' as const };
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const renderItem = ({ item }: { item: AttendanceCorrectionItem }) => {
    const statusCfg = getStatusBadge(item.status);
    const dateLabel = item.attendanceRecord?.attendanceDate || item.createdAt?.slice(0, 10);
    const isPending = item.status?.toLowerCase() === 'pending';

    return (
      <View style={styles.card}>
        {/* Card Header: Date & Status Pill */}
        <View style={styles.cardHeader}>
          <View style={styles.dateCol}>
            <Ionicons name="calendar-outline" size={16} color={accentColors.primary} style={{ marginRight: 6 }} />
            <Text style={[styles.dateText, { color: colors.text }]}>{formatDate(dateLabel)}</Text>
          </View>
          <View
            style={[
              styles.statusPill,
              { backgroundColor: statusCfg.bg, borderColor: statusCfg.border },
            ]}
          >
            <Ionicons name={statusCfg.icon} size={12} color={statusCfg.text} style={{ marginRight: 4 }} />
            <Text style={[styles.statusPillText, { color: statusCfg.text }]}>{statusCfg.label}</Text>
          </View>
        </View>

        {/* Timings Comparison: Original vs Requested */}
        <View style={[styles.timingContainer, { backgroundColor: isDark ? '#0b1626' : '#f8fafc' }]}>
          <View style={styles.timingCol}>
            <Text style={[styles.timingLabel, { color: colors.textMuted }]}>Original Punch</Text>
            <Text style={[styles.timingValue, { color: colors.textSecondary }]}>
              {item.attendanceRecord?.loginTime || '—'}  →  {item.attendanceRecord?.logoutTime || '—'}
            </Text>
          </View>
          <View style={styles.arrowCol}>
            <Ionicons name="arrow-forward" size={16} color={accentColors.primary} />
          </View>
          <View style={styles.timingCol}>
            <Text style={[styles.timingLabel, { color: accentColors.primary }]}>Requested Punch</Text>
            <Text style={[styles.timingValueBold, { color: colors.text }]}>
              {item.correctedLoginTime || '—'}  →  {item.correctedLogoutTime || '—'}
            </Text>
          </View>
        </View>

        {/* Reason */}
        <View style={styles.reasonSection}>
          <Text style={[styles.reasonLabel, { color: colors.textMuted }]}>Reason for correction:</Text>
          <Text style={[styles.reasonText, { color: colors.text }]}>"{item.reason}"</Text>
        </View>

        {/* Approver Feedback / Notes */}
        {item.approvalComments ? (
          <View style={[styles.feedbackBox, { borderColor: statusCfg.border, backgroundColor: statusCfg.bg }]}>
            <Text style={[styles.feedbackTitle, { color: statusCfg.text }]}>
              Reviewer Note {item.approvedBy ? `(${item.approvedBy.firstName} ${item.approvedBy.lastName})` : ''}:
            </Text>
            <Text style={[styles.feedbackText, { color: colors.text }]}>{item.approvalComments}</Text>
          </View>
        ) : null}

        {/* Card Footer: Submitted timestamp & Cancel button if pending */}
        <View style={styles.cardFooter}>
          <Text style={[styles.submittedAt, { color: colors.textMuted }]}>
            Submitted {formatDate(item.createdAt)}
          </Text>

          {isPending && (
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => handleCancelRequest(item)}
              disabled={isCancelling === item.id}
            >
              {isCancelling === item.id ? (
                <ActivityIndicator size="small" color="#ef4444" />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={14} color="#ef4444" style={{ marginRight: 4 }} />
                  <Text style={styles.cancelBtnText}>Cancel Request</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScreenHeader
        title="Correction Requests"
        subtitle={`${totalCount} request${totalCount === 1 ? '' : 's'} recorded`}
        showBack={true}
        showNotifications={true}
        rightElement={
          <TouchableOpacity
            style={[styles.newRequestBtn, { backgroundColor: accentColors.primary }]}
            onPress={() => setIsNewModalOpen(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={16} color="#ffffff" style={{ marginRight: 2 }} />
            <Text style={styles.newRequestBtnText}>New</Text>
          </TouchableOpacity>
        }
      />

      {/* New Request Modal */}
      <AttendanceCorrectionModal
        visible={isNewModalOpen}
        onClose={() => setIsNewModalOpen(false)}
        onSuccess={() => {
          setIsNewModalOpen(false);
          fetchRequests(false);
        }}
      />

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {(['all', 'pending', 'approved', 'rejected'] as const).map((tab) => {
          const isActive = statusFilter === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={[
                styles.filterChip,
                isActive && [styles.activeFilterChip, { borderColor: accentColors.primary }],
              ]}
              onPress={() => handleFilterChange(tab)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  isActive
                    ? [styles.activeFilterChipText, { color: accentColors.primary }]
                    : { color: colors.textSecondary },
                ]}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Requests List */}
      {isLoading && !isRefreshing ? (
        <View style={styles.centerWrapper}>
          <ActivityIndicator size="large" color={accentColors.primary} />
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>
            Loading correction requests...
          </Text>
        </View>
      ) : (
        <FlatList
          data={corrections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.listContent,
            corrections.length === 0 && styles.emptyList,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={accentColors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <View style={[styles.emptyIconBg, { backgroundColor: accentColors.light }]}>
                <Ionicons name="document-text-outline" size={40} color={accentColors.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {statusFilter === 'all'
                  ? 'No correction requests found'
                  : `No ${statusFilter} correction requests`}
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                If you missed punching in or out, click "New" above to submit an attendance correction.
              </Text>
            </View>
          }
          ListFooterComponent={
            totalCount > PAGE_SIZE ? (
              <View style={styles.paginationRow}>
                <TouchableOpacity
                  style={[
                    styles.pageBtn,
                    currentPage === 1 && styles.pageBtnDisabled,
                    { borderColor: colors.border },
                  ]}
                  onPress={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <Ionicons
                    name="chevron-back"
                    size={16}
                    color={currentPage === 1 ? colors.textMuted : colors.text}
                  />
                  <Text
                    style={[
                      styles.pageBtnText,
                      { color: currentPage === 1 ? colors.textMuted : colors.text },
                    ]}
                  >
                    Previous
                  </Text>
                </TouchableOpacity>

                <Text style={[styles.pageInfoText, { color: colors.textSecondary }]}>
                  Page <Text style={{ fontWeight: '800', color: colors.text }}>{currentPage}</Text> of{' '}
                  <Text style={{ fontWeight: '800', color: colors.text }}>{totalPages}</Text>
                </Text>

                <TouchableOpacity
                  style={[
                    styles.pageBtn,
                    currentPage >= totalPages && styles.pageBtnDisabled,
                    { borderColor: colors.border },
                  ]}
                  onPress={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                >
                  <Text
                    style={[
                      styles.pageBtnText,
                      { color: currentPage >= totalPages ? colors.textMuted : colors.text },
                    ]}
                  >
                    Next
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={currentPage >= totalPages ? colors.textMuted : colors.text}
                  />
                </TouchableOpacity>
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const getStyles = (colors: any, accentColors: any, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    newRequestBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 12,
    },
    newRequestBtnText: {
      color: '#ffffff',
      fontSize: 13,
      fontWeight: '800',
    },
    filterRow: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
      gap: 8,
    },
    filterChip: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.backgroundCard,
    },
    activeFilterChip: {
      backgroundColor: isDark ? '#0f172a' : '#ffffff',
      borderWidth: 1.5,
    },
    filterChipText: {
      fontSize: 12,
      fontWeight: '600',
    },
    activeFilterChipText: {
      fontWeight: '800',
    },
    centerWrapper: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    loadingText: {
      marginTop: 10,
      fontSize: 13,
    },
    listContent: {
      padding: 16,
      paddingBottom: 40,
    },
    emptyList: {
      flexGrow: 1,
      justifyContent: 'center',
    },
    card: {
      backgroundColor: colors.backgroundCard,
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    dateCol: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    dateText: {
      fontSize: 14,
      fontWeight: '800',
    },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 10,
      borderWidth: 1,
    },
    statusPillText: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.5,
    },
    timingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 12,
      borderRadius: 12,
      marginBottom: 10,
    },
    timingCol: {
      flex: 1,
    },
    arrowCol: {
      paddingHorizontal: 8,
    },
    timingLabel: {
      fontSize: 10,
      fontWeight: '600',
      textTransform: 'uppercase',
      marginBottom: 3,
    },
    timingValue: {
      fontSize: 12,
      fontWeight: '600',
    },
    timingValueBold: {
      fontSize: 12,
      fontWeight: '800',
    },
    reasonSection: {
      marginBottom: 10,
    },
    reasonLabel: {
      fontSize: 11,
      fontWeight: '600',
      marginBottom: 2,
    },
    reasonText: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '500',
      fontStyle: 'italic',
    },
    feedbackBox: {
      padding: 10,
      borderRadius: 10,
      borderWidth: 1,
      marginBottom: 10,
    },
    feedbackTitle: {
      fontSize: 11,
      fontWeight: '800',
      marginBottom: 2,
    },
    feedbackText: {
      fontSize: 12,
      lineHeight: 16,
    },
    cardFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: colors.borderLight,
    },
    submittedAt: {
      fontSize: 11,
      fontWeight: '500',
    },
    cancelBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: '#ef444410',
    },
    cancelBtnText: {
      color: '#ef4444',
      fontSize: 11,
      fontWeight: '700',
    },
    paginationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 16,
      marginTop: 8,
    },
    pageBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
      borderWidth: 1,
      gap: 4,
    },
    pageBtnDisabled: {
      opacity: 0.4,
    },
    pageBtnText: {
      fontSize: 12,
      fontWeight: '700',
    },
    pageInfoText: {
      fontSize: 12,
      fontWeight: '500',
    },
    emptyBox: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
      paddingVertical: 60,
    },
    emptyIconBg: {
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    emptyTitle: {
      fontSize: 17,
      fontWeight: '800',
      marginBottom: 6,
      textAlign: 'center',
    },
    emptySubtitle: {
      fontSize: 13,
      lineHeight: 19,
      textAlign: 'center',
    },
  });
