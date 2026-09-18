import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { graphqlRequest } from '../../services/api';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Sidebar from '../../components/Sidebar';
import { useAppTheme } from '../../context/ThemeContext';
import ScreenHeader from '../../components/ScreenHeader';

const LEAVE_PORTAL_QUERY = `
  query GetLeavePortalData {
    leaveBalance {
      id
      leaveType {
        id
        name
        code
      }
      totalEntitled
      used
      availableBalance
    }
    getLeaveRequests(approvalsOnly: false) {
      id
      fromDate
      toDate
      reason
      durationDays
      status
      leaveType {
        name
        code
      }
    }
  }
`;

const CREATE_LEAVE_MUTATION = `
  mutation CreateLeaveRequest($input: LeaveRequestInput!) {
    createLeaveRequest(input: $input) {
      id
      status
    }
  }
`;

const CANCEL_LEAVE_MUTATION = `
  mutation CancelLeaveRequest($requestId: ID!) {
    cancelLeaveRequest(requestId: $requestId) {
      id
      status
    }
  }
`;

interface LeaveRequest {
  id: string;
  fromDate: string;
  toDate: string;
  reason: string;
  durationDays: number;
  status: string;
  leaveType: {
    name: string;
    code: string;
  };
}

interface LeaveBalance {
  id: string;
  leaveType: {
    id: string;
    name: string;
    code: string;
  };
  totalEntitled: number;
  used: number;
  availableBalance: number;
}

interface LeavePortalData {
  leaveBalance: LeaveBalance[];
  getLeaveRequests: LeaveRequest[];
}

// Module-level in-memory cache for instant route revisit
let cachedLeaveData: LeavePortalData | null = null;

