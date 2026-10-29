import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import moment from 'moment';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
import { isAutoPunchOutRecord } from '../utils/attendanceStatus';

export interface AttendanceTimelineBarProps {
  loginTime?: string | null;
  logoutTime?: string | null;
  attendanceDate?: string;
  status?: string;
  shiftStart?: string;
  shiftEnd?: string;
  workedHours?: number | string | null;
  compact?: boolean;
  showTimeMarkers?: boolean;
}

function timeToMinutes(timeStr?: string | null): number | null {
  if (!timeStr) return null;
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return null;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const seconds = parts[2] ? parseInt(parts[2], 10) : 0;
  if (isNaN(hours) || isNaN(minutes)) return null;
  return hours * 60 + minutes + (seconds > 30 ? 1 : 0);
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  const displayM = m < 10 ? `0${m}` : m;
  return `${displayH}:${displayM} ${period}`;
}

export default function AttendanceTimelineBar({
  loginTime,
  logoutTime,
  attendanceDate,
  status = 'present',
  shiftStart = '09:00:00',
  shiftEnd = '18:00:00',
  workedHours,
  compact = false,
  showTimeMarkers = false,
}: AttendanceTimelineBarProps) {
  const { colors, isDark } = useAppTheme();

  const {
    isWeekend,
    isLeave,
    isAbsent,
    isLive,
    isAutoPunch,
    shiftStartPct,
    shiftWidthPct,
    workStartPct,
    workWidthPct,
    formattedPunchSpan,
  } = useMemo(() => {
    const TOTAL_MINUTES = 1440; // 24 hours
    const shiftStartMin = timeToMinutes(shiftStart) ?? 540; // 09:00 AM
    const shiftEndMin = timeToMinutes(shiftEnd) ?? 1080;   // 06:00 PM

    const sStartPct = Math.max(0, Math.min(100, (shiftStartMin / TOTAL_MINUTES) * 100));
    const sWidthPct = Math.max(0, Math.min(100 - sStartPct, ((shiftEndMin - shiftStartMin) / TOTAL_MINUTES) * 100));

    const todayStr = moment().format('YYYY-MM-DD');
    const isToday = attendanceDate ? attendanceDate === todayStr : false;
    const isWeekendDay =
      status === 'weekend' ||
      (attendanceDate ? [0, 6].includes(moment(attendanceDate).day()) : false);

    const autoPunch = isAutoPunchOutRecord(
      { attendanceDate, loginTime, logoutTime, status },
      shiftEnd
    );

    const isLeaveDay = status === 'leave' || status === 'holiday';
    const isAbsentDay = !isWeekendDay && !isLeaveDay && (status === 'absent' || (!loginTime && !isToday));

    const loginMin = timeToMinutes(loginTime);
    let logoutMin = timeToMinutes(logoutTime);
    let live = false;

    if (loginMin !== null && logoutMin === null) {
      if (isToday) {
        const nowMin = moment().hours() * 60 + moment().minutes();
        logoutMin = Math.min(TOTAL_MINUTES, Math.max(loginMin, nowMin));
        live = true;
      } else {
        logoutMin = Math.max(loginMin, shiftEndMin);
      }
    }

    let wStartPct = 0;
    let wWidthPct = 0;
    let punchSpan = '';

    if (loginMin !== null && logoutMin !== null && logoutMin >= loginMin) {
      wStartPct = Math.max(0, Math.min(100, (loginMin / TOTAL_MINUTES) * 100));
      wWidthPct = Math.max(1.5, Math.min(100 - wStartPct, ((logoutMin - loginMin) / TOTAL_MINUTES) * 100));
      punchSpan = `${minutesToTime(loginMin)} – ${live ? 'Now' : minutesToTime(logoutMin)}`;
    }

    return {
      isWeekend: isWeekendDay,
      isLeave: isLeaveDay,
      isAbsent: isAbsentDay,
      isLive: live,
      isAutoPunch: autoPunch,
      shiftStartPct: sStartPct,
      shiftWidthPct: sWidthPct,
      workStartPct: wStartPct,
      workWidthPct: wWidthPct,
      formattedPunchSpan: punchSpan,
    };
  }, [loginTime, logoutTime, attendanceDate, status, shiftStart, shiftEnd]);

  // Weekend State
  if (isWeekend && !loginTime) {
    return (
      <View style={[styles.badgeContainer, { backgroundColor: isDark ? 'rgba(148, 163, 184, 0.12)' : '#f1f5f9' }]}>
        <Ionicons name="cafe-outline" size={14} color="#64748b" style={{ marginRight: 6 }} />
        <Text style={[styles.badgeText, { color: isDark ? '#94a3b8' : '#64748b' }]}>Weekend Off</Text>
      </View>
    );
  }

  // Leave / Holiday State
  if (isLeave && !loginTime) {
    return (
      <View style={[styles.badgeContainer, { backgroundColor: 'rgba(249, 115, 22, 0.12)' }]}>
        <Ionicons name="airplane-outline" size={14} color="#f97316" style={{ marginRight: 6 }} />
        <Text style={[styles.badgeText, { color: '#f97316' }]}>On Leave / Holiday</Text>
      </View>
    );
  }

  // Absent State
  if (isAbsent && !loginTime) {
    return (
      <View style={[styles.badgeContainer, { backgroundColor: 'rgba(239, 68, 68, 0.10)' }]}>
        <Ionicons name="close-circle-outline" size={14} color="#ef4444" style={{ marginRight: 6 }} />
        <Text style={[styles.badgeText, { color: '#ef4444' }]}>Absent (No punch recorded)</Text>
      </View>
    );
  }

  const trackHeight = compact ? 8 : 12;

  // Punch color coding
  const punchColor = isAutoPunch
    ? '#f97316'
    : isLive
    ? '#06b6d4'
    : '#10b981';

  return (
    <View style={styles.container}>
      {/* 24-Hour Track */}
      <View
        style={[
          styles.track,
          {
            height: trackHeight,
            borderRadius: trackHeight / 2,
            backgroundColor: isDark ? '#1e293b' : '#e2e8f0',
          },
        ]}
      >
        {/* Office Shift Target Area */}
        <View
          style={[
            styles.shiftWindow,
            {
              left: `${shiftStartPct}%`,
              width: `${shiftWidthPct}%`,
              height: trackHeight,
              backgroundColor: isDark ? 'rgba(56, 171, 177, 0.15)' : 'rgba(56, 171, 177, 0.20)',
              borderColor: isDark ? 'rgba(56, 171, 177, 0.35)' : 'rgba(56, 171, 177, 0.40)',
            },
          ]}
        />

        {/* Employee Active Punch Segment */}
        {workWidthPct > 0 && (
          <View
            style={[
              styles.workSegment,
              {
                left: `${workStartPct}%`,
                width: `${workWidthPct}%`,
                height: trackHeight,
                borderRadius: trackHeight / 2,
                backgroundColor: punchColor,
              },
            ]}
          />
        )}
      </View>

      {/* Time Markers */}
      {showTimeMarkers && (
        <View style={styles.markersRow}>
          <Text style={[styles.markerText, { color: colors.textMuted }]}>12 AM</Text>
          <Text style={[styles.markerText, { color: colors.textMuted }]}>6 AM</Text>
          <Text style={[styles.markerText, { color: isDark ? '#38abb1' : '#0d9488', fontWeight: '700' }]}>
            09:00 AM
          </Text>
          <Text style={[styles.markerText, { color: colors.textMuted }]}>12 PM</Text>
          <Text style={[styles.markerText, { color: isDark ? '#38abb1' : '#0d9488', fontWeight: '700' }]}>
            06:00 PM
          </Text>
          <Text style={[styles.markerText, { color: colors.textMuted }]}>12 AM</Text>
        </View>
      )}

      {/* Info Label Below */}
      {!compact && formattedPunchSpan ? (
        <View style={styles.footerRow}>
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: punchColor }]} />
            <Text style={[styles.spanText, { color: colors.textSecondary }]}>
              {formattedPunchSpan}
              {workedHours ? ` (${Number(workedHours).toFixed(1)}h)` : ''}
            </Text>
          </View>
          {isAutoPunch && (
            <View style={styles.autoPunchBadge}>
              <Ionicons name="log-out-outline" size={11} color="#f97316" style={{ marginRight: 3 }} />
              <Text style={styles.autoPunchText}>Auto Punch Out</Text>
            </View>
          )}
          {isLive && (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>In Progress</Text>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginVertical: 4,
  },
  track: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
  },
  shiftWindow: {
    position: 'absolute',
    top: 0,
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  workSegment: {
    position: 'absolute',
    top: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  markersRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  markerText: {
    fontSize: 9,
    fontWeight: '500',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 5,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  spanText: {
    fontSize: 11,
    fontWeight: '600',
  },
  autoPunchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(249, 115, 22, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  autoPunchText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#f97316',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 182, 212, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#06b6d4',
    marginRight: 4,
  },
  liveText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#06b6d4',
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginVertical: 2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
