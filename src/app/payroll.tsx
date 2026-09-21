import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  Platform,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';
import * as Linking from 'expo-linking';
import { graphqlRequest } from '../services/api';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAppTheme } from '../context/ThemeContext';
import ScreenHeader from '../components/ScreenHeader';

// =====================================================
// GRAPHQL QUERY
// =====================================================
const PAYROLL_QUERY = `
  query GetMyPayslips {
    myPayslips {
      id
      payrollRun {
        month
        year
      }
      grossEarnings
      totalDeductions
      netPay
      status
      workedDays
      lopDays
      payslipPdf {
        url
        name
      }
      components {
        id
        componentName
        componentCode
        componentType
        amount
      }
    }
  }
`;

// =====================================================
// INTERFACES
// =====================================================
interface PayslipComponent {
  id: string;
  componentName: string;
  componentCode: string;
  componentType: 'earning' | 'deduction';
  amount: number;
}

interface Payslip {
  id: string;
  payrollRun: {
    month: number;
    year: number;
  };
  grossEarnings: number;
  totalDeductions: number;
  netPay: number;
  status: string;
  workedDays: number;
  lopDays: number;
  payslipPdf?: {
    url: string;
    name: string;
  } | null;
  components: PayslipComponent[];
}

interface PayrollData {
  myPayslips: Payslip[];
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// Module-level in-memory cache for instant route revisit
let cachedPayrollData: Payslip[] | null = null;

export default function PayrollScreen() {
  const router = useRouter();
  const { colors, accentColors, isDark } = useAppTheme();
  const styles = getStyles(colors, accentColors, isDark);
  const [payslips, setPayslips] = useState<Payslip[]>(cachedPayrollData || []);
  const [isLoading, setIsLoading] = useState(!cachedPayrollData);
  const [refreshing, setRefreshing] = useState(false);
  const [showSalaries, setShowSalaries] = useState(false);
  const [selectedPayslip, setSelectedPayslip] = useState<Payslip | null>(null);

  const fetchPayrollData = async () => {
    try {
      const response = await graphqlRequest<PayrollData>(PAYROLL_QUERY);
      const list = response.myPayslips || [];
      cachedPayrollData = list;
      setPayslips(list);
    } catch (error: any) {
      console.error('Error fetching payslips:', error);
      if (!cachedPayrollData) {
        Alert.alert('Error', 'Failed to fetch payroll history.');
      }
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchPayrollData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPayrollData();
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'paid':
      case 'released':
      case 'approved':
        return { text: '#10b981', bg: '#10b98115' };
      case 'draft':
      case 'pending':
        return { text: '#f59e0b', bg: '#f59e0b15' };
      default:
        return { text: '#ef4444', bg: '#ef444415' };
    }
  };

  const formatCurrency = (val: number) => {
    return '₹' + Number(val).toLocaleString('en-IN', {
      maximumFractionDigits: 2,
    });
  };

  const handleDownloadPayslip = async (payslip: Payslip) => {
    const month = MONTH_NAMES[payslip.payrollRun.month - 1];
    const year = payslip.payrollRun.year;

    if (payslip.payslipPdf?.url) {
      try {
        Alert.alert('Opening Payslip', `Opening official PDF for ${month} ${year}...`);
        await Linking.openURL(payslip.payslipPdf.url);
      } catch (err: any) {
        console.error('Failed to open payslip URL:', err);
        Alert.alert('Download Error', 'Unable to open payslip PDF link directly.');
      }
    } else {
      try {
        const earningsStr = payslip.components
          ?.filter((c) => c.componentType === 'earning')
          .map((c) => `  - ${c.componentName}: ${formatCurrency(c.amount)}`)
          .join('\n');
        const deductionsStr = payslip.components
          ?.filter((c) => c.componentType === 'deduction')
          .map((c) => `  - ${c.componentName}: ${formatCurrency(c.amount)}`)
          .join('\n');

        const summaryText = `=========================================
TEAMZEN WORKPLACE PAYSLIP
Period: ${month} ${year}
Status: ${payslip.status.toUpperCase()}
=========================================
Worked Days: ${payslip.workedDays}
Loss of Pay (LOP) Days: ${payslip.lopDays}

EARNINGS:
${earningsStr || '  None'}
Gross Earnings: ${formatCurrency(payslip.grossEarnings)}

DEDUCTIONS:
${deductionsStr || '  None'}
Total Deductions: ${formatCurrency(payslip.totalDeductions)}

-----------------------------------------
NET TAKE-HOME PAY: ${formatCurrency(payslip.netPay)}
=========================================
Generated via Teamzen Employee Mobile App
`;
        await Share.share({
          title: `Payslip - ${month} ${year}`,
          message: summaryText,
        });
      } catch (err: any) {
        Alert.alert('Error', err.message || 'Unable to download payslip.');
      }
    }
  };

  const handleDiscussWithAI = (payslip: Payslip) => {
    setSelectedPayslip(null);
    const month = MONTH_NAMES[payslip.payrollRun.month - 1];
    const year = payslip.payrollRun.year;
    const query = `Explain my payslip for ${month} ${year} in detail. My net pay is ${formatCurrency(payslip.netPay)} with ${payslip.workedDays} worked days and ${payslip.lopDays} LOP days.`;
    
    router.push({
      pathname: '/chat',
      params: { initialQuery: query }
    });
  };

  if (isLoading && payslips.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={accentColors.primary} />
      </View>
    );
  }

