import moment from 'moment';

export interface AttendanceRecordLike {
  attendanceDate?: string;
  loginTime?: string | null;
  logoutTime?: string | null;
  status?: string | null;
  remarks?: string | null;
  isAutoPunchOut?: boolean;
}

/**
 * Determines if a user forgot to punch out (only when punch out was actually missed).
 * - Applies ONLY to past dates (< today) where check-in occurred but no punch out was recorded,
 *   or where auto square-off was triggered at midnight (12:00 AM).
 * - Today is NEVER auto punch out: employees have until 12:00 AM midnight to punch out.
 */
export function isAutoPunchOutRecord(
  record?: AttendanceRecordLike | null,
  shiftEndStr: string = '18:00:00'
): boolean {
  if (!record || !record.loginTime) return false;

  const todayStr = moment().format('YYYY-MM-DD');

  // Today is an active work day. Auto punch out is ONLY triggered if the user
  // forgets to punch out by 12:00 AM midnight. Therefore, today is NEVER auto punch out.
  if (record.attendanceDate === todayStr) {
    return false;
  }

  // Past dates: user logged in but never logged out by midnight
  if (record.attendanceDate && record.attendanceDate < todayStr && !record.logoutTime) {
    return true;
  }

  if (record.status === 'auto_punch_out' || record.isAutoPunchOut) return true;

  const remarks = record.remarks || '';
  if (
    remarks.includes('Auto square-off') ||
    remarks.includes('Auto punch out') ||
    remarks.includes('Missed checkout')
  ) {
    return true;
  }

  if (record.logoutTime && record.logoutTime.startsWith('23:59')) {
    return true;
  }

  return false;
}

/**
 * Returns the effective status of an attendance record, resolving forgotten punch outs.
 */
export function getEffectiveAttendanceStatus(
  record?: AttendanceRecordLike | null,
  shiftEndStr: string = '18:00:00'
): string {
  if (!record) return 'not_started';
  const todayStr = moment().format('YYYY-MM-DD');
  if (record.attendanceDate === todayStr) {
    // Today's shift is never auto punch out
    if (record.status === 'auto_punch_out') {
      return 'present';
    }
    return record.status || 'present';
  }
  if (isAutoPunchOutRecord(record, shiftEndStr)) {
    return 'auto_punch_out';
  }
  return record.status || 'present';
}
