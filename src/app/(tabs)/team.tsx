import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Image,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { graphqlRequest, getAbsoluteUrl } from '../../services/api';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../context/ThemeContext';
import ScreenHeader from '../../components/ScreenHeader';
import Sidebar from '../../components/Sidebar';
import ImagePreviewModal from '../../components/ImagePreviewModal';
import moment from 'moment';

const TEAM_PORTAL_QUERY = `
  query GetTeamPortalData($userId: ID) {
    teamHierarchy(userId: $userId) {
      manager {
        id
        firstName
        lastName
        profilePictureUrl
        designation { name }
        department { name }
      }
      peers {
        id
        firstName
        lastName
        profilePictureUrl
        designation { name }
        department { name }
      }
      user {
        id
        firstName
        lastName
        profilePictureUrl
        designation { name }
        department { name }
      }
      subordinates {
        id
        firstName
        lastName
        profilePictureUrl
        designation { name }
        department { name }
      }
    }
    teamLeaves {
      id
      fromDate
      toDate
      status
      leaveType { name }
      user {
        id
        firstName
        lastName
        profilePictureUrl
      }
    }
    teamAttendanceToday {
      status
      loginTime
      logoutTime
      user {
        id
        firstName
        lastName
        profilePictureUrl
        designation { name }
      }
    }
  }
`;

type ViewMode = 'directory' | 'org' | 'attendance';

