import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Image,
  Modal,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { useAuth } from '../context/AuthContext';
import { API_URL, graphqlRequest } from '../services/api';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAppTheme } from '../context/ThemeContext';
import ScreenHeader from '../components/ScreenHeader';

// =====================================================
// GRAPHQL QUERIES & MUTATIONS
// =====================================================
const PROFILE_QUERY = `
  query GetMyProfile {
    me {
      id
      email
      username
      firstName
      lastName
      phoneNumber
      role
      isActive
      isVerified
      dateOfJoining
      dateOfBirth
      gender
      profilePictureUrl
      organization {
        id
        name
        accent
      }
      employeeId
      employmentType
      manager {
        id
        firstName
        lastName
      }
      department {
        id
        name
      }
      designation {
        id
        name
      }
      officeLocation {
        id
        name
        address
      }
      bankAccountNumber
      bankIfscCode
      panNumber
      aadharNumber
      uanNumber
      attendanceRate
      leaveBalance
      totalLeaveEntitlement
      tenureDisplay
    }
  }
`;

const UPDATE_PROFILE_MUTATION = `
  mutation UpdateProfile($input: UpdateProfileInput!) {
    updateProfile(input: $input) {
      success
      error
      user {
        id
        firstName
        lastName
        phoneNumber
        dateOfBirth
        gender
      }
    }
  }
`;

// =====================================================
// INTERFACES
// =====================================================
interface UserProfile {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  role: string;
  isActive: boolean;
  isVerified: boolean;
  dateOfJoining: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  profilePictureUrl: string | null;
  organization?: {
    id: string;
    name: string;
    accent?: string | null;
  } | null;
  employeeId: string | null;
  employmentType: string | null;
  manager: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  department: {
    id: string;
    name: string;
  } | null;
  designation: {
    id: string;
    name: string;
  } | null;
  officeLocation: {
    id: string;
    name: string;
    address: string;
  } | null;
  bankAccountNumber: string | null;
  bankIfscCode: string | null;
  panNumber: string | null;
  aadharNumber: string | null;
  uanNumber: string | null;
  attendanceRate: number;
  leaveBalance: number;
  totalLeaveEntitlement: number;
  tenureDisplay: string;
}

interface ProfileData {
  me: UserProfile | null;
}

// Module-level in-memory cache for instant route revisit
let cachedProfileData: UserProfile | null = null;