export default function LeaveScreen() {
  const router = useRouter();
  const { colors, accentColors, isDark } = useAppTheme();
  const styles = getStyles(colors, accentColors, isDark);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [data, setData] = useState<LeavePortalData | null>(cachedLeaveData);
  const [isLoading, setIsLoading] = useState(!cachedLeaveData);
  const [refreshing, setRefreshing] = useState(false);
  
  // Pagination & Filter states
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'>('ALL');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const PAGE_SIZE = 4;

  // Apply Leave form states
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedLeaveTypeId, setSelectedLeaveTypeId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchLeaveData = async () => {
    try {
      const response = await graphqlRequest<LeavePortalData>(LEAVE_PORTAL_QUERY);
      cachedLeaveData = response;
      setData(response);
      
      if (response.leaveBalance.length > 0 && !selectedLeaveTypeId) {
        setSelectedLeaveTypeId(response.leaveBalance[0].leaveType.id);
      }
    } catch (error) {
      console.error('Failed to load leave details:', error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLeaveData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchLeaveData();
  };

  const handleApplyLeave = async () => {
    if (!fromDate || !toDate || !reason || !selectedLeaveTypeId) {
      Alert.alert('Error', 'Please fill in all the details.');
      return;
    }

    // Validate date format YYYY-MM-DD
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(fromDate) || !dateRegex.test(toDate)) {
      Alert.alert('Invalid Date Format', 'Please enter dates in YYYY-MM-DD format.');
      return;
    }

    setIsSubmitting(true);
    try {
      await graphqlRequest(CREATE_LEAVE_MUTATION, {
        input: {
          leaveTypeId: selectedLeaveTypeId,
          fromDate,
          toDate,
          reason,
          halfDayPeriod: 'full_day',
        },
      });

      Alert.alert('Success', 'Leave request submitted successfully.');
      setIsModalVisible(false);
      // Reset form
      setFromDate('');
      setToDate('');
      setReason('');
      fetchLeaveData();
    } catch (error: any) {
      Alert.alert('Submission Failed', error.message || 'Check leave balance or date clashes.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelLeave = async (id: string) => {
    Alert.alert('Cancel Request', 'Are you sure you want to cancel this leave request?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel',
        style: 'destructive',
        onPress: async () => {
          setIsLoading(true);
          try {
            await graphqlRequest(CANCEL_LEAVE_MUTATION, { requestId: id });
            Alert.alert('Cancelled', 'Leave request has been cancelled.');
            fetchLeaveData();
          } catch (error: any) {
            Alert.alert('Failed', error.message || 'Could not cancel request.');
            setIsLoading(false);
          }
        },
      },
    ]);
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'approved':
        return '#10b981';
      case 'pending':
        return '#f59e0b';
      case 'rejected':
      case 'cancelled':
        return '#ef4444';
      default:
        return '#64748b';
    }
  };

  if (isLoading && !data) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={accentColors.primary} />
      </View>
    );
  }

  const allRequests = data?.getLeaveRequests || [];
  const filteredRequests = statusFilter === 'ALL'
    ? allRequests
    : allRequests.filter((r) => r.status.toUpperCase() === statusFilter);
  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / PAGE_SIZE));
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const paginatedRequests = filteredRequests.slice(startIndex, startIndex + PAGE_SIZE);

  return (
    <SafeAreaView style={styles.safeContainer} edges={['top', 'bottom', 'left', 'right']}>
      {/* Reusable Uniform ScreenHeader */}
      <ScreenHeader
        title="Leaves"
        subtitle="Time-off balances & requests"
        showBack={true}
        showMenu={false}
        showNotifications={true}
        onMenu={() => setIsSidebarOpen(true)}
        rightElement={
          <TouchableOpacity
            style={[styles.applyHeaderBtn, { backgroundColor: accentColors.primary }]}
            onPress={() => setIsModalVisible(true)}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Apply for Leave"
          >
            <Ionicons name="add" size={16} color="#ffffff" style={{ marginRight: 4 }} />
            <Text style={styles.applyHeaderBtnText}>Apply</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accentColors.primary} />
        }
      >
        {/* Leave Balances Horizontal Scroll */}
        <Text style={styles.sectionTitle}>Leave Balances</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.balanceScroll}>
          {data?.leaveBalance.map((item) => (
            <View key={item.id} style={styles.balanceCard}>
              <Text style={styles.balanceCode}>{item.leaveType.code}</Text>
              <Text style={styles.balanceName}>{item.leaveType.name}</Text>
              <View style={styles.balanceStats}>
                <View style={styles.balanceStatCol}>
                  <Text style={styles.statLabel}>Allocated</Text>
                  <Text style={styles.statVal}>{item.totalEntitled}</Text>
                </View>
                <View style={styles.balanceStatDivider} />
                <View style={styles.balanceStatCol}>
                  <Text style={styles.statLabel}>Remaining</Text>
                  <Text style={[styles.statVal, { color: '#10b981', fontWeight: 'bold' }]}>
                    {item.availableBalance}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>

        {/* Requests header with Status Filter Chips */}
        <View style={styles.requestsHeader}>
          <Text style={styles.sectionTitle}>My Requests ({filteredRequests.length})</Text>
        </View>

        {/* Status Filter Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterScrollContent}>
          {(['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const).map((status) => {
            const isSelected = statusFilter === status;
            return (
              <TouchableOpacity
                key={status}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: isSelected ? accentColors.primary : colors.backgroundCard,
                    borderColor: isSelected ? accentColors.primary : colors.border,
                  },
                ]}
                onPress={() => {
                  setStatusFilter(status);
                  setCurrentPage(1);
                }}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={`Filter by ${status}`}
              >
                <Text style={[styles.filterChipText, { color: isSelected ? '#ffffff' : colors.textSecondary }]}>
                  {status.charAt(0) + status.slice(1).toLowerCase()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Paginated Requests List */}
        {paginatedRequests.length > 0 ? (
          paginatedRequests.map((req) => (
            <View key={req.id} style={styles.requestCard}>
              <View style={styles.reqHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.reqType}>{req.leaveType.name} ({req.leaveType.code})</Text>
                  <View style={styles.reqDatesRow}>
                    <Ionicons name="calendar-outline" size={13} color={colors.textSecondary} style={{ marginRight: 4 }} />
                    <Text style={styles.reqDates}>
                      {req.fromDate} → {req.toDate}
                    </Text>
                  </View>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: `${getStatusColor(req.status)}15` },
                  ]}
                >
                  <Text style={[styles.statusBadgeText, { color: getStatusColor(req.status) }]}>
                    {req.status.toUpperCase()}
                  </Text>
                </View>
              </View>
              
              <Text style={styles.reqReason}>Reason: {req.reason}</Text>
              <Text style={styles.reqDuration}>Duration: {req.durationDays} day(s)</Text>

              {req.status.toLowerCase() === 'pending' && (
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => handleCancelLeave(req.id)}
                  accessible={true}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel Leave Request"
                >
                  <Text style={styles.cancelBtnText}>Cancel Request</Text>
                </TouchableOpacity>
              )}
            </View>
          ))
        ) : (
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text" size={40} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {statusFilter === 'ALL' ? "You haven't requested any leaves yet." : `No ${statusFilter.toLowerCase()} leave requests found.`}
            </Text>
          </View>
        )}

        {/* Pagination Controls Bar */}
        {filteredRequests.length > 0 && (
          <View style={styles.paginationContainer}>
            <Text style={[styles.paginationInfo, { color: colors.textSecondary }]}>
              Showing {startIndex + 1}–{Math.min(startIndex + PAGE_SIZE, filteredRequests.length)} of {filteredRequests.length}
            </Text>

            <View style={styles.paginationControls}>
              <TouchableOpacity
                style={[
                  styles.pageBtn,
                  { borderColor: colors.border, backgroundColor: colors.backgroundCard },
                  currentPage <= 1 && styles.pageBtnDisabled,
                ]}
                onPress={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Previous page"
              >
                <Ionicons name="chevron-back" size={16} color={currentPage <= 1 ? colors.textMuted : colors.text} />
              </TouchableOpacity>

              <View style={[styles.pageIndicator, { backgroundColor: accentColors.light, borderColor: accentColors.primary }]}>
                <Text style={[styles.pageIndicatorText, { color: accentColors.primary }]}>
                  {currentPage} / {totalPages}
                </Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.pageBtn,
                  { borderColor: colors.border, backgroundColor: colors.backgroundCard },
                  currentPage >= totalPages && styles.pageBtnDisabled,
                ]}
                onPress={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Next page"
              >
                <Ionicons name="chevron-forward" size={16} color={currentPage >= totalPages ? colors.textMuted : colors.text} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Apply Leave Modal */}
      <Modal
        visible={isModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Request Leave</Text>
              <TouchableOpacity onPress={() => setIsModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm}>
              {/* Type Select */}
              <Text style={styles.inputLabel}>Leave Category</Text>
              <View style={styles.typeSelectorRow}>
                {data?.leaveBalance.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.typeSelectorBtn,
                      selectedLeaveTypeId === item.leaveType.id && styles.typeSelectorBtnActive,
                    ]}
                    onPress={() => setSelectedLeaveTypeId(item.leaveType.id)}
                  >
                    <Text
                      style={[
                        styles.typeSelectorText,
                        selectedLeaveTypeId === item.leaveType.id && styles.typeSelectorTextActive,
                      ]}
                    >
                      {item.leaveType.code}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Start Date */}
              <Text style={styles.inputLabel}>From Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="2026-06-01"
                placeholderTextColor="#64748b"
                value={fromDate}
                onChangeText={setFromDate}
                autoCapitalize="none"
              />

              {/* End Date */}
              <Text style={styles.inputLabel}>To Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="2026-06-03"
                placeholderTextColor="#64748b"
                value={toDate}
                onChangeText={setToDate}
                autoCapitalize="none"
              />

              {/* Reason */}
              <Text style={styles.inputLabel}>Reason / Remarks</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="Details of your leave request..."
                placeholderTextColor="#64748b"
                value={reason}
                onChangeText={setReason}
                multiline
                numberOfLines={3}
              />

              <View style={styles.tipBox}>
                <Ionicons name="information-circle" size={16} color={accentColors.primary} />
                <Text style={styles.tipText}>
                  System automatically calculates holidays and weekends to deduct eligible balance.
                </Text>
              </View>

              {isSubmitting ? (
                <ActivityIndicator style={{ marginVertical: 20 }} color={accentColors.primary} />
              ) : (
                <TouchableOpacity style={styles.submitBtn} onPress={handleApplyLeave}>
                  <Ionicons name="calendar" size={18} color="#ffffff" style={{ marginRight: 8 }} />
                  <Text style={styles.submitBtnText}>Submit Request</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
    </SafeAreaView>
  );
}

