import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import moment from 'moment';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
import AttendanceTimelineBar from './AttendanceTimelineBar';
import { isAutoPunchOutRecord } from '../utils/attendanceStatus';

export interface AttendanceRecordItem {
  id: string;
  attendanceDate: string;
  loginTime?: string | null;
  logoutTime?: string | null;
  status?: string | null;
  workedHours?: number | string | null;
  effectiveWorkedHours?: number | string | null;
  isWithinGeofence?: boolean;
  remarks?: string | null;
  isAutoPunchOut?: boolean;
  correctionStatus?: string | null;
  checkInSelfieUrl?: string | null;
  checkOutSelfieUrl?: string | null;
  faceMatchScore?: number | null;
  faceVerified?: boolean | null;
}

interface Props {
  records: AttendanceRecordItem[];
  isLoading?: boolean;
  onRefresh?: () => void;
  officeName?: string;
  officeRadiusMeters?: number;
  shiftStart?: string;
  shiftEnd?: string;
  onRequestCorrection?: (record: AttendanceRecordItem) => void;
  onDateRangeChange?: (startDate: string, endDate: string) => void;
}

export type ViewScope = 'isoWeek' | 'last7' | 'month';
export type StatusFilter = 'all' | 'present' | 'exceptions';

export default function WeeklyAttendanceLog({
  records = [],
  isLoading = false,
  onRefresh,
  officeName = 'Office',
  officeRadiusMeters = 200,
  shiftStart = '09:00:00',
  shiftEnd = '18:00:00',
  onRequestCorrection,
  onDateRangeChange,
}: Props) {
  const { colors, accentColors, isDark } = useAppTheme();
  const [viewScope, setViewScope] = useState<ViewScope>('isoWeek');
  const [selectedMonth, setSelectedMonth] = useState(() => moment().format('YYYY-MM'));
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const handleScopeChange = (scope: ViewScope) => {
    setViewScope(scope);
    if (scope === 'isoWeek') {
      const start = moment().startOf('isoWeek').format('YYYY-MM-DD');
      const end = moment().format('YYYY-MM-DD');
      onDateRangeChange?.(start, end);
    } else if (scope === 'last7') {
      const start = moment().subtract(6, 'days').format('YYYY-MM-DD');
      const end = moment().format('YYYY-MM-DD');
      onDateRangeChange?.(start, end);
    } else if (scope === 'month') {
      const start = moment(selectedMonth, 'YYYY-MM').startOf('month').format('YYYY-MM-DD');
      const end = moment(selectedMonth, 'YYYY-MM').endOf('month').format('YYYY-MM-DD');
      onDateRangeChange?.(start, end);
    }
  };

  const handleNavigateMonth = (direction: -1 | 1) => {
    const next = moment(selectedMonth, 'YYYY-MM').add(direction, 'months');
    if (direction === 1 && next.isAfter(moment(), 'month')) return;
    const nextMonthStr = next.format('YYYY-MM');
    setSelectedMonth(nextMonthStr);
    const start = next.clone().startOf('month').format('YYYY-MM-DD');
    const end = next.clone().endOf('month').format('YYYY-MM-DD');
    onDateRangeChange?.(start, end);
  };

  // Generate days based on selected scope
  const dayItems = useMemo(() => {
    const today = moment();
    const todayStr = today.format('YYYY-MM-DD');
    const dates: moment.Moment[] = [];

    if (viewScope === 'isoWeek') {
      const start = moment().startOf('isoWeek');
      for (let i = 0; i < 7; i++) {
        const d = start.clone().add(i, 'days');
        if (d.isAfter(today, 'day')) break;
        dates.push(d);
      }
    } else if (viewScope === 'last7') {
      for (let i = 6; i >= 0; i--) {
        dates.push(today.clone().subtract(i, 'days'));
      }
    } else {
      const m = moment(selectedMonth, 'YYYY-MM');
      const daysInMonth = m.daysInMonth();
      const isThisMonth = m.isSame(today, 'month');
      const maxDay = isThisMonth ? today.date() : daysInMonth;

      for (let day = 1; day <= maxDay; day++) {
        dates.push(m.clone().date(day));
      }
    }

    // Build lookup map from records
    const map = new Map<string, AttendanceRecordItem>();
    records.forEach((r) => {
      if (r.attendanceDate) {
        map.set(r.attendanceDate, r);
      }
    });

    return dates.reverse().map((d) => {
      const dateStr = d.format('YYYY-MM-DD');
      const isToday = dateStr === todayStr;
      const isWeekend = [0, 6].includes(d.day());
      const rec = map.get(dateStr);

      const autoPunch = isAutoPunchOutRecord(
        rec || { attendanceDate: dateStr, status: 'not_started' },
        shiftEnd
      );

      let effectiveStatus: string = 'absent';
      if (rec?.status === 'leave' || rec?.status === 'holiday') {
        effectiveStatus = rec.status;
      } else if (isWeekend && !rec?.loginTime) {
        effectiveStatus = 'weekend';
      } else if (autoPunch) {
        effectiveStatus = 'auto_punch_out';
      } else if (rec?.loginTime && !rec?.logoutTime && isToday) {
        effectiveStatus = 'in_progress';
      } else if (rec?.status) {
        effectiveStatus = rec.status;
      } else if (rec?.loginTime) {
        effectiveStatus = 'present';
      } else if (isToday) {
        effectiveStatus = 'not_started';
      }

      return {
        date: dateStr,
        dayMoment: d,
        dayName: d.format('ddd'),
        formattedDate: d.format('D MMM'),
        isToday,
        isWeekend,
        record: rec,
        effectiveStatus,
        isAutoPunchOut: autoPunch,
      };
    });
  }, [viewScope, selectedMonth, records, shiftEnd]);

  // KPI Calculations
  const kpis = useMemo(() => {
    let loggedDays = 0;
    let workDaysCount = 0;
    let totalWorkedMinutes = 0;
    let punctualityCount = 0;

    dayItems.forEach((item) => {
      if (!item.isWeekend) {
        workDaysCount++;
      }
      const rec = item.record;
      if (rec && rec.loginTime) {
        loggedDays++;
        const rawHrs = Number(rec.effectiveWorkedHours ?? rec.workedHours ?? 0);
        if (rawHrs > 0) {
          totalWorkedMinutes += rawHrs * 60;
        } else if (rec.loginTime && rec.logoutTime) {
          const s = moment(`${rec.attendanceDate} ${rec.loginTime}`, ['YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DD HH:mm']);
          const e = moment(`${rec.attendanceDate} ${rec.logoutTime}`, ['YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DD HH:mm']);
          if (s.isValid() && e.isValid()) {
            totalWorkedMinutes += Math.max(0, e.diff(s, 'minutes'));
          }
        } else if (item.isToday) {
          const s = moment(`${rec.attendanceDate} ${rec.loginTime}`, ['YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DD HH:mm']);
          if (s.isValid()) {
            totalWorkedMinutes += Math.max(0, moment().diff(s, 'minutes'));
          }
        }

        if (rec.status !== 'late_login' && !item.isAutoPunchOut) {
          punctualityCount++;
        }
      }
    });

    const totalHours = Math.round((totalWorkedMinutes / 60) * 10) / 10;
    const avgDailyHours = loggedDays > 0 ? (totalHours / loggedDays).toFixed(1) : '0.0';
    const shiftHealth = loggedDays > 0 ? Math.round((punctualityCount / loggedDays) * 100) : 100;

    return {
      loggedDays,
      workDaysCount: Math.max(workDaysCount, 1),
      totalHours: `${totalHours}h`,
      avgDailyHours: `${avgDailyHours}h`,
      shiftHealth: `${shiftHealth}%`,
    };
  }, [dayItems]);

  // Filtered day items
  const filteredDays = useMemo(() => {
    if (statusFilter === 'present') {
      return dayItems.filter((i) => i.effectiveStatus === 'present' || i.effectiveStatus === 'in_progress');
    }
    if (statusFilter === 'exceptions') {
      return dayItems.filter((i) =>
        ['auto_punch_out', 'late_login', 'early_logout', 'half_day', 'absent'].includes(i.effectiveStatus)
      );
    }
    return dayItems;
  }, [dayItems, statusFilter]);

  const getStatusBadgeConfig = (status: string, isToday: boolean) => {
    switch (status) {
      case 'present':
        return { label: 'PRESENT', bg: 'rgba(16, 185, 129, 0.12)', text: '#10b981', border: '#10b98140', icon: 'checkmark-circle' as const };
      case 'auto_punch_out':
        return { label: 'AUTO PUNCH OUT', bg: 'rgba(249, 115, 22, 0.12)', text: '#f97316', border: '#f9731640', icon: 'log-out-outline' as const };
      case 'in_progress':
        return { label: 'IN PROGRESS', bg: 'rgba(6, 182, 212, 0.12)', text: '#06b6d4', border: '#06b6d440', icon: 'time-outline' as const };
      case 'weekend':
        return { label: 'WEEKEND OFF', bg: isDark ? 'rgba(148, 163, 184, 0.12)' : '#f1f5f9', text: '#94a3b8', border: '#94a3b830', icon: 'cafe-outline' as const };
      case 'half_day':
        return { label: 'HALF DAY', bg: 'rgba(245, 158, 11, 0.12)', text: '#f59e0b', border: '#f59e0b40', icon: 'pie-chart-outline' as const };
      case 'late_login':
        return { label: 'LATE ENTRY', bg: 'rgba(245, 158, 11, 0.12)', text: '#f59e0b', border: '#f59e0b40', icon: 'alert-circle-outline' as const };
      case 'early_logout':
        return { label: 'EARLY EXIT', bg: 'rgba(245, 158, 11, 0.12)', text: '#f59e0b', border: '#f59e0b40', icon: 'alert-circle-outline' as const };
      case 'leave':
        return { label: 'ON LEAVE', bg: 'rgba(249, 115, 22, 0.12)', text: '#f97316', border: '#f9731640', icon: 'airplane-outline' as const };
      case 'holiday':
        return { label: 'HOLIDAY', bg: 'rgba(139, 92, 246, 0.12)', text: '#8b5cf6', border: '#8b5cf640', icon: 'gift-outline' as const };
      case 'not_started':
        return { label: 'NOT STARTED', bg: 'rgba(148, 163, 184, 0.12)', text: '#64748b', border: '#64748b30', icon: 'time-outline' as const };
      case 'absent':
      default:
        return { label: 'ABSENT', bg: 'rgba(239, 68, 68, 0.12)', text: '#ef4444', border: '#ef444440', icon: 'close-circle-outline' as const };
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
      {/* ── 1. HEADER & VIEW SCOPE SELECTOR ── */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={[styles.indicatorPill, { backgroundColor: accentColors.primary }]} />
          <View>
            <Text style={[styles.title, { color: colors.text }]}>Attendance Logs</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Weekly overview & daily activity records
            </Text>
          </View>
        </View>

        {onRefresh && (
          <TouchableOpacity
            style={[styles.refreshBtn, { backgroundColor: accentColors.light, borderColor: accentColors.primary + '30' }]}
            onPress={onRefresh}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={accentColors.primary} />
            ) : (
              <Ionicons name="refresh" size={14} color={accentColors.primary} />
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Scope Switcher Tabs */}
      <View style={[styles.scopeContainer, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f8fafc', borderColor: colors.borderLight }]}>
        <TouchableOpacity
          style={[styles.scopeBtn, viewScope === 'isoWeek' && { backgroundColor: accentColors.primary }]}
          onPress={() => handleScopeChange('isoWeek')}
        >
          <Text style={[styles.scopeBtnText, { color: viewScope === 'isoWeek' ? '#ffffff' : colors.textSecondary }]}>
            This Week
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.scopeBtn, viewScope === 'last7' && { backgroundColor: accentColors.primary }]}
          onPress={() => handleScopeChange('last7')}
        >
          <Text style={[styles.scopeBtnText, { color: viewScope === 'last7' ? '#ffffff' : colors.textSecondary }]}>
            Last 7 Days
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.scopeBtn, viewScope === 'month' && { backgroundColor: accentColors.primary }]}
          onPress={() => handleScopeChange('month')}
        >
          <Text style={[styles.scopeBtnText, { color: viewScope === 'month' ? '#ffffff' : colors.textSecondary }]}>
            Monthly
          </Text>
        </TouchableOpacity>
      </View>

      {/* Month Navigator (When Monthly is selected) */}
      {viewScope === 'month' && (
        <View style={styles.monthNavRow}>
          <TouchableOpacity
            style={[styles.monthNavBtn, { borderColor: colors.borderLight }]}
            onPress={() => handleNavigateMonth(-1)}
          >
            <Ionicons name="chevron-back" size={16} color={colors.text} />
          </TouchableOpacity>

          <Text style={[styles.monthNavLabel, { color: colors.text }]}>
            {moment(selectedMonth, 'YYYY-MM').format('MMMM YYYY')}
          </Text>

          <TouchableOpacity
            style={[
              styles.monthNavBtn,
              { borderColor: colors.borderLight },
              moment(selectedMonth, 'YYYY-MM').isSame(moment(), 'month') && { opacity: 0.4 },
            ]}
            onPress={() => handleNavigateMonth(1)}
            disabled={moment(selectedMonth, 'YYYY-MM').isSame(moment(), 'month')}
          >
            <Ionicons name="chevron-forward" size={16} color={colors.text} />
          </TouchableOpacity>
        </View>
      )}

      {/* ── 2. KPI SUMMARY METRICS (4 COMPACT TILES) ── */}
      <View style={styles.kpiGrid}>
        {/* KPI 1: Logged Days */}
        <View style={[styles.kpiTile, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc', borderColor: colors.borderLight }]}>
          <View style={styles.kpiIconBox}>
            <Ionicons name="calendar-outline" size={15} color={accentColors.primary} />
          </View>
          <Text style={[styles.kpiValue, { color: colors.text }]}>
            {kpis.loggedDays}
            <Text style={[styles.kpiTotal, { color: colors.textMuted }]}>/{kpis.workDaysCount}d</Text>
          </Text>
          <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Logged Days</Text>
        </View>

        {/* KPI 2: Total Hours */}
        <View style={[styles.kpiTile, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc', borderColor: colors.borderLight }]}>
          <View style={styles.kpiIconBox}>
            <Ionicons name="time-outline" size={15} color="#10b981" />
          </View>
          <Text style={[styles.kpiValue, { color: colors.text }]}>{kpis.totalHours}</Text>
          <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Total Hours</Text>
        </View>

        {/* KPI 3: Daily Average */}
        <View style={[styles.kpiTile, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc', borderColor: colors.borderLight }]}>
          <View style={styles.kpiIconBox}>
            <Ionicons name="trending-up-outline" size={15} color="#3b82f6" />
          </View>
          <Text style={[styles.kpiValue, { color: colors.text }]}>{kpis.avgDailyHours}</Text>
          <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Daily Avg</Text>
        </View>

        {/* KPI 4: Shift Health */}
        <View style={[styles.kpiTile, { backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc', borderColor: colors.borderLight }]}>
          <View style={styles.kpiIconBox}>
            <Ionicons name="shield-checkmark-outline" size={15} color="#f59e0b" />
          </View>
          <Text style={[styles.kpiValue, { color: colors.text }]}>{kpis.shiftHealth}</Text>
          <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Shift Health</Text>
        </View>
      </View>

      {/* ── 3. STATUS FILTER CHIPS ── */}
      <View style={styles.filterRow}>
        {(['all', 'present', 'exceptions'] as const).map((filter) => {
          const isSelected = statusFilter === filter;
          const label = filter === 'all' ? 'All Days' : filter === 'present' ? 'Present Only' : 'Exceptions';
          return (
            <TouchableOpacity
              key={filter}
              style={[
                styles.filterChip,
                {
                  backgroundColor: isSelected ? accentColors.light : 'transparent',
                  borderColor: isSelected ? accentColors.primary : colors.borderLight,
                },
              ]}
              onPress={() => setStatusFilter(filter)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  { color: isSelected ? accentColors.primary : colors.textSecondary },
                  isSelected && { fontWeight: '700' },
                ]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── 4. DAY-BY-DAY ACTIVITY LIST ── */}
      <View style={styles.daysList}>
        {filteredDays.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="calendar-outline" size={32} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No attendance records found for this filter.
            </Text>
          </View>
        ) : (
          filteredDays.map((item) => {
            const badge = getStatusBadgeConfig(item.effectiveStatus, item.isToday);
            const rec = item.record;
            const inTimeStr = rec?.loginTime ? moment(rec.loginTime, 'HH:mm:ss').format('hh:mm A') : '—';
            const outTimeStr = rec?.logoutTime ? moment(rec.logoutTime, 'HH:mm:ss').format('hh:mm A') : '—';
            const hrsWorked = rec?.workedHours != null ? `${Number(rec.workedHours).toFixed(1)}h` : '—';

            const canRegularize =
              onRequestCorrection &&
              !item.isWeekend &&
              (item.isAutoPunchOut ||
                item.effectiveStatus === 'absent' ||
                item.effectiveStatus === 'late_login' ||
                item.effectiveStatus === 'early_logout' ||
                item.effectiveStatus === 'half_day' ||
                (rec && !rec.logoutTime && !item.isToday));

            return (
              <View
                key={item.date}
                style={[
                  styles.dayCard,
                  {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#ffffff',
                    borderColor: item.isToday ? accentColors.primary + '50' : colors.borderLight,
                  },
                ]}
              >
                {/* Top Row: Date, Day, Today Pill, Status Badge */}
                <View style={styles.dayCardHeader}>
                  <View style={styles.dateGroup}>
                    <Text style={[styles.dayNameText, { color: colors.text }]}>{item.dayName}</Text>
                    <Text style={[styles.dateSubText, { color: colors.textSecondary }]}>{item.formattedDate}</Text>
                    {item.isToday && (
                      <View style={[styles.todayBadge, { backgroundColor: accentColors.primary }]}>
                        <Text style={styles.todayBadgeText}>TODAY</Text>
                      </View>
                    )}
                  </View>

                  <View
                    style={[
                      styles.statusPill,
                      { backgroundColor: badge.bg, borderColor: badge.border },
                    ]}
                  >
                    <Ionicons name={badge.icon} size={11} color={badge.text} style={{ marginRight: 3 }} />
                    <Text style={[styles.statusPillText, { color: badge.text }]}>{badge.label}</Text>
                  </View>
                </View>

                {/* Middle: In / Out Details & Hours */}
                {!item.isWeekend || rec?.loginTime ? (
                  <View style={styles.punchTimesRow}>
                    <View style={styles.punchCol}>
                      <Text style={[styles.punchColLabel, { color: colors.textMuted }]}>IN</Text>
                      <Text style={[styles.punchColValue, { color: colors.text }]}>{inTimeStr}</Text>
                    </View>

                    <Ionicons name="arrow-forward" size={14} color={colors.textMuted} />

                    <View style={styles.punchCol}>
                      <Text style={[styles.punchColLabel, { color: colors.textMuted }]}>OUT</Text>
                      <Text style={[styles.punchColValue, { color: colors.text }]}>{outTimeStr}</Text>
                    </View>

                    <View style={styles.punchDivider} />

                    <View style={styles.punchCol}>
                      <Text style={[styles.punchColLabel, { color: colors.textMuted }]}>HOURS</Text>
                      <Text style={[styles.punchColValue, { color: accentColors.primary, fontWeight: '700' }]}>
                        {hrsWorked}
                      </Text>
                    </View>
                  </View>
                ) : null}

                {/* 24-Hour Visual Timeline Track */}
                <AttendanceTimelineBar
                  loginTime={rec?.loginTime}
                  logoutTime={rec?.logoutTime}
                  attendanceDate={item.date}
                  status={item.effectiveStatus}
                  shiftStart={shiftStart}
                  shiftEnd={shiftEnd}
                  workedHours={rec?.workedHours}
                  compact={true}
                  showTimeMarkers={false}
                />

                {/* Bottom Row: Geofence status and Regularize Button */}
                <View style={styles.dayCardFooter}>
                  <View style={styles.geoStatusRow}>
                    <Ionicons
                      name={rec?.isWithinGeofence ? 'navigate-circle' : 'alert-circle-outline'}
                      size={13}
                      color={rec?.isWithinGeofence ? '#10b981' : colors.textMuted}
                    />
                    <Text
                      style={[
                        styles.geoStatusText,
                        { color: rec?.isWithinGeofence ? '#10b981' : colors.textMuted },
                      ]}
                    >
                      {rec?.isWithinGeofence
                        ? 'Inside Office Range'
                        : rec?.loginTime
                        ? 'Outside Perimeter'
                        : 'No GPS punch'}
                    </Text>
                  </View>

                  {canRegularize ? (
                    <TouchableOpacity
                      style={[styles.regularizeBtn, { backgroundColor: accentColors.light, borderColor: accentColors.primary + '30' }]}
                      onPress={() =>
                        onRequestCorrection?.(
                          rec || {
                            id: `empty-${item.date}`,
                            attendanceDate: item.date,
                            status: item.effectiveStatus,
                          }
                        )
                      }
                      activeOpacity={0.75}
                    >
                      <Ionicons name="create-outline" size={12} color={accentColors.primary} />
                      <Text style={[styles.regularizeBtnText, { color: accentColors.primary }]}>Regularize</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            );
          })
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    marginVertical: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  indicatorPill: {
    width: 4,
    height: 24,
    borderRadius: 2,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  refreshBtn: {
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  scopeContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
    borderWidth: 1,
  },
  scopeBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scopeBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  monthNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  monthNavBtn: {
    padding: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  monthNavLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  kpiGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  kpiTile: {
    flex: 1,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  kpiIconBox: {
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 14,
    fontWeight: '800',
  },
  kpiTotal: {
    fontSize: 10,
    fontWeight: '600',
  },
  kpiLabel: {
    fontSize: 9,
    fontWeight: '600',
    marginTop: 2,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '500',
  },
  daysList: {
    gap: 10,
  },
  emptyBox: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 12,
    textAlign: 'center',
  },
  dayCard: {
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
  },
  dayCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  dateGroup: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  dayNameText: {
    fontSize: 14,
    fontWeight: '800',
  },
  dateSubText: {
    fontSize: 12,
    fontWeight: '500',
  },
  todayBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
  },
  todayBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#ffffff',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  punchTimesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    marginVertical: 4,
  },
  punchCol: {
    alignItems: 'center',
  },
  punchColLabel: {
    fontSize: 9,
    fontWeight: '600',
    marginBottom: 1,
  },
  punchColValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  punchDivider: {
    width: 1,
    height: 18,
    backgroundColor: 'rgba(148, 163, 184, 0.25)',
  },
  dayCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  geoStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  geoStatusText: {
    fontSize: 10,
    fontWeight: '500',
  },
  regularizeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    borderWidth: 1,
  },
  regularizeBtnText: {
    fontSize: 10,
    fontWeight: '700',
  },
});
