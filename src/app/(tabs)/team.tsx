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

  const renderMember = (member: any, roleLabel: string) => {
    const avatarUrl = getAbsoluteUrl(member.profilePictureUrl);
    
    return (
      <View key={member.id} style={styles.memberCard}>
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
          <View style={[styles.memberAvatarFallback, { backgroundColor: accentColors.primary + '15' }]}>
            <Text style={[styles.memberInitials, { color: accentColors.primary }]}>
              {member.firstName?.[0]}{member.lastName?.[0]}
            </Text>
          </View>
        )}
        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>{member.firstName} {member.lastName}</Text>
          <Text style={styles.memberRole}>{member.designation?.name || 'Employee'}</Text>
        </View>
        <View style={styles.roleBadge}>
          <Text style={styles.roleBadgeText}>{roleLabel}</Text>
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

  const renderOrgNode = (member: any, role: string, isCurrent: boolean = false) => {
    const avatarUrl = getAbsoluteUrl(member.profilePictureUrl);
    const roleColor = isCurrent ? accentColors.primary : role === 'Manager' ? '#8b5cf6' : role === 'Peer' ? '#3b82f6' : '#10b981';
    
    return (
      <View key={member.id} style={[
        styles.flowNodeCard,
        isCurrent && {
          borderColor: accentColors.primary,
          borderWidth: 2,
          backgroundColor: isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.08)',
          shadowColor: accentColors.primary,
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 5,
        }
      ]}>
        <View style={styles.flowNodeHeader}>
          {avatarUrl ? (
            <TouchableOpacity
              onPress={() => setPreviewImage({
                url: avatarUrl,
                name: `${member.firstName} ${member.lastName}`,
                subtitle: member.designation?.name || role,
              })}
              activeOpacity={0.8}
            >
              <Image source={{ uri: avatarUrl }} style={[styles.flowNodeAvatar, { borderColor: roleColor }]} />
            </TouchableOpacity>
          ) : (
            <View style={[styles.flowNodeAvatarFallback, { backgroundColor: roleColor + '20', borderColor: roleColor }]}>
              <Text style={[styles.flowNodeInitials, { color: roleColor }]}>
                {member.firstName?.[0]}{member.lastName?.[0]}
              </Text>
            </View>
          )}
          <View style={[styles.flowNodeRoleBadge, { backgroundColor: roleColor + '20' }]}>
            <Text style={[styles.flowNodeRoleText, { color: roleColor }]}>
              {isCurrent ? 'YOU' : role.toUpperCase()}
            </Text>
          </View>
        </View>

        <Text style={styles.flowNodeName} numberOfLines={1}>{member.firstName} {member.lastName}</Text>
        <Text style={styles.flowNodeRole} numberOfLines={1}>{member.designation?.name || 'Team Member'}</Text>
        {member.department?.name && (
          <Text style={styles.flowNodeDept} numberOfLines={1}>{member.department.name}</Text>
        )}
      </View>
    );
  };

  const renderOrgChart = () => {
    const manager = data?.teamHierarchy?.manager;
    const currentUser = data?.teamHierarchy?.user;
    const peers = data?.teamHierarchy?.peers || [];
    const subordinates = data?.teamHierarchy?.subordinates || [];

    const cluster2Members = [
      ...(currentUser ? [{ ...currentUser, isCurrent: true, role: 'You' }] : []),
      ...peers.map((p: any) => ({ ...p, isCurrent: false, role: 'Peer' })),
    ];

    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.orgChartScroll}>
        <View style={styles.orgChartWrapper}>
          
          {/* TIER 1: Manager Cluster */}
          {manager && (
            <View style={styles.orgTier}>
              <View style={styles.clusterTitleBadge}>
                <Ionicons name="shield-checkmark" size={12} color="#8b5cf6" />
                <Text style={styles.clusterTitleText}>LEADERSHIP / MANAGER</Text>
              </View>
              {renderOrgNode(manager, 'Manager', false)}
              <View style={styles.connectorStem} />
            </View>
          )}

          {/* Bus Bar line connecting Tier 1 to Tier 2 */}
          {manager && cluster2Members.length > 0 && (
            <View style={styles.busBarContainer}>
              <View style={[styles.busBarLine, { width: Math.max(60, (cluster2Members.length - 1) * 190) }]} />
            </View>
          )}

          {/* TIER 2: Peers & Current User Cluster */}
          {cluster2Members.length > 0 && (
            <View style={styles.orgTier}>
              <View style={styles.clusterTitleBadge}>
                <Ionicons name="people" size={12} color="#3b82f6" />
                <Text style={styles.clusterTitleText}>YOUR TEAM & PEERS</Text>
              </View>

              <View style={styles.clusterRow}>
                {cluster2Members.map((member: any) => (
                  <View key={member.id} style={styles.clusterNodeWrapper}>
                    {manager && <View style={styles.connectorDrop} />}
                    {renderOrgNode(member, member.role, member.isCurrent)}
                    {member.isCurrent && subordinates.length > 0 && (
                      <View style={[styles.connectorStem, { backgroundColor: accentColors.primary }]} />
                    )}
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Bus Bar line connecting "You" to Direct Reports */}
          {subordinates.length > 0 && (
            <View style={styles.busBarContainer}>
              <View style={[styles.busBarLine, { width: Math.max(60, (subordinates.length - 1) * 190), backgroundColor: accentColors.primary }]} />
            </View>
          )}

          {/* TIER 3: Direct Reports Cluster */}
          {subordinates.length > 0 && (
            <View style={styles.orgTier}>
              <View style={[styles.clusterTitleBadge, { backgroundColor: '#10b98115' }]}>
                <Ionicons name="git-merge-outline" size={12} color="#10b981" />
                <Text style={[styles.clusterTitleText, { color: '#10b981' }]}>DIRECT REPORTS</Text>
              </View>

              <View style={styles.clusterRow}>
                {subordinates.map((sub: any) => (
                  <View key={sub.id} style={styles.clusterNodeWrapper}>
                    <View style={[styles.connectorDrop, { backgroundColor: accentColors.primary }]} />
                    {renderOrgNode(sub, 'Report', false)}
                  </View>
                ))}
              </View>
            </View>
          )}

          {!manager && cluster2Members.length === 0 && subordinates.length === 0 && (
            <Text style={styles.emptyText}>No organization structure available.</Text>
          )}
        </View>
      </ScrollView>
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
  orgChartScroll: {
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: 'center',
    minWidth: '100%',
  },
  orgChartWrapper: {
    alignItems: 'center',
    width: '100%',
  },
  orgTier: {
    alignItems: 'center',
    marginVertical: 4,
  },
  clusterTitleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
    marginBottom: 12,
  },
  clusterTitleText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: colors.textSecondary,
  },
  clusterRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 16,
  },
  clusterNodeWrapper: {
    alignItems: 'center',
  },
  flowNodeCard: {
    width: 175,
    backgroundColor: colors.backgroundCard,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  flowNodeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 10,
  },
  flowNodeAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
  },
  flowNodeAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowNodeInitials: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  flowNodeRoleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  flowNodeRoleText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  flowNodeName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    width: '100%',
  },
  flowNodeRole: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 2,
    width: '100%',
  },
  flowNodeDept: {
    fontSize: 10,
    color: colors.textSecondary,
    opacity: 0.8,
    textAlign: 'center',
    marginTop: 2,
    width: '100%',
  },
  connectorStem: {
    width: 2,
    height: 22,
    backgroundColor: colors.border,
  },
  connectorDrop: {
    width: 2,
    height: 16,
    backgroundColor: colors.border,
    marginBottom: 2,
  },
  busBarContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 2,
  },
  busBarLine: {
    height: 2,
    backgroundColor: colors.border,
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