export default function TeamScreen() {
  const { colors, accentColors, isDark } = useAppTheme();
  const styles = getStyles(colors, accentColors, isDark);
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('directory');
  const [previewImage, setPreviewImage] = useState<{ url: string; name?: string; subtitle?: string } | null>(null);

  const fetchTeamData = async () => {
    try {
      const response = await graphqlRequest(TEAM_PORTAL_QUERY);
      setData(response);
    } catch (error) {
      console.error('Failed to load team details:', error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTeamData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchTeamData();
  };

  const renderMember = (member: any, roleLabel: string, isCurrent: boolean = false) => {
    const avatarUrl = getAbsoluteUrl(member.profilePictureUrl);
    
    return (
      <View key={member.id} style={[
        styles.memberCard,
        isCurrent && {
          borderColor: accentColors.primary,
          borderWidth: 2,
          backgroundColor: isDark ? 'rgba(99, 102, 241, 0.12)' : 'rgba(99, 102, 241, 0.06)',
        }
      ]}>
        {avatarUrl ? (
          <TouchableOpacity
            onPress={() => setPreviewImage({
              url: avatarUrl,
              name: `${member.firstName} ${member.lastName}`,
              subtitle: member.designation?.name || roleLabel,
            })}
            activeOpacity={0.8}
            accessibilityLabel={`View photo of ${member.firstName} ${member.lastName}`}
          >
            <Image source={{ uri: avatarUrl }} style={styles.memberAvatar} />
          </TouchableOpacity>
        ) : (
          <View style={[styles.memberAvatarFallback, { backgroundColor: (isCurrent ? accentColors.primary : '#8b5cf6') + '15' }]}>
            <Text style={[styles.memberInitials, { color: isCurrent ? accentColors.primary : '#8b5cf6' }]}>
              {member.firstName?.[0]}{member.lastName?.[0]}
            </Text>
          </View>
        )}
        <View style={styles.memberInfo}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.memberName}>{member.firstName} {member.lastName}</Text>
            {isCurrent && (
              <View style={[styles.currentBadge, { backgroundColor: accentColors.primary }]}>
                <Text style={styles.currentBadgeText}>YOU</Text>
              </View>
            )}
          </View>
          <Text style={styles.memberRole}>{member.designation?.name || 'Employee'}</Text>
          {member.department?.name && (
            <Text style={styles.memberDept}>{member.department.name}</Text>
          )}
        </View>
        <View style={[
          styles.roleBadge,
          isCurrent && { backgroundColor: accentColors.light }
        ]}>
          <Text style={[
            styles.roleBadgeText,
            isCurrent && { color: accentColors.primary, fontWeight: '700' }
          ]}>{roleLabel}</Text>
        </View>
      </View>
    );
  };

  const renderTeamMoments = () => {
    const leaves = data?.teamLeaves || [];
    const upcomingLeaves = leaves.filter((l: any) => l.status === 'APPROVED' && moment(l.toDate).isSameOrAfter(moment(), 'day'));

    if (upcomingLeaves.length === 0) return null;

    return (
      <View style={styles.momentsSection}>
        <Text style={styles.sectionTitle}>Team Moments</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.momentsScroll}>
          {upcomingLeaves.map((leave: any) => {
            const avatarUrl = getAbsoluteUrl(leave.user?.profilePictureUrl);
            const isToday = moment().isBetween(moment(leave.fromDate), moment(leave.toDate), 'day', '[]');
            
            return (
              <View key={leave.id} style={styles.momentCard}>
                {avatarUrl ? (
                  <TouchableOpacity
                    onPress={() => setPreviewImage({
                      url: avatarUrl,
                      name: `${leave.user?.firstName} ${leave.user?.lastName || ''}`.trim(),
                      subtitle: leave.leaveType?.name || 'On Leave',
                    })}
                    activeOpacity={0.8}
                    accessibilityLabel={`View photo of ${leave.user?.firstName}`}
                  >
                    <Image source={{ uri: avatarUrl }} style={styles.momentAvatar} />
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.momentAvatarFallback, { backgroundColor: '#f59e0b20' }]}>
                    <Text style={{ color: '#f59e0b', fontWeight: 'bold' }}>
                      {leave.user?.firstName?.[0]}{leave.user?.lastName?.[0]}
                    </Text>
                  </View>
                )}
                <View style={styles.momentInfo}>
                  <Text style={styles.momentName} numberOfLines={1}>{leave.user?.firstName}</Text>
                  <Text style={[styles.momentStatus, { color: isToday ? '#ef4444' : '#f59e0b' }]}>
                    {isToday ? 'On Leave Today' : 'Upcoming Leave'}
                  </Text>
                  <Text style={styles.momentDate}>
                    {moment(leave.fromDate).format('MMM D')} - {moment(leave.toDate).format('MMM D')}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  const renderOrgChart = () => {
    const manager = data?.teamHierarchy?.manager;
    const currentUser = data?.teamHierarchy?.user;
    const peers = data?.teamHierarchy?.peers || [];
    const subordinates = data?.teamHierarchy?.subordinates || [];

    return (
      <View style={styles.orgVerticalContainer}>
        {/* Manager (Top Level) */}
        {manager && (
          <View style={styles.orgVerticalSection}>
            <View style={styles.orgSectionHeaderRow}>
              <Ionicons name="shield-checkmark" size={14} color="#8b5cf6" />
              <Text style={[styles.orgSectionTitle, { color: '#8b5cf6' }]}>REPORTS TO (MANAGER)</Text>
            </View>
            {renderMember(manager, 'Manager')}
            <View style={styles.verticalConnectorBox}>
              <View style={styles.verticalLine} />
              <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
            </View>
          </View>
        )}

        {/* Current Position ("YOU") */}
        {currentUser && (
          <View style={styles.orgVerticalSection}>
            <View style={styles.orgSectionHeaderRow}>
              <Ionicons name="person-circle" size={14} color={accentColors.primary} />
              <Text style={[styles.orgSectionTitle, { color: accentColors.primary }]}>CURRENT POSITION (YOU)</Text>
            </View>
            {renderMember(currentUser, 'You', true)}
            {subordinates.length > 0 && (
              <View style={styles.verticalConnectorBox}>
                <View style={[styles.verticalLine, { backgroundColor: accentColors.primary }]} />
                <Ionicons name="chevron-down" size={16} color={accentColors.primary} />
              </View>
            )}
          </View>
        )}

        {/* Direct Reports */}
        {subordinates.length > 0 && (
          <View style={styles.orgVerticalSection}>
            <View style={styles.orgSectionHeaderRow}>
              <Ionicons name="git-merge-outline" size={14} color="#10b981" />
              <Text style={[styles.orgSectionTitle, { color: '#10b981' }]}>DIRECT REPORTS ({subordinates.length})</Text>
            </View>
            <View style={styles.verticalMemberList}>
              {subordinates.map((sub: any) => renderMember(sub, 'Direct Report'))}
            </View>
          </View>
        )}

        {/* Team Peers */}
        {peers.length > 0 && (
          <View style={[styles.orgVerticalSection, { marginTop: 16 }]}>
            <View style={styles.orgSectionHeaderRow}>
              <Ionicons name="people-outline" size={14} color="#3b82f6" />
              <Text style={[styles.orgSectionTitle, { color: '#3b82f6' }]}>TEAM PEERS ({peers.length})</Text>
            </View>
            <View style={styles.verticalMemberList}>
              {peers.map((peer: any) => renderMember(peer, 'Peer'))}
            </View>
          </View>
        )}

        {!manager && !currentUser && subordinates.length === 0 && peers.length === 0 && (
          <Text style={styles.emptyText}>No organization structure available.</Text>
        )}
      </View>
    );
  };

  const renderAttendance = () => {
    const attendance = data?.teamAttendanceToday || [];
    if (attendance.length === 0) {
      return <Text style={styles.emptyText}>No attendance data for today.</Text>;
    }

    return (
      <View style={styles.attendanceContainer}>
        {attendance.map((record: any) => {
          const u = record.user;
          const avatarUrl = getAbsoluteUrl(u.profilePictureUrl);
          const isPresent = record.status === 'present' || record.status === 'late_login' || record.status === 'half_day';
          const isLeaveOrAbsent = record.status === 'leave' || record.status === 'absent';
          
          let statusColor = colors.textSecondary;
          if (isPresent) statusColor = '#10b981';
          if (isLeaveOrAbsent) statusColor = '#f59e0b';

          return (
            <View key={u.id} style={styles.memberCard}>
              {avatarUrl ? (
                <TouchableOpacity
                  onPress={() => setPreviewImage({
                    url: avatarUrl,
                    name: `${u.firstName} ${u.lastName}`,
                    subtitle: u.designation?.name || 'Employee',
                  })}
                  activeOpacity={0.8}
                  accessibilityLabel={`View photo of ${u.firstName} ${u.lastName}`}
                >
                  <Image source={{ uri: avatarUrl }} style={styles.memberAvatar} />
                </TouchableOpacity>
              ) : (
                <View style={[styles.memberAvatarFallback, { backgroundColor: statusColor + '15' }]}>
                  <Text style={[styles.memberInitials, { color: statusColor }]}>
                    {u.firstName?.[0]}{u.lastName?.[0]}
                  </Text>
                </View>
              )}
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{u.firstName} {u.lastName}</Text>
                <Text style={styles.memberRole}>{u.designation?.name || 'Employee'}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.attendanceStatus, { color: statusColor }]}>
                  {record.status === 'absent' ? 'ON LEAVE' : record.status.replace('_', ' ').toUpperCase()}
                </Text>
                {isPresent && record.loginTime && (
                  <Text style={styles.attendanceTime}>In: {moment(record.loginTime, "HH:mm:ss").format("h:mm A")}</Text>
                )}
                {isPresent && record.logoutTime && (
                  <Text style={styles.attendanceTime}>Out: {moment(record.logoutTime, "HH:mm:ss").format("h:mm A")}</Text>
                )}
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeContainer} edges={['top', 'bottom', 'left', 'right']}>
      <ScreenHeader
        title="My Team"
        subtitle="Directory & Hierarchy"
        showMenu={false}
        showNotifications={true}
        onMenu={() => setIsSidebarOpen(true)}
      />

      <View style={[styles.toggleContainer, { paddingHorizontal: 16, marginTop: 12 }]}>
        <TouchableOpacity
          style={[
            styles.toggleButton,
            { backgroundColor: viewMode === 'directory' ? accentColors.primary + '20' : 'transparent' }
          ]}
          onPress={() => setViewMode('directory')}
        >
          <Ionicons name="list-outline" size={20} color={viewMode === 'directory' ? accentColors.primary : colors.textSecondary} />
          <Text style={[
            styles.toggleText,
            { color: viewMode === 'directory' ? accentColors.primary : colors.textSecondary }
          ]}>Directory</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[
            styles.toggleButton,
            { backgroundColor: viewMode === 'org' ? accentColors.primary + '20' : 'transparent' }
          ]}
          onPress={() => setViewMode('org')}
        >
          <Ionicons name="git-branch-outline" size={20} color={viewMode === 'org' ? accentColors.primary : colors.textSecondary} />
          <Text style={[
            styles.toggleText,
            { color: viewMode === 'org' ? accentColors.primary : colors.textSecondary }
          ]}>Org Chart</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.toggleButton,
            { backgroundColor: viewMode === 'attendance' ? accentColors.primary + '20' : 'transparent' }
          ]}
          onPress={() => setViewMode('attendance')}
        >
          <Ionicons name="time-outline" size={20} color={viewMode === 'attendance' ? accentColors.primary : colors.textSecondary} />
          <Text style={[
            styles.toggleText,
            { color: viewMode === 'attendance' ? accentColors.primary : colors.textSecondary }
          ]}>Attendance</Text>
        </TouchableOpacity>
      </View>

      {isLoading && !data ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={accentColors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.container}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accentColors.primary} />}
        >
          {renderTeamMoments()}

          {viewMode === 'directory' && (
            <View>
              <Text style={styles.sectionTitle}>Directory</Text>
              <View style={styles.directoryList}>
                {data?.teamHierarchy?.manager && renderMember(data.teamHierarchy.manager, 'Manager')}
                {data?.teamHierarchy?.peers?.map((peer: any) => renderMember(peer, 'Peer'))}
                {data?.teamHierarchy?.subordinates?.map((sub: any) => renderMember(sub, 'Direct Report'))}
                {!data?.teamHierarchy?.manager && !data?.teamHierarchy?.peers?.length && !data?.teamHierarchy?.subordinates?.length && (
                  <Text style={styles.emptyText}>No team members found.</Text>
                )}
              </View>
            </View>
          )}

          {viewMode === 'org' && (
            <View>
              <Text style={styles.sectionTitle}>Organization Chart</Text>
              {renderOrgChart()}
            </View>
          )}

          {viewMode === 'attendance' && (
            <View>
              <Text style={styles.sectionTitle}>Today's Attendance</Text>
              {renderAttendance()}
            </View>
          )}
        </ScrollView>
      )}

      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Full Screen Image Preview Lightbox */}
      <ImagePreviewModal
        visible={!!previewImage}
        imageUrl={previewImage?.url}
        title={previewImage?.name}
        subtitle={previewImage?.subtitle}
        onClose={() => setPreviewImage(null)}
      />
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
  },
  container: {
    padding: 20,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  momentsSection: {
    marginBottom: 32,
  },
  momentsScroll: {
    gap: 12,
  },
  momentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundCard,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 200,
    gap: 12,
  },
  momentAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  momentAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  momentInfo: {
    flex: 1,
  },
  momentName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  momentStatus: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  momentDate: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  directoryList: {
    gap: 12,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundCard,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 14,
  },
  memberAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  memberAvatarFallback: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberInitials: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  memberRole: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  roleBadge: {
    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  emptyText: {
    textAlign: 'center',
    color: colors.textSecondary,
    fontStyle: 'italic',
    padding: 20,
  },
  toggleContainer: {
    flexDirection: 'row',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    gap: 8,
  },
  toggleButton: {
    flex: 1,
    flexDirection: 'column',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    gap: 4,
  },
  toggleText: {
    fontSize: 12,
    fontWeight: '600',
  },
  orgVerticalContainer: {
    paddingVertical: 12,
    gap: 8,
  },
  orgVerticalSection: {
    marginBottom: 8,
  },
  orgSectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  orgSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  verticalConnectorBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  verticalLine: {
    width: 2,
    height: 18,
    backgroundColor: colors.border,
    marginBottom: 2,
  },
  verticalMemberList: {
    gap: 10,
  },
  currentBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  currentBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '900',
  },
  memberDept: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 1,
  },
  attendanceContainer: {
    gap: 12,
  },
  attendanceStatus: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  attendanceTime: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