  const latestPayslip = payslips.length > 0 ? payslips[0] : null;
  const previousPayslips = payslips.length > 1 ? payslips.slice(1) : [];

  return (
    <SafeAreaView style={styles.safeContainer} edges={['top', 'bottom', 'left', 'right']}>
      {/* Reusable Uniform ScreenHeader */}
      <ScreenHeader
        title="Payroll History"
        subtitle="Monthly payslips & salary statements"
        showBack={true}
        showNotifications={true}
        rightElement={
          <TouchableOpacity 
            style={[styles.privacyToggle, { backgroundColor: accentColors.light, borderColor: accentColors.primary }]}
            onPress={() => setShowSalaries(!showSalaries)}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={showSalaries ? "Hide Salaries" : "Reveal Salaries"}
          >
            <Ionicons name={showSalaries ? "eye-off" : "eye"} size={16} color={accentColors.primary} />
            <Text style={[styles.privacyText, { color: accentColors.primary }]}>
              {showSalaries ? "Hide" : "Reveal"}
            </Text>
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accentColors.primary} />
        }
      >
        {/* Latest Paycheck Card */}
        {latestPayslip ? (
          <View style={styles.latestCard}>
            <View style={styles.latestHeader}>
              <View>
                <Text style={styles.latestMonth}>
                  {MONTH_NAMES[latestPayslip.payrollRun.month - 1]} {latestPayslip.payrollRun.year}
                </Text>
                <Text style={styles.latestSub}>Latest Disbursed Paycheck</Text>
              </View>
              
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(latestPayslip.status).bg }]}>
                <Text style={[styles.statusBadgeText, { color: getStatusColor(latestPayslip.status).text }]}>
                  {latestPayslip.status.toUpperCase()}
                </Text>
              </View>
            </View>

            <View style={styles.netPayContainer}>
              <Text style={styles.netPayLabel}>Net Salary Payout</Text>
              <Text style={styles.netPayValue}>
                {showSalaries ? formatCurrency(latestPayslip.netPay) : '₹ ••••••••'}
              </Text>
            </View>

            <View style={styles.latestStatsGrid}>
              <View style={styles.latestStatBox}>
                <Text style={styles.latestStatLabel}>Gross Pay</Text>
                <Text style={styles.latestStatValue}>
                  {showSalaries ? formatCurrency(latestPayslip.grossEarnings) : '₹ ••••'}
                </Text>
              </View>
              <View style={styles.latestStatBox}>
                <Text style={styles.latestStatLabel}>Deductions</Text>
                <Text style={[styles.latestStatValue, { color: '#ef4444' }]}>
                  {showSalaries ? formatCurrency(latestPayslip.totalDeductions) : '₹ ••••'}
                </Text>
              </View>
              <View style={styles.latestStatBox}>
                <Text style={styles.latestStatLabel}>Worked Days</Text>
                <Text style={styles.latestStatValue}>{latestPayslip.workedDays} Days</Text>
              </View>
            </View>

            <View style={styles.latestActionsRow}>
              <TouchableOpacity 
                style={styles.viewDetailsBtn}
                onPress={() => setSelectedPayslip(latestPayslip)}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="View Payslip Components"
              >
                <Ionicons name="receipt-outline" size={15} color="#ffffff" style={{ marginRight: 4 }} />
                <Text style={styles.viewDetailsBtnText}>Components</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.downloadBtn, { backgroundColor: accentColors.light, borderColor: accentColors.primary }]}
                onPress={() => handleDownloadPayslip(latestPayslip)}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Download Payslip"
              >
                <Ionicons name="download-outline" size={15} color={accentColors.primary} style={{ marginRight: 4 }} />
                <Text style={[styles.downloadBtnText, { color: accentColors.primary }]}>Download</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.aiDiscussBtn}
                onPress={() => handleDiscussWithAI(latestPayslip)}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Audit Payslip with AI"
              >
                <Ionicons name="sparkles" size={13} color="#ffffff" style={{ marginRight: 4 }} />
                <Text style={styles.aiDiscussBtnText}>Audit AI</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="wallet-outline" size={40} color="#64748b" />
            <Text style={styles.emptyText}>No payslips released in this cycle.</Text>
          </View>
        )}

        {/* Previous Paychecks List */}
        <Text style={styles.sectionTitle}>Previous Paychecks</Text>
        
        {previousPayslips.length > 0 ? (
          <View style={styles.historyList}>
            {previousPayslips.map((slip) => {
              const monthName = MONTH_NAMES[slip.payrollRun.month - 1];
              return (
                <TouchableOpacity 
                  key={slip.id} 
                  style={styles.historyRow}
                  onPress={() => setSelectedPayslip(slip)}
                >
                  <View style={styles.historyIconWrapper}>
                    <Ionicons name="calendar" size={18} color={accentColors.primary} />
                  </View>
                  
                  <View style={styles.historyMeta}>
                    <Text style={styles.historyTitle}>{monthName} {slip.payrollRun.year}</Text>
                    <Text style={styles.historySub}>Worked: {slip.workedDays}d | LOP: {slip.lopDays}d</Text>
                  </View>

                  <View style={styles.historyPayout}>
                    <Text style={styles.historyValue}>
                      {showSalaries ? formatCurrency(slip.netPay) : '₹ ••••'}
                    </Text>
                    <View style={[styles.statusBadgeMini, { backgroundColor: getStatusColor(slip.status).bg }]}>
                      <Text style={[styles.statusBadgeTextMini, { color: getStatusColor(slip.status).text }]}>
                        {slip.status}
                      </Text>
                    </View>
                  </View>
                  
                  <Ionicons name="chevron-forward" size={16} color="#64748b" style={{ marginLeft: 8 }} />
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <Text style={styles.emptySubText}>No past payslip history detected.</Text>
        )}

        {/* Payslip Component Breakdown Modal */}
        <Modal
          visible={!!selectedPayslip}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setSelectedPayslip(null)}
        >
          {selectedPayslip && (
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                {/* Modal Header */}
                <View style={styles.modalHeader}>
                  <View>
                    <Text style={styles.modalTitle}>
                      {MONTH_NAMES[selectedPayslip.payrollRun.month - 1]} {selectedPayslip.payrollRun.year}
                    </Text>
                    <Text style={styles.modalSubtitle}>Cycle #{selectedPayslip.id.slice(-6).toUpperCase()}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedPayslip(null)} style={styles.closeBtn}>
                    <Ionicons name="close" size={24} color={colors.text} />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.modalBody}>
                  {/* Attendance info */}
                  <View style={styles.modalDaysRow}>
                    <View style={styles.modalDaysCol}>
                      <Text style={styles.modalDaysLabel}>Worked Days</Text>
                      <Text style={styles.modalDaysValue}>{selectedPayslip.workedDays} Days</Text>
                    </View>
                    <View style={styles.modalDaysDivider} />
                    <View style={styles.modalDaysCol}>
                      <Text style={styles.modalDaysLabel}>Loss of Pay</Text>
                      <Text style={[styles.modalDaysValue, { color: '#f59e0b' }]}>{selectedPayslip.lopDays} Days</Text>
                    </View>
                  </View>

                  {/* Earnings Components */}
                  <Text style={styles.breakdownSectionTitle}>Earnings Breakdown</Text>
                  {selectedPayslip.components?.filter(c => c.componentType === 'earning').map((c) => (
                    <View key={c.id} style={styles.breakdownRow}>
                      <Text style={styles.breakdownName}>{c.componentName}</Text>
                      <Text style={styles.breakdownVal}>{showSalaries ? formatCurrency(c.amount) : '₹ ••••'}</Text>
                    </View>
                  ))}
                  <View style={styles.breakdownSubtotal}>
                    <Text style={styles.subtotalLabel}>Gross Earnings</Text>
                    <Text style={styles.subtotalVal}>
                      {showSalaries ? formatCurrency(selectedPayslip.grossEarnings) : '₹ ••••••••'}
                    </Text>
                  </View>

                  {/* Deductions Components */}
                  <Text style={styles.breakdownSectionTitle}>Deductions Breakdown</Text>
                  {selectedPayslip.components?.filter(c => c.componentType === 'deduction').map((c) => (
                    <View key={c.id} style={styles.breakdownRow}>
                      <Text style={styles.breakdownName}>{c.componentName}</Text>
                      <Text style={[styles.breakdownVal, { color: '#ef4444' }]}>
                        {showSalaries ? `- ${formatCurrency(c.amount)}` : '₹ ••••'}
                      </Text>
                    </View>
                  ))}
                  <View style={styles.breakdownSubtotal}>
                    <Text style={styles.subtotalLabel}>Total Deductions</Text>
                    <Text style={[styles.subtotalVal, { color: '#ef4444' }]}>
                      {showSalaries ? formatCurrency(selectedPayslip.totalDeductions) : '₹ ••••••••'}
                    </Text>
                  </View>

                  {/* Net Pay Calculation block */}
                  <View style={styles.calculationBlock}>
                    <View style={styles.calcMathRow}>
                      <Text style={styles.calcMathLabel}>Gross Salary</Text>
                      <Text style={styles.calcMathVal}>
                        {showSalaries ? formatCurrency(selectedPayslip.grossEarnings) : '₹ ••••'}
                      </Text>
                    </View>
                    <View style={styles.calcMathRow}>
                      <Text style={styles.calcMathLabel}>Less Deductions</Text>
                      <Text style={[styles.calcMathVal, { color: '#ef4444' }]}>
                        {showSalaries ? `- ${formatCurrency(selectedPayslip.totalDeductions)}` : '₹ ••••'}
                      </Text>
                    </View>
                    <View style={styles.calcDivider} />
                    <View style={styles.calcFinalRow}>
                      <Text style={styles.calcFinalLabel}>Net Take-Home Pay</Text>
                      <Text style={styles.calcFinalVal}>
                        {showSalaries ? formatCurrency(selectedPayslip.netPay) : '₹ ••••••••'}
                      </Text>
                    </View>
                  </View>
                </ScrollView>

                {/* Modal Footer Actions */}
                <View style={styles.modalFooter}>
                  <TouchableOpacity 
                    style={[styles.modalDownloadBtn, { backgroundColor: accentColors.primary }]}
                    onPress={() => handleDownloadPayslip(selectedPayslip)}
                    accessible={true}
                    accessibilityRole="button"
                    accessibilityLabel="Download Official Payslip PDF"
                  >
                    <Ionicons name="download-outline" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                    <Text style={styles.modalDownloadBtnText}>Download Official Payslip</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={styles.modalAiBtn}
                    onPress={() => handleDiscussWithAI(selectedPayslip)}
                    accessible={true}
                    accessibilityRole="button"
                    accessibilityLabel="Audit Paycheck with Chatbot"
                  >
                    <Ionicons name="chatbox-ellipses-outline" size={16} color="#8b5cf6" style={{ marginRight: 6 }} />
                    <Text style={styles.modalAiBtnText}>Audit Paycheck with AI</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </Modal>
      </ScrollView>
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
    padding: 16,
    paddingBottom: 40,
  },
  privacyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerLabel: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  privacyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: accentColors.light,
    borderWidth: 1,
    borderColor: accentColors.primary + '35',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  privacyText: {
    color: accentColors.primary,
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 6,
  },
  latestCard: {
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    padding: 20,
    marginBottom: 26,
    shadowColor: accentColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  latestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 14,
    marginBottom: 16,
  },
  latestMonth: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  latestSub: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
    fontWeight: '500',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  netPayContainer: {
    alignItems: 'center',
    marginVertical: 10,
  },
  netPayLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  netPayValue: {
    color: '#10b981',
    fontSize: 28,
    fontWeight: '900',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  latestStatsGrid: {
    flexDirection: 'row',
    backgroundColor: isDark ? '#0a0f1d50' : '#f1f5f980',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 6,
    marginTop: 10,
    marginBottom: 20,
  },
  latestStatBox: {
    flex: 1,
    alignItems: 'center',
  },
  latestStatLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: 'bold',
  },
  latestStatValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  latestActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  viewDetailsBtn: {
    flex: 1.1,
    flexDirection: 'row',
    backgroundColor: accentColors.primary,
    borderRadius: 12,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewDetailsBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  downloadBtn: {
    flex: 1.1,
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  downloadBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  aiDiscussBtn: {
    flex: 0.9,
    flexDirection: 'row',
    backgroundColor: '#8b5cf6',
    borderRadius: 12,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  aiDiscussBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyCard: {
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 26,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 10,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 14,
  },
  historyList: {
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    overflow: 'hidden',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  historyIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: accentColors.light,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  historyMeta: {
    flex: 1,
  },
  historyTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  historySub: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
    fontWeight: '500',
  },
  historyPayout: {
    alignItems: 'flex-end',
  },
  historyValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'right',
  },
  statusBadgeMini: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 3,
    alignSelf: 'flex-end',
  },
  statusBadgeTextMini: {
    fontSize: 8,
    fontWeight: 'bold',
  },
  emptySubText: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginVertical: 20,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.backgroundCard,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  modalSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.cardElement,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  modalDaysRow: {
    flexDirection: 'row',
    backgroundColor: isDark ? '#0a0f1d50' : '#f1f5f980',
    borderRadius: 14,
    paddingVertical: 12,
    marginTop: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalDaysCol: {
    flex: 1,
    alignItems: 'center',
  },
  modalDaysLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: 'bold',
  },
  modalDaysValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
  },
  modalDaysDivider: {
    width: 1,
    backgroundColor: colors.border,
  },
  breakdownSectionTitle: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 0.5,
    marginTop: 10,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border + '80',
  },
  breakdownName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '500',
  },
  breakdownVal: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  breakdownSubtotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    marginBottom: 20,
  },
  subtotalLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: 'bold',
  },
  subtotalVal: {
    color: colors.text,
    fontSize: 13,
    fontWeight: 'bold',
  },
  calculationBlock: {
    backgroundColor: isDark ? '#0a0f1d60' : '#f8fafc',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginVertical: 14,
  },
  calcMathRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  calcMathLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  calcMathVal: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  calcDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 10,
  },
  calcFinalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  calcFinalLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  calcFinalVal: {
    color: '#10b981',
    fontSize: 18,
    fontWeight: '900',
  },
  modalFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 20,
    backgroundColor: colors.tabBarBg,
  },
  modalDownloadBtn: {
    flexDirection: 'row',
    borderRadius: 14,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalDownloadBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  modalAiBtn: {
    flexDirection: 'row',
    backgroundColor: '#8b5cf615',
    borderWidth: 1,
    borderColor: '#8b5cf635',
    borderRadius: 14,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalAiBtnText: {
    color: '#8b5cf6',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