export default function ProfileScreen() {
  const { signOut, accessToken } = useAuth();
  const router = useRouter();
  const { colors, accentColors, isDark, setOrgAccent } = useAppTheme();
  const styles = getStyles(colors, accentColors, isDark);
  const [profile, setProfile] = useState<UserProfile | null>(cachedProfileData);
  const [isLoading, setIsLoading] = useState(!cachedProfileData);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'personal' | 'employment' | 'financial'>('personal');

  // Edit Profile States
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editPhoneNumber, setEditPhoneNumber] = useState('');
  const [editDateOfBirth, setEditDateOfBirth] = useState('');
  const [editGender, setEditGender] = useState('male');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const fetchProfileData = async () => {
    try {
      const response = await graphqlRequest<ProfileData>(PROFILE_QUERY);
      if (response && response.me === null) {
        signOut();
        return;
      }
      cachedProfileData = response.me;
      setProfile(response.me);

      if (response?.me?.organization?.accent) {
        setOrgAccent(response.me.organization.accent);
      }
    } catch (error: any) {
      console.error('Error fetching profile:', error);
      if (
        error?.message?.includes('Session expired') ||
        error?.message?.includes('not authenticated') ||
        error?.message?.includes('Signature has expired')
      ) {
        signOut();
      } else {
        Alert.alert('Error', 'Failed to load profile details.');
      }
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchProfileData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchProfileData();
  };

  const handleOpenEditModal = () => {
    if (!profile) return;
    setEditFirstName(profile.firstName || '');
    setEditLastName(profile.lastName || '');
    setEditPhoneNumber(profile.phoneNumber || '');
    setEditDateOfBirth(profile.dateOfBirth || '');
    setEditGender(profile.gender?.toLowerCase() || 'male');
    setIsEditModalVisible(true);
  };

  const handleSaveProfile = async () => {
    if (!editFirstName.trim() || !editLastName.trim()) {
      Alert.alert('Required Fields', 'First name and last name are required.');
      return;
    }

    setIsSavingProfile(true);
    try {
      const response = await graphqlRequest<{ updateProfile: { success: boolean; error: string | null } }>(
        UPDATE_PROFILE_MUTATION,
        {
          input: {
            firstName: editFirstName.trim(),
            lastName: editLastName.trim(),
            phoneNumber: editPhoneNumber.trim() || null,
            dateOfBirth: editDateOfBirth.trim() || null,
            gender: editGender.toLowerCase(),
          },
        }
      );

      if (response?.updateProfile?.success) {
        Alert.alert('Profile Updated', 'Your profile details have been saved successfully.');
        setIsEditModalVisible(false);
        fetchProfileData();
      } else {
        Alert.alert('Error', response?.updateProfile?.error || 'Failed to update profile.');
      }
    } catch (err: any) {
      console.error('Update profile error:', err);
      Alert.alert('Error', err.message || 'Failed to update profile.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePickPhoto = () => {
    Alert.alert(
      'Update Profile Photo',
      'Select a source to upload your avatar photo:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Take Photo',
          onPress: async () => {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Camera Permission', 'Camera access is required to take a profile photo.');
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.85,
            });
            if (!result.canceled && result.assets?.[0]?.uri) {
              uploadPhotoFile(result.assets[0].uri);
            }
          },
        },
        {
          text: 'Choose from Gallery',
          onPress: async () => {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Gallery Permission', 'Photo library access is required.');
              return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.85,
            });
            if (!result.canceled && result.assets?.[0]?.uri) {
              uploadPhotoFile(result.assets[0].uri);
            }
          },
        },
      ]
    );
  };

  const uploadPhotoFile = async (imageUri: string) => {
    setIsUploadingPhoto(true);
    try {
      const uploadResult = await FileSystem.uploadAsync(
        `${API_URL}/api/users/update_profile/`,
        imageUri,
        {
          httpMethod: 'PATCH',
          uploadType: ((FileSystem as any).FileSystemUploadType?.MULTIPART ?? 1) as any,
          fieldName: 'profile_picture',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (uploadResult.status >= 200 && uploadResult.status < 300) {
        Alert.alert('Success', 'Profile photo updated successfully!');
        fetchProfileData();
      } else {
        let errMessage = 'Failed to upload photo';
        try {
          const body = JSON.parse(uploadResult.body);
          if (body.error) errMessage = body.error;
        } catch {}
        Alert.alert('Upload Error', errMessage);
      }
    } catch (error: any) {
      console.error('Photo upload error:', error);
      Alert.alert('Upload Error', error.message || 'Network error while uploading photo.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  if (isLoading && !profile) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={accentColors.primary} />
      </View>
    );
  }

  if (!profile) return null;

  const getInitials = () => {
    const first = profile.firstName?.charAt(0) || '';
    const last = profile.lastName?.charAt(0) || '';
    return (first + last).toUpperCase() || '?';
  };

  const getFormattedEmploymentType = (type: string | null) => {
    if (!type) return 'N/A';
    return type.split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const renderDetailRow = (icon: any, label: string, value: string | null | undefined, isLast = false) => {
    return (
      <View style={[styles.detailRow, isLast && styles.noBorder]}>
        <View style={styles.detailIconWrapper}>
          <Ionicons name={icon} size={18} color={accentColors.primary} />
        </View>
        <View style={styles.detailTextWrapper}>
          <Text style={styles.detailLabel}>{label}</Text>
          <Text style={styles.detailValue}>{value || 'Not Configured'}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeContainer} edges={['top', 'bottom', 'left', 'right']}>
      {/* Uniform ScreenHeader with No (tabs) text and right Edit button */}
      <ScreenHeader
        title="My Profile"
        subtitle="Workplace Profile & Credentials"
        showBack={true}
        showNotifications={true}
        rightElement={
          <TouchableOpacity
            style={[
              styles.editHeaderBtn,
              { backgroundColor: accentColors.light, borderColor: accentColors.primary },
            ]}
            onPress={handleOpenEditModal}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Edit Profile Details"
          >
            <Ionicons name="pencil" size={14} color={accentColors.primary} style={{ marginRight: 4 }} />
            <Text style={[styles.editHeaderBtnText, { color: accentColors.primary }]}>Edit</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accentColors.primary} />
        }
      >
        {/* Header Hero */}
        <View style={styles.headerHero}>
          <View style={styles.avatarContainer}>
            {profile.profilePictureUrl ? (
              <Image
                source={{ uri: profile.profilePictureUrl }}
                style={styles.avatarImage}
                fadeDuration={0}
              />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: accentColors.primary }]}>
                <Text style={styles.avatarText}>{getInitials()}</Text>
              </View>
            )}
            <TouchableOpacity
              style={[
                styles.photoEditBadge,
                { backgroundColor: accentColors.primary, borderColor: colors.backgroundCard },
              ]}
              onPress={handlePickPhoto}
              disabled={isUploadingPhoto}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Change Profile Photo"
            >
              {isUploadingPhoto ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Ionicons name="camera" size={16} color="#ffffff" />
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.fullName}>
            {profile.firstName} {profile.lastName}
          </Text>
          <Text style={styles.roleSubtext}>
            {profile.designation?.name || 'Employee'} • {profile.department?.name || 'General'}
          </Text>

          <View style={styles.verifiedBadgeRow}>
            <View style={[styles.badge, profile.isVerified ? styles.verifiedBadge : styles.pendingBadge]}>
              <Ionicons
                name={profile.isVerified ? 'checkmark-circle' : 'alert-circle'}
                size={12}
                color={profile.isVerified ? '#10b981' : '#f59e0b'}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.badgeText, { color: profile.isVerified ? '#10b981' : '#f59e0b' }]}>
                {profile.isVerified ? 'Verified Account' : 'Pending Verification'}
              </Text>
            </View>
            {!profile.isVerified && (
              <Text style={styles.verifyHint}>
                Completes when required onboarding tasks are done
              </Text>
            )}
          </View>
        </View>

        {/* Highlight Stats Row */}
        <View style={styles.statsSummaryRow}>
          <View style={styles.statSummaryBox}>
            <Text style={styles.statSummaryLabel}>Attendance</Text>
            <Text style={styles.statSummaryValue}>{profile.attendanceRate}%</Text>
          </View>
          <View style={styles.statSummaryDivider} />
          <View style={styles.statSummaryBox}>
            <Text style={styles.statSummaryLabel}>Leaves Left</Text>
            <Text style={styles.statSummaryValue}>{profile.leaveBalance} d</Text>
          </View>
          <View style={styles.statSummaryDivider} />
          <View style={styles.statSummaryBox}>
            <Text style={styles.statSummaryLabel}>Tenure</Text>
            <Text style={styles.statSummaryValue}>{profile.tenureDisplay}</Text>
          </View>
        </View>

        {/* Segmented Controls (Tab Switcher) */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'personal' && styles.activeTabItem]}
            onPress={() => setActiveTab('personal')}
          >
            <Ionicons name="person" size={16} color={activeTab === 'personal' ? accentColors.primary : colors.textMuted} />
            <Text style={[styles.tabText, activeTab === 'personal' && styles.activeTabText]}>Personal</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'employment' && styles.activeTabItem]}
            onPress={() => setActiveTab('employment')}
          >
            <Ionicons name="briefcase" size={16} color={activeTab === 'employment' ? accentColors.primary : colors.textMuted} />
            <Text style={[styles.tabText, activeTab === 'employment' && styles.activeTabText]}>Employment</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'financial' && styles.activeTabItem]}
            onPress={() => setActiveTab('financial')}
          >
            <Ionicons name="card" size={16} color={activeTab === 'financial' ? accentColors.primary : colors.textMuted} />
            <Text style={[styles.tabText, activeTab === 'financial' && styles.activeTabText]}>Financial</Text>
          </TouchableOpacity>
        </View>

        {/* Tab Detail Cards */}
        <View style={styles.card}>
          {activeTab === 'personal' && (
            <View>
              <Text style={styles.cardSectionTitle}>Personal Information</Text>
              {renderDetailRow('mail-outline', 'Email Address', profile.email)}
              {renderDetailRow('phone-portrait-outline', 'Phone Number', profile.phoneNumber)}
              {renderDetailRow('finger-print-outline', 'Username', profile.username)}
              {renderDetailRow(
                'transgender-outline',
                'Gender',
                profile.gender ? profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1) : 'Not Configured'
              )}
              {renderDetailRow('gift-outline', 'Date of Birth', formatDate(profile.dateOfBirth), true)}
            </View>
          )}

          {activeTab === 'employment' && (
            <View>
              <Text style={styles.cardSectionTitle}>Employment Setup</Text>
              {renderDetailRow('id-card-outline', 'Employee ID', profile.employeeId)}
              {renderDetailRow('business-outline', 'Department', profile.department?.name)}
              {renderDetailRow('ribbon-outline', 'Designation', profile.designation?.name)}
              {renderDetailRow('hourglass-outline', 'Employment Type', getFormattedEmploymentType(profile.employmentType))}
              {renderDetailRow('calendar-outline', 'Date of Joining', formatDate(profile.dateOfJoining))}
              {renderDetailRow(
                'people-outline',
                'Reporting Manager',
                profile.manager ? `${profile.manager.firstName} ${profile.manager.lastName}` : 'Direct Report to CEO'
              )}
              {renderDetailRow('location-outline', 'Office Geofenced Location', profile.officeLocation?.name, true)}
            </View>
          )}

          {activeTab === 'financial' && (
            <View>
              <Text style={styles.cardSectionTitle}>Banking & Tax Registry</Text>
              {renderDetailRow(
                'wallet-outline',
                'Bank Account Number',
                profile.bankAccountNumber ? `•••• •••• ${profile.bankAccountNumber.slice(-4)}` : 'Not Configured'
              )}
              {renderDetailRow('shield-checkmark-outline', 'IFSC Bank Code', profile.bankIfscCode)}
              {renderDetailRow('document-text-outline', 'PAN Identification Number', profile.panNumber)}
              {renderDetailRow(
                'key-outline',
                'Aadhaar Identification Number',
                profile.aadharNumber ? `•••• •••• ${profile.aadharNumber.slice(-4)}` : 'Not Configured'
              )}
              {renderDetailRow('trending-up-outline', 'Universal Account Number (UAN)', profile.uanNumber, true)}
            </View>
          )}
        </View>

        {/* Log Out button */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={async () => {
            try {
              await signOut();
              router.replace('/login');
            } catch (err) {
              console.error('Error during signOut:', err);
            }
          }}
        >
          <Ionicons name="log-out" size={20} color="#ef4444" style={{ marginRight: 8 }} />
          <Text style={styles.logoutText}>Sign Out of System</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal
        visible={isEditModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsEditModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalBackdrop}
        >
          <View style={[styles.modalCard, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Edit Personal Details</Text>
              <TouchableOpacity
                onPress={() => setIsEditModalVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>First Name *</Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
                value={editFirstName}
                onChangeText={setEditFirstName}
                placeholder="Enter first name"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Last Name *</Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
                value={editLastName}
                onChangeText={setEditLastName}
                placeholder="Enter last name"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Phone Number</Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
                value={editPhoneNumber}
                onChangeText={setEditPhoneNumber}
                placeholder="+91 9876543210"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
              />

              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Date of Birth (YYYY-MM-DD)</Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.inputBg, color: colors.text, borderColor: colors.border }]}
                value={editDateOfBirth}
                onChangeText={setEditDateOfBirth}
                placeholder="1995-05-20"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Gender</Text>
              <View style={styles.genderRow}>
                {['male', 'female', 'other'].map((g) => (
                  <TouchableOpacity
                    key={g}
                    style={[
                      styles.genderChip,
                      {
                        backgroundColor: editGender === g ? accentColors.primary : colors.inputBg,
                        borderColor: editGender === g ? accentColors.primary : colors.border,
                      },
                    ]}
                    onPress={() => setEditGender(g)}
                  >
                    <Text style={[styles.genderChipText, { color: editGender === g ? '#ffffff' : colors.text }]}>
                      {g.charAt(0).toUpperCase() + g.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: colors.border }]}
                onPress={() => setIsEditModalVisible(false)}
              >
                <Text style={[styles.modalCancelText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, { backgroundColor: accentColors.primary }]}
                onPress={handleSaveProfile}
                disabled={isSavingProfile}
              >
                {isSavingProfile ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.modalSaveText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const getStyles = (colors: any, accentColors: any, isDark: boolean) =>
  StyleSheet.create({
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
    editHeaderBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 12,
      borderWidth: 1,
    },
    editHeaderBtnText: {
      fontSize: 12,
      fontWeight: '700',
    },
    headerHero: {
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 6,
      marginBottom: 20,
    },
    avatarContainer: {
      position: 'relative',
      marginBottom: 12,
    },
    avatarImage: {
      width: 96,
      height: 96,
      borderRadius: 48,
      borderWidth: 3,
      borderColor: accentColors.primary,
    },
    avatarPlaceholder: {
      width: 96,
      height: 96,
      borderRadius: 48,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 3,
      borderColor: accentColors.primary,
    },
    avatarText: {
      color: '#ffffff',
      fontSize: 32,
      fontWeight: '900',
    },
    photoEditBadge: {
      position: 'absolute',
      bottom: 2,
      right: 2,
      width: 32,
      height: 32,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2.5,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 4,
    },
    fullName: {
      color: colors.text,
      fontSize: 22,
      fontWeight: '900',
      textAlign: 'center',
    },
    roleSubtext: {
      color: colors.textSecondary,
      fontSize: 14,
      marginTop: 4,
      fontWeight: '600',
      textAlign: 'center',
    },
    verifiedBadgeRow: {
      marginTop: 8,
      alignItems: 'center',
    },
    verifyHint: {
      marginTop: 6,
      fontSize: 11,
      color: colors.textSecondary,
      textAlign: 'center',
      maxWidth: 240,
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 20,
      borderWidth: 1,
    },
    verifiedBadge: {
      backgroundColor: '#10b98115',
      borderColor: '#10b98135',
    },
    pendingBadge: {
      backgroundColor: '#f59e0b15',
      borderColor: '#f59e0b35',
    },
    badgeText: {
      fontSize: 11,
      fontWeight: '700',
    },
    statsSummaryRow: {
      flexDirection: 'row',
      backgroundColor: colors.backgroundCard,
      borderRadius: 16,
      paddingVertical: 14,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 16,
      alignItems: 'center',
    },
    statSummaryBox: {
      flex: 1,
      alignItems: 'center',
    },
    statSummaryDivider: {
      width: 1,
      height: 24,
      backgroundColor: colors.border,
    },
    statSummaryLabel: {
      fontSize: 11,
      color: colors.textSecondary,
      fontWeight: '600',
      marginBottom: 4,
    },
    statSummaryValue: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.text,
    },
    tabBar: {
      flexDirection: 'row',
      backgroundColor: colors.backgroundCard,
      borderRadius: 14,
      padding: 4,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 16,
    },
    tabItem: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      borderRadius: 10,
      gap: 6,
    },
    activeTabItem: {
      backgroundColor: accentColors.light,
    },
    tabText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    activeTabText: {
      color: accentColors.primary,
      fontWeight: '700',
    },
    card: {
      backgroundColor: colors.backgroundCard,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 20,
    },
    cardSectionTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.text,
      marginBottom: 12,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderLight,
    },
    noBorder: {
      borderBottomWidth: 0,
    },
    detailIconWrapper: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: accentColors.light,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    detailTextWrapper: {
      flex: 1,
    },
    detailLabel: {
      fontSize: 11,
      color: colors.textSecondary,
      fontWeight: '500',
    },
    detailValue: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
      marginTop: 2,
    },
    logoutButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#ef444415',
      borderWidth: 1,
      borderColor: '#ef444430',
      borderRadius: 14,
      paddingVertical: 14,
      marginTop: 4,
    },
    logoutText: {
      color: '#ef4444',
      fontSize: 14,
      fontWeight: '700',
    },
    modalBackdrop: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.55)',
      padding: 20,
    },
    modalCard: {
      width: '100%',
      maxHeight: '85%',
      borderRadius: 20,
      borderWidth: 1,
      padding: 20,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '800',
    },
    modalBody: {
      maxHeight: 380,
    },
    inputLabel: {
      fontSize: 12,
      fontWeight: '700',
      marginTop: 10,
      marginBottom: 6,
    },
    textInput: {
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
    },
    genderRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 4,
      marginBottom: 12,
    },
    genderChip: {
      flex: 1,
      paddingVertical: 9,
      borderRadius: 10,
      borderWidth: 1,
      alignItems: 'center',
    },
    genderChipText: {
      fontSize: 13,
      fontWeight: '700',
    },
    modalFooter: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 20,
    },
    modalCancelBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: 'center',
    },
    modalCancelText: {
      fontSize: 14,
      fontWeight: '700',
    },
    modalSaveBtn: {
      flex: 1.5,
      paddingVertical: 12,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalSaveText: {
      color: '#ffffff',
      fontSize: 14,
      fontWeight: '700',
    },
  });