const getStyles = (colors: any, accentColors: any, isDark: boolean) => StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  container: {
    padding: 20,
    paddingBottom: 120,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    marginBottom: 20,
  },
  menuBtn: {
    padding: 6,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  avatarBtn: {
    padding: 6,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  balanceScroll: {
    flexDirection: 'row',
    marginBottom: 28,
  },
  balanceCard: {
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    width: 140,
    marginRight: 12,
  },
  balanceCode: {
    color: accentColors.primary,
    fontSize: 18,
    fontWeight: 'bold',
  },
  balanceName: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
    height: 18,
  },
  balanceStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  balanceStatCol: {
    flex: 1,
    alignItems: 'center',
  },
  balanceStatDivider: {
    width: 1,
    height: 20,
    backgroundColor: colors.border,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 9,
  },
  statVal: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  requestsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  applyHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  applyHeaderBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  filterScroll: {
    marginBottom: 16,
  },
  filterScrollContent: {
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  reqDatesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  paginationInfo: {
    fontSize: 12,
    fontWeight: '500',
  },
  paginationControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pageBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageBtnDisabled: {
    opacity: 0.4,
  },
  pageIndicator: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  pageIndicatorText: {
    fontSize: 12,
    fontWeight: '700',
  },
  requestCard: {
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  reqHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 8,
    marginBottom: 8,
  },
  reqType: {
    color: colors.text,
    fontSize: 14,
    fontWeight: 'bold',
  },
  reqDates: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  reqReason: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },
  reqDuration: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 6,
  },
  cancelBtn: {
    backgroundColor: '#ef444410',
    borderWidth: 1,
    borderColor: '#ef444430',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  cancelBtnText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyContainer: {
    alignItems: 'center',
    backgroundColor: colors.backgroundCard,
    padding: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 10,
    textAlign: 'center',
  },
  /* Modal Overlay Styling */
  modalOverlay: {
    flex: 1,
    backgroundColor: isDark ? 'rgba(0, 0, 0, 0.75)' : 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.backgroundCard,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingBottom: 30,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalForm: {
    padding: 20,
  },
  inputLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  typeSelectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  typeSelectorBtn: {
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  typeSelectorBtnActive: {
    backgroundColor: accentColors.light,
    borderColor: accentColors.primary,
  },
  typeSelectorText: {
    color: colors.textMuted,
    fontWeight: 'bold',
    fontSize: 12,
  },
  typeSelectorTextActive: {
    color: accentColors.primary,
  },
  textInput: {
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    marginBottom: 16,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  tipBox: {
    flexDirection: 'row',
    backgroundColor: accentColors.light,
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  tipText: {
    color: accentColors.primary,
    fontSize: 11,
    flex: 1,
    marginLeft: 6,
  },
  submitBtn: {
    backgroundColor: accentColors.primary,
    height: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
