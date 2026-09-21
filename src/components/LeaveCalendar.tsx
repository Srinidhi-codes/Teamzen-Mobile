import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image } from 'react-native';
import moment from 'moment';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
import { getAbsoluteUrl } from '../services/api';

interface MyLeave {
  id: string;
  fromDate: string;
  toDate: string;
  status: string;
  leaveType: { id?: string; name: string; code?: string };
  durationDays: number;
}

interface TeamLeave {
  id: string;
  fromDate: string;
  toDate: string;
  status: string;
  durationDays: number;
  leaveType: { id?: string; name: string; code?: string };
  user: {
    id: string;
    firstName: string;
    lastName: string;
    profilePicture?: { url: string };
    profilePictureUrl?: string;
  };
}

interface Holiday {
  id: string;
  name: string;
  holidayDate: string;
  isOptional: boolean;
  description: string;
}

interface LeaveCalendarProps {
  myLeaves: MyLeave[];
  teamLeaves: TeamLeave[];
  holidays: Holiday[];
}

type FilterType = "all" | "pending" | "my" | "team" | "holiday";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function isBetween(date: moment.Moment, from: string, to: string) {
  return date.isSameOrAfter(moment(from), "day") && date.isSameOrBefore(moment(to), "day");
}

export default function LeaveCalendar({ myLeaves = [], teamLeaves = [], holidays = [] }: LeaveCalendarProps) {
  const { colors, accentColors, isDark } = useAppTheme();
  const styles = getStyles(colors, accentColors, isDark);
  
  const [currentMonth, setCurrentMonth] = useState(moment().startOf("month"));
  const [filter, setFilter] = useState<FilterType>("all");
  const [selectedDay, setSelectedDay] = useState<moment.Moment | null>(moment());

  const prevMonth = () => setCurrentMonth((m) => m.clone().subtract(1, "month"));
  const nextMonth = () => setCurrentMonth((m) => m.clone().add(1, "month"));

  const calendarDays = useMemo(() => {
    const startOfGrid = currentMonth.clone().startOf("isoWeek");
    const endOfGrid = currentMonth.clone().endOf("month").endOf("isoWeek");
    const days: moment.Moment[] = [];
    let cur = startOfGrid.clone();
    while (cur.isSameOrBefore(endOfGrid)) {
      days.push(cur.clone());
      cur.add(1, "day");
    }
    return days;
  }, [currentMonth]);

  const getEventsForDay = (day: moment.Moment) => {
    const allMy = myLeaves.filter((l) => isBetween(day, l.fromDate, l.toDate));
    const allTeam = teamLeaves.filter((l) => isBetween(day, l.fromDate, l.toDate));

    let myLeaveEvents = allMy;
    let teamLeaveEvents = allTeam;

    if (filter === "pending") {
      myLeaveEvents = allMy.filter((l) => (l.status || "").toLowerCase() === "pending");
      teamLeaveEvents = allTeam.filter((l) => (l.status || "").toLowerCase() === "pending");
    } else if (filter === "my") {
      teamLeaveEvents = [];
    } else if (filter === "team") {
      myLeaveEvents = [];
    } else if (filter === "holiday") {
      myLeaveEvents = [];
      teamLeaveEvents = [];
    }

    const holidayEvents = (filter === "all" || filter === "holiday")
      ? holidays.filter((h) => day.isSame(moment(h.holidayDate), "day"))
      : [];

    return { myLeaveEvents, teamLeaveEvents, holidayEvents, rawMy: allMy, rawTeam: allTeam };
  };

  const selectedDayEvents = selectedDay ? getEventsForDay(selectedDay) : null;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={prevMonth} style={styles.navButton}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.monthText}>{currentMonth.format("MMMM YYYY")}</Text>
        <TouchableOpacity onPress={nextMonth} style={styles.navButton}>
          <Ionicons name="chevron-forward" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.filtersRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {[
            { key: "all", label: "All", color: accentColors.primary },
            { key: "pending", label: "Pending", color: "#f59e0b" },
            { key: "my", label: "My Leave", color: "#ef4444" },
            { key: "team", label: "Team", color: "#10b981" },
            { key: "holiday", label: "Holidays", color: "#3b82f6" },
          ].map((f) => {
            const isActive = filter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={[
                  styles.filterChip,
                  isActive && { backgroundColor: f.color + '20', borderColor: f.color }
                ]}
                onPress={() => setFilter(f.key as FilterType)}
              >
                <Text style={[styles.filterText, isActive && { color: f.color, fontWeight: '700' }]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.calendarGrid}>
        <View style={styles.weekdaysRow}>
          {WEEKDAYS.map((d, i) => (
            <Text key={i} style={styles.weekdayText}>{d}</Text>
          ))}
        </View>

        <View style={styles.daysGrid}>
          {calendarDays.map((day, i) => {
            const events = getEventsForDay(day);
            const isCurrentMonth = day.month() === currentMonth.month();
            const isToday = day.isSame(moment(), 'day');
            const isSelected = selectedDay?.isSame(day, 'day');
            
            const hasPending = events.rawMy.some((l) => (l.status || "").toLowerCase() === "pending") ||
                               events.rawTeam.some((l) => (l.status || "").toLowerCase() === "pending");
            const hasApprovedMy = events.rawMy.some((l) => (l.status || "").toLowerCase() === "approved");
            const hasApprovedTeam = events.rawTeam.some((l) => (l.status || "").toLowerCase() === "approved");
            const hasHoliday = events.holidayEvents.length > 0;

            return (
              <TouchableOpacity
                key={i}
                style={[
                  styles.dayCell,
                  !isCurrentMonth && styles.dayCellOutside,
                  isSelected && styles.dayCellSelected,
                  isToday && !isSelected && styles.dayCellToday
                ]}
                onPress={() => setSelectedDay(day)}
              >
                <Text style={[
                  styles.dayText,
                  !isCurrentMonth && styles.dayTextOutside,
                  isSelected && styles.dayTextSelected
                ]}>
                  {day.date()}
                </Text>
                <View style={styles.dotsContainer}>
                  {hasPending && <View style={[styles.dot, { backgroundColor: '#f59e0b' }]} />}
                  {hasApprovedMy && <View style={[styles.dot, { backgroundColor: '#ef4444' }]} />}
                  {hasApprovedTeam && <View style={[styles.dot, { backgroundColor: '#10b981' }]} />}
                  {hasHoliday && <View style={[styles.dot, { backgroundColor: '#3b82f6' }]} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {selectedDay && selectedDayEvents && (
        <View style={styles.eventsContainer}>
          <Text style={styles.eventsTitle}>{selectedDay.format("dddd, MMMM Do")}</Text>

          {selectedDayEvents.holidayEvents.map((h, i) => (
            <View key={`hol-${i}`} style={[styles.eventCard, { borderLeftColor: '#3b82f6' }]}>
              <View style={[styles.eventIcon, { backgroundColor: '#3b82f615' }]}>
                <Ionicons name="business" size={16} color="#3b82f6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.eventTitle}>{h.name}</Text>
                <Text style={styles.eventSub}>{h.isOptional ? "Optional Holiday" : "Company Holiday"}</Text>
              </View>
            </View>
          ))}

          {selectedDayEvents.myLeaveEvents.map((l, i) => {
            const isPending = (l.status || '').toLowerCase() === 'pending';
            const color = isPending ? '#f59e0b' : '#ef4444';
            return (
              <View key={`my-${i}`} style={[styles.eventCard, { borderLeftColor: color }]}>
                <View style={[styles.eventIcon, { backgroundColor: color + '15' }]}>
                  <Ionicons name={isPending ? "time-outline" : "person"} size={16} color={color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={styles.eventTitle}>{l.leaveType?.name || 'Leave'}</Text>
                    <View style={{ backgroundColor: color + '20', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: color }}>
                        {(l.status || '').toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.eventSub}>
                    My Leave • {l.durationDays || 1} day{(l.durationDays || 1) > 1 ? 's' : ''}
                  </Text>
                </View>
              </View>
            );
          })}

          {selectedDayEvents.teamLeaveEvents.map((l, i) => {
            const u = l.user;
            const pic = u.profilePictureUrl || u.profilePicture?.url;
            const avatarUrl = getAbsoluteUrl(pic);
            const isPending = (l.status || '').toLowerCase() === 'pending';
            const color = isPending ? '#f59e0b' : '#10b981';
            return (
              <View key={`team-${i}`} style={[styles.eventCard, { borderLeftColor: color }]}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.teamAvatar} />
                ) : (
                  <View style={[styles.teamAvatarFallback, { backgroundColor: color + '20' }]}>
                    <Text style={[styles.teamAvatarText, { color: color }]}>{u.firstName?.[0]}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={styles.eventTitle}>{u.firstName} {u.lastName}</Text>
                    <View style={{ backgroundColor: color + '20', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: color }}>
                        {(l.status || '').toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.eventSub}>
                    {l.leaveType?.name || 'Leave'} • {l.durationDays || 1} day{(l.durationDays || 1) > 1 ? 's' : ''}
                  </Text>
                </View>
              </View>
            );
          })}

          {selectedDayEvents.holidayEvents.length === 0 &&
           selectedDayEvents.myLeaveEvents.length === 0 &&
           selectedDayEvents.teamLeaveEvents.length === 0 && (
            <Text style={styles.noEventsText}>No leaves or holidays on this day.</Text>
          )}
        </View>
      )}
    </View>
  );
}

const getStyles = (colors: any, accentColors: any, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  navButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  monthText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  filtersRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    backgroundColor: colors.backgroundCard,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  calendarGrid: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 24,
  },
  weekdaysRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekdayText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
    borderRadius: 8,
  },
  dayCellOutside: {
    opacity: 0.3,
  },
  dayCellToday: {
    backgroundColor: accentColors.primary + '15',
  },
  dayCellSelected: {
    backgroundColor: accentColors.primary,
  },
  dayText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  dayTextOutside: {
    color: colors.textSecondary,
  },
  dayTextSelected: {
    color: '#fff',
    fontWeight: 'bold',
  },
  dotsContainer: {
    flexDirection: 'row',
    marginTop: 4,
    gap: 2,
    height: 4,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  eventsContainer: {
    backgroundColor: colors.backgroundCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  eventsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
    borderRadius: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
  },
  eventIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  teamAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 12,
  },
  teamAvatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 12,
    backgroundColor: '#10b98120',
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamAvatarText: {
    color: '#10b981',
    fontWeight: 'bold',
    fontSize: 12,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  eventSub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  noEventsText: {
    color: colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 8,
  },
});
