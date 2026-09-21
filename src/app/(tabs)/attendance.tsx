import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { LocationService, Coordinates } from '../../services/location';
import { AuthService } from '../../services/auth';
import { API_URL, graphqlRequest } from '../../services/api';
import { useAppTheme } from '../../context/ThemeContext';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { descriptorFromPhoto } from '../../services/faceDescriptor';
import Sidebar from '../../components/Sidebar';
import AttendanceRadar from '../../components/AttendanceRadar';
import AttendanceCorrectionModal from '../../components/AttendanceCorrectionModal';
import ScreenHeader from '../../components/ScreenHeader';

const ATTENDANCE_SETUP_QUERY = `
  query GetAttendanceSetup {
    me {
      id
      firstName
      lastName
      faceEnrolled
      faceDescriptor
      organization {
        id
        accent
        faceAttendanceEnabled
      }
      officeLocation {
        id
        name
        latitude
        longitude
        geoRadiusMeters
      }
    }
    myAttendance {
      id
      attendanceDate
      loginTime
      logoutTime
      isWithinGeofence
      loginLatitude
      loginLongitude
      loginDistance
      logoutLatitude
      logoutLongitude
      logoutDistance
      status
      workedHours
      checkInSelfieUrl
      checkOutSelfieUrl
      faceMatchScore
      faceVerified
    }
  }
`;

const CHECK_IN_MUTATION = `
  mutation CheckIn($input: CheckInInput!) {
    checkIn(input: $input) {
      id
      loginTime
      isWithinGeofence
      faceVerified
    }
  }
`;

const CHECK_OUT_MUTATION = `
  mutation CheckOut($input: CheckOutInput!) {
    checkOut(input: $input) {
      id
      logoutTime
      isWithinGeofence
      faceVerified
    }
  }
`;

const ENROLL_FACE_MUTATION = `
  mutation EnrollFace($input: EnrollFaceInput!) {
    enrollFace(input: $input) {
      success
      error
      user {
        id
        faceEnrolled
        faceDescriptor
      }
    }
  }
`;

interface AttendanceSetupData {
  me: {
    id: string;
    firstName: string;
    lastName: string;
    faceEnrolled?: boolean;
    faceDescriptor?: number[] | null;
    organization?: {
      id: string;
      accent?: string | null;
      faceAttendanceEnabled?: boolean;
    };
    officeLocation?: {
      id: string;
      name: string;
      latitude: number;
      longitude: number;
      geoRadiusMeters: number;
    };
  };
  myAttendance: Array<{
    id: string;
    attendanceDate: string;
    loginTime: string | null;
    logoutTime: string | null;
    isWithinGeofence: boolean;
    loginLatitude: number | null;
    loginLongitude: number | null;
    loginDistance: number | null;
    logoutLatitude: number | null;
    logoutLongitude: number | null;
    logoutDistance: number | null;
    status: string | null;
    workedHours: number | null;
    checkInSelfieUrl?: string | null;
    checkOutSelfieUrl?: string | null;
    faceMatchScore?: number | null;
    faceVerified?: boolean | null;
  }>;
}

// Module-level in-memory cache for instant route revisit
let cachedSetupData: AttendanceSetupData | null = null;

export default function AttendanceScreen() {
  const router = useRouter();
  const { colors, accentColors, isDark, setOrgAccent } = useAppTheme();
  const styles = getStyles(colors, accentColors, isDark);

  // Layout & Navigation State
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);

  // Data & Telemetry State
  const [setupData, setSetupData] = useState<AttendanceSetupData | null>(cachedSetupData);
  const [currentCoords, setCurrentCoords] = useState<Coordinates | null>(null);
  const [distanceToOffice, setDistanceToOffice] = useState<number | null>(null);
  const [isWithinGeofence, setIsWithinGeofence] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // UI Flow State
  const [isLoading, setIsLoading] = useState(!cachedSetupData);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isPunching, setIsPunching] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [showSandbox, setShowSandbox] = useState(false);
  const [now, setNow] = useState(() => new Date());

  // Developer Mock States
  const [isMockEnabled, setIsMockEnabled] = useState(false);

  // Face attendance configuration
  const faceEnabled = !!setupData?.me?.organization?.faceAttendanceEnabled;
  const enrolledDescriptor = setupData?.me?.faceDescriptor || null;
  const faceEnrolled =
    !!setupData?.me?.faceEnrolled &&
    Array.isArray(enrolledDescriptor) &&
    enrolledDescriptor.length === 128;

  // Real-time clock timer
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchSetupData = async (silent = false) => {
    if (!silent && !cachedSetupData) setIsLoading(true);
    try {
      const response = await graphqlRequest<AttendanceSetupData>(ATTENDANCE_SETUP_QUERY);
      cachedSetupData = response;
      setSetupData(response);

      if (response?.me?.organization?.accent) {
        setOrgAccent(response.me.organization.accent);
      }

      const activeMock = await LocationService.isMockLocationActive();
      setIsMockEnabled(activeMock);

      await updateGPSLocation(response);
    } catch (error: any) {
      console.error('Attendance setup error:', error);
      if (!cachedSetupData) {
        Alert.alert('Error', 'Failed to load attendance portal data.');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const updateGPSLocation = async (dataPayload = setupData) => {
    setIsLocating(true);
    setLocationError(null);
    try {
      const result = await LocationService.getCurrentLocationDetailed();
      if (result.coords) {
        setCurrentCoords(result.coords);
        const office = dataPayload?.me?.officeLocation;
        if (office) {
          const status = LocationService.checkGeofence(
            result.coords.latitude,
            result.coords.longitude,
            Number(office.latitude),
            Number(office.longitude),
            Number(office.geoRadiusMeters || 200)
          );
          setDistanceToOffice(status.distance);
          setIsWithinGeofence(status.isWithin);
        }
      } else {
        let msg = 'Could not acquire precise GPS signal.';
        if (result.error === 'PERMISSION_DENIED') {
          msg = 'Location permission is required for attendance verification.';
        } else if (result.error === 'SERVICES_DISABLED') {
          msg = 'Location services are disabled on this device.';
        } else if (result.error === 'GPS_TIMEOUT') {
          msg = 'GPS timed out. Please ensure clear view of sky or Wi-Fi.';
        }
        setLocationError(msg);
      }
    } catch (err: any) {
      setLocationError(err?.message || 'Error resolving location.');
    } finally {
      setIsLocating(false);
    }
  };

  useEffect(() => {
    fetchSetupData();
  }, []);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchSetupData(true);
  };

  // Helper for current punch time string
  const getCurrentTimeFormatted = () => {
    const d = new Date();
    const hrs = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    const secs = String(d.getSeconds()).padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
  };

  // Worked hours live duration formatter
  const formatWorkedDuration = (loginTimeStr: string) => {
    try {
      const [h, m, s] = loginTimeStr.split(':').map(Number);
      const start = new Date();
      start.setHours(h, m, s || 0, 0);
      const totalSeconds = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000));
      const hours = Math.floor(totalSeconds / 3600);
      const mins = Math.floor((totalSeconds % 3600) / 60);
      const secs = totalSeconds % 60;
      return `${hours}h ${mins}m ${secs}s`;
    } catch {
      return '—';
    }
  };

  // Native Device Camera Launcher for Face Enrollment & Verification
  const launchDeviceCameraForFace = async (mode: 'enroll' | 'verify-in' | 'verify-out') => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Camera Permission Denied',
        'Camera access is required for face attendance verification. Please enable camera permission in your system settings.'
      );
      return;
    }

    try {
      // Launch phone's default native camera with front lens and square crop
      const result = await ImagePicker.launchCameraAsync({
        cameraType: ImagePicker.CameraType.front,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
        base64: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      setIsPunching(true);

      const isEnroll = mode === 'enroll';
      const extraction = await descriptorFromPhoto(asset.uri, asset.base64, {
        verify: !isEnroll,
        enroll: isEnroll,
      });

      if (isEnroll) {
        Alert.alert('Face Enrolled', 'Your face profile has been enrolled successfully! You can now check in with your face.');
        fetchSetupData(true);
        return;
      }

      if (mode === 'verify-in') {
        await completePunchWithFace('in', {
          matchScore: extraction.matchScore ?? 1.0,
          verified: extraction.verified ?? true,
          imageBase64: extraction.imageBase64,
          photoUri: asset.uri,
          descriptor: extraction.descriptor,
        });
      } else if (mode === 'verify-out') {
        await completePunchWithFace('out', {
          matchScore: extraction.matchScore ?? 1.0,
          verified: extraction.verified ?? true,
          imageBase64: extraction.imageBase64,
          photoUri: asset.uri,
          descriptor: extraction.descriptor,
        });
      }
    } catch (error: any) {
      Alert.alert(
        'Face Verification',
        error?.message || 'Could not verify face. Please ensure good lighting and face the camera directly.'
      );
    } finally {
      setIsPunching(false);
    }
  };

  // Check In Handler
  const handleCheckIn = async () => {
    if (!currentCoords || !setupData?.me?.officeLocation) {
      Alert.alert('Location Required', 'Acquiring GPS location... Please try again in a moment.');
      updateGPSLocation();
      return;
    }

    if (faceEnabled) {
      if (!faceEnrolled) {
        Alert.alert(
          'Face Enrollment Required',
          'Please enroll your face first to enable biometric punching.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Enroll Now', onPress: () => launchDeviceCameraForFace('enroll') },
          ]
        );
        return;
      }
      await launchDeviceCameraForFace('verify-in');
      return;
    }

    setIsPunching(true);
    try {
      const timeStr = getCurrentTimeFormatted();
      await graphqlRequest(CHECK_IN_MUTATION, {
        input: {
          officeLocationId: setupData.me.officeLocation.id,
          latitude: currentCoords.latitude,
          longitude: currentCoords.longitude,
          loginTime: timeStr,
        },
      });

      Alert.alert('Checked In Successfully', `Recorded your arrival at ${timeStr}`);
      fetchSetupData(true);
    } catch (error: any) {
      Alert.alert('Check-in Failed', error?.message || 'Geofence or server error.');
    } finally {
      setIsPunching(false);
    }
  };

  // Check Out Handler
  const handleCheckOut = async () => {
    if (!currentCoords) {
      Alert.alert('Location Required', 'Acquiring GPS location... Please try again in a moment.');
      updateGPSLocation();
      return;
    }

    if (faceEnabled) {
      if (!faceEnrolled) {
        Alert.alert(
          'Face Enrollment Required',
          'Please enroll your face first.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Enroll Now', onPress: () => launchDeviceCameraForFace('enroll') },
          ]
        );
        return;
      }
      await launchDeviceCameraForFace('verify-out');
      return;
    }

    setIsPunching(true);
    try {
      const timeStr = getCurrentTimeFormatted();
      await graphqlRequest(CHECK_OUT_MUTATION, {
        input: {
          latitude: currentCoords.latitude,
          longitude: currentCoords.longitude,
          logoutTime: timeStr,
        },
      });

      Alert.alert('Checked Out Successfully', `Recorded your departure at ${timeStr}`);
      fetchSetupData(true);
    } catch (error: any) {
      Alert.alert('Check-out Failed', error?.message || 'Geofence or server error.');
    } finally {
      setIsPunching(false);
    }
  };

  // Selfie upload helper
  // Selfie upload helper (Uses JSON Base64 to prevent native FormDataPart errors)
  const uploadSelfie = async (
    recordId: string,
    kind: 'check_in' | 'check_out',
    photoUri: string,
    imageBase64?: string
  ) => {
    try {
      let b64 = imageBase64;
      if (!b64) {
        b64 = await FileSystem.readAsStringAsync(photoUri, { encoding: 'base64' });
      }

      const token = await AuthService.getAccessToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      await fetch(`${API_URL}/api/attendance/selfie/`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          attendance_record_id: recordId,
          kind,
          selfie_base64: b64,
        }),
      });
    } catch {
      // Non-blocking
    }
  };

  // Biometric Face Verification Handler
  const completePunchWithFace = async (
    type: 'in' | 'out',
    result: { matchScore: number; verified: boolean; imageBase64: string; photoUri: string; descriptor: number[] }
  ) => {
    if (!currentCoords || !setupData?.me?.officeLocation) return;
    setIsPunching(true);
    try {
      const timeStr = getCurrentTimeFormatted();
      if (type === 'in') {
        const data = await graphqlRequest<{ checkIn: { id: string } }>(CHECK_IN_MUTATION, {
          input: {
            officeLocationId: setupData.me.officeLocation.id,
            latitude: currentCoords.latitude,
            longitude: currentCoords.longitude,
            loginTime: timeStr,
            faceVerified: result.verified,
            faceMatchScore: result.matchScore,
            faceDescriptor: result.descriptor,
          },
        });
        if (data?.checkIn?.id) {
          await uploadSelfie(String(data.checkIn.id), 'check_in', result.photoUri, result.imageBase64);
        }
        Alert.alert('Verified Check-In', `Face verified · Logged at ${timeStr}`);
      } else {
        const data = await graphqlRequest<{ checkOut: { id: string } }>(CHECK_OUT_MUTATION, {
          input: {
            latitude: currentCoords.latitude,
            longitude: currentCoords.longitude,
            logoutTime: timeStr,
            faceVerified: result.verified,
            faceMatchScore: result.matchScore,
            faceDescriptor: result.descriptor,
          },
        });
        if (data?.checkOut?.id) {
          await uploadSelfie(String(data.checkOut.id), 'check_out', result.photoUri, result.imageBase64);
        }
        Alert.alert('Verified Check-Out', `Face verified · Logged at ${timeStr}`);
      }
      fetchSetupData(true);
    } catch (error: any) {
      Alert.alert('Punch Failed', error?.message || 'Could not record attendance');
    } finally {
      setIsPunching(false);
    }
  };

  // Developer Mock Controls
  const toggleMockLocation = async () => {
    if (isMockEnabled) {
      await LocationService.clearMockLocation();
      setIsMockEnabled(false);
      Alert.alert('Sandbox Disabled', 'Using actual hardware GPS.');
    } else {
      setIsMockEnabled(true);
      Alert.alert('Sandbox Enabled', 'Mock GPS is active.');
    }
    updateGPSLocation();
  };

  const setMockCoords = async (inside: boolean) => {
    const office = setupData?.me?.officeLocation;
    if (!office) return;
    if (inside) {
      await LocationService.setMockLocation(office.latitude, office.longitude);
    } else {
      await LocationService.setMockLocation(office.latitude + 0.05, office.longitude + 0.05);
    }
    updateGPSLocation();
  };

  const office = setupData?.me?.officeLocation;
  const todayRecord =
    setupData?.myAttendance && setupData.myAttendance.length > 0 ? setupData.myAttendance[0] : null;

  // Status computation matching Web
  const isCheckedIn = !!todayRecord?.loginTime;
  const isCheckedOut = !!todayRecord?.logoutTime;

  const statusLabel = useMemo(() => {
    if (todayRecord?.status === 'late_login') return { text: 'Late Entry', color: '#f59e0b', icon: 'alert-circle' as const };
    if (todayRecord?.status === 'early_logout') return { text: 'Early Exit', color: '#f97316', icon: 'alert-circle' as const };
    if (todayRecord?.status === 'absent') return { text: 'Absent', color: '#ef4444', icon: 'close-circle' as const };
    if (isCheckedIn) return { text: 'Active', color: '#10b981', icon: 'checkmark-circle' as const };
    return { text: 'Not Checked In', color: colors.textSecondary, icon: 'time-outline' as const };
  }, [todayRecord, isCheckedIn, colors.textSecondary]);

  if (isLoading && !setupData) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={accentColors.primary} />
        <Text style={styles.loadingText}>Loading attendance portal...</Text>
      </View>
    );
  }

  // Date and Time labels
  const todayDateLabel = now.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const liveTimeLabel = now.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  const loginDistKm = todayRecord?.loginDistance != null ? (todayRecord.loginDistance / 1000).toFixed(2) : '—';
  const logoutDistKm = todayRecord?.logoutDistance != null ? (todayRecord.logoutDistance / 1000).toFixed(2) : '—';

  return (
    <SafeAreaView style={styles.safeContainer} edges={['top', 'left', 'right']}>
      {/* Attendance Correction Modal */}

      <AttendanceCorrectionModal
        visible={isCorrectionModalOpen}
        attendanceRecordId={todayRecord?.id}
        currentLoginTime={todayRecord?.loginTime}
        currentLogoutTime={todayRecord?.logoutTime}
        attendanceDate={todayRecord?.attendanceDate || todayDateLabel}
        checkInSelfieUrl={todayRecord?.checkInSelfieUrl}
        checkOutSelfieUrl={todayRecord?.checkOutSelfieUrl}
        faceMatchScore={todayRecord?.faceMatchScore}
        faceVerified={todayRecord?.faceVerified}
        onClose={() => setIsCorrectionModalOpen(false)}
        onSuccess={() => fetchSetupData(true)}
      />

      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Scroll Content */}
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={accentColors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Header Bar */}
        <ScreenHeader
          title="Attendance"
          subtitle={office?.name ? `Office: ${office.name}` : 'Mark check-in and check-out today'}
          showBack={true}
          showNotifications={false}
          showMenu={false}
          onMenuPress={() => setIsSidebarOpen(true)}
          rightElement={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TouchableOpacity
                style={styles.correctionHeaderBtn}
                onPress={() => router.push('/attendance-requests')}
              >
                <Ionicons name="document-text-outline" size={15} color={accentColors.primary} />
                <Text style={styles.correctionBtnText}>Requests</Text>
              </TouchableOpacity>
            </View>
          }
        />

        {/* Face Attendance Alert Banner */}
        {faceEnabled && (
          <View style={styles.faceBanner}>
            <View style={styles.faceBannerIconBox}>
              <Ionicons name="scan" size={20} color={accentColors.primary} />
            </View>
            <View style={styles.faceBannerContent}>
              <View style={styles.faceBadgeRow}>
                <Text style={styles.faceBannerTitle}>Face Verification</Text>
                <View
                  style={[
                    styles.badgePill,
                    { backgroundColor: faceEnrolled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)' },
                  ]}
                >
                  <Text
                    style={[
                      styles.badgePillText,
                      { color: faceEnrolled ? '#10b981' : '#f59e0b' },
                    ]}
                  >
                    {faceEnrolled ? 'Enrolled' : 'Required'}
                  </Text>
                </View>
              </View>
              <Text style={styles.faceBannerDescription}>
                {faceEnrolled
                  ? 'Check-in and out require facial verification.'
                  : 'Enroll your face once here to unlock biometric punch.'}
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.faceActionBtn,
                { backgroundColor: faceEnrolled ? colors.cardElement : accentColors.primary },
              ]}
              onPress={() => launchDeviceCameraForFace('enroll')}
            >
              <Text
                style={[
                  styles.faceActionBtnText,
                  { color: faceEnrolled ? colors.text : '#ffffff' },
                ]}
              >
                {faceEnrolled ? 'Update' : 'Enroll'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Hero Visualizer Banner */}
        <LinearGradient
          colors={
            isDark
              ? ['#1e293b', '#0f172a']
              : ['#e2e8f0', '#edf2f7']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroBanner}
        >
          <View style={styles.todayPill}>
            <Ionicons name="time-outline" size={14} color={isDark ? '#cbd5e1' : '#475569'} />
            <Text style={styles.todayPillText}>Today</Text>
          </View>

          <Text style={styles.heroDate}>{todayDateLabel}</Text>
          <Text style={styles.heroClock}>{liveTimeLabel}</Text>

          <View style={styles.heroFooter}>
            <View style={styles.statusDotRow}>
              <View style={[styles.statusDot, { backgroundColor: statusLabel.color }]} />
              <Text style={[styles.heroStatusText, { color: statusLabel.color }]}>
                {statusLabel.text}
              </Text>
            </View>
            {isCheckedIn && !isCheckedOut && (
              <Text style={styles.workedDurationText}>
                Duration: {formatWorkedDuration(todayRecord?.loginTime || '09:00:00')}
              </Text>
            )}
          </View>
        </LinearGradient>

        {/* Action Grid: Dual Punch Cards */}
        <View style={styles.punchGrid}>
          {/* Check In Card */}
          <TouchableOpacity
            style={[
              styles.punchCard,
              isCheckedIn && styles.punchCardDisabled,
            ]}
            onPress={handleCheckIn}
            disabled={isCheckedIn || isPunching}
            activeOpacity={0.85}
          >
            <View style={[styles.punchIconContainer, styles.checkInIconBg]}>
              <Ionicons name="checkmark" size={32} color="#10b981" />
            </View>
            <Text style={styles.punchCardTitle}>
              {isPunching && !isCheckedIn ? 'Checking in…' : 'Check in'}
            </Text>
            <Text style={styles.punchCardSubtitle}>Mark your arrival</Text>

            {isCheckedIn ? (
              <View style={styles.punchRecordedBadge}>
                <Ionicons name="checkmark-circle" size={13} color="#10b981" />
                <Text style={styles.punchRecordedText}>
                  Logged at {todayRecord?.loginTime}
                </Text>
              </View>
            ) : (
              <View style={styles.punchTapPrompt}>
                <Text style={styles.punchTapText}>Tap to punch</Text>
                <Ionicons name="arrow-forward" size={12} color={accentColors.primary} />
              </View>
            )}
          </TouchableOpacity>

          {/* Check Out Card */}
          <TouchableOpacity
            style={[
              styles.punchCard,
              (!isCheckedIn || isCheckedOut) && styles.punchCardDisabled,
            ]}
            onPress={handleCheckOut}
            disabled={!isCheckedIn || isCheckedOut || isPunching}
            activeOpacity={0.85}
          >
            <View style={[styles.punchIconContainer, styles.checkOutIconBg]}>
              <Ionicons name="log-out-outline" size={30} color="#ef4444" />
            </View>
            <Text style={styles.punchCardTitle}>
              {isPunching && isCheckedIn ? 'Checking out…' : 'Check out'}
            </Text>
            <Text style={styles.punchCardSubtitle}>Mark your departure</Text>

            {isCheckedOut ? (
              <View style={[styles.punchRecordedBadge, styles.checkOutRecordedBadge]}>
                <Ionicons name="close-circle" size={13} color="#ef4444" />
                <Text style={[styles.punchRecordedText, { color: '#ef4444' }]}>
                  Exited at {todayRecord?.logoutTime}
                </Text>
              </View>
            ) : isCheckedIn ? (
              <View style={styles.punchTapPrompt}>
                <Text style={styles.punchTapText}>Tap to punch out</Text>
                <Ionicons name="arrow-forward" size={12} color="#ef4444" />
              </View>
            ) : (
              <View style={styles.punchWaitingPrompt}>
                <Text style={styles.punchWaitingText}>Requires Check-in</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Location & Geofence Telemetry Section */}
        <View style={styles.cardSection}>
          <View style={styles.cardHeaderRow}>
            <View>
              <Text style={styles.sectionTitle}>Location & Geofence</Text>
              <Text style={styles.sectionSubtitle}>
                {isWithinGeofence ? 'Verified inside office perimeter' : 'Verify position against office perimeter'}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.toggleMapBtn}
              onPress={() => setShowMap((prev) => !prev)}
            >
              <Text style={styles.toggleMapText}>{showMap ? 'Hide map' : 'Show map'}</Text>
              <Ionicons
                name={showMap ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={accentColors.primary}
              />
            </TouchableOpacity>
          </View>

          {/* Telemetry Summary Banner */}
          <View
            style={[
              styles.telemetryBanner,
              {
                backgroundColor: isWithinGeofence
                  ? 'rgba(16, 185, 129, 0.09)'
                  : 'rgba(239, 68, 68, 0.09)',
                borderColor: isWithinGeofence
                  ? 'rgba(16, 185, 129, 0.3)'
                  : 'rgba(239, 68, 68, 0.3)',
              },
            ]}
          >
            <View style={styles.telemetryLeft}>
              <View
                style={[
                  styles.statusIconBox,
                  {
                    backgroundColor: isWithinGeofence
                      ? 'rgba(16, 185, 129, 0.2)'
                      : 'rgba(239, 68, 68, 0.2)',
                  },
                ]}
              >
                <Ionicons
                  name={isWithinGeofence ? 'checkmark' : 'alert-circle'}
                  size={18}
                  color={isWithinGeofence ? '#10b981' : '#ef4444'}
                />
              </View>
              <View>
                <Text
                  style={[
                    styles.telemetryStatusTitle,
                    { color: isWithinGeofence ? '#10b981' : '#ef4444' },
                  ]}
                >
                  {isWithinGeofence ? 'Within Office Range' : 'Outside Office Range'}
                </Text>
                <Text style={styles.telemetryStatusDetails}>
                  Distance: {distanceToOffice != null ? `${(distanceToOffice / 1000).toFixed(2)} km` : '—'} · Allowed: {office?.geoRadiusMeters ? `${(office.geoRadiusMeters / 1000).toFixed(2)} km` : '0.20 km'}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.refreshLocBtn}
              onPress={() => updateGPSLocation()}
              disabled={isLocating}
            >
              {isLocating ? (
                <ActivityIndicator size="small" color={accentColors.primary} />
              ) : (
                <>
                  <Ionicons name="refresh" size={14} color={accentColors.primary} />
                  <Text style={styles.refreshLocText}>Refresh</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Collapsible Radar & Map View */}
          {showMap && (
            <AttendanceRadar
              isWithin={isWithinGeofence}
              distanceMeters={distanceToOffice}
              radiusMeters={office?.geoRadiusMeters || 200}
              officeName={office?.name || 'Central Office'}
              latitude={currentCoords?.latitude}
              longitude={currentCoords?.longitude}
              officeLatitude={office?.latitude}
              officeLongitude={office?.longitude}
            />
          )}

          {locationError && (
            <View style={styles.locErrorBanner}>
              <Ionicons name="warning-outline" size={16} color="#ef4444" />
              <Text style={styles.locErrorText}>{locationError}</Text>
            </View>
          )}
        </View>

        {/* Today's Attendance & Session Summary Card */}
        <View style={styles.cardSection}>
          <Text style={styles.sectionTitle}>Today's Summary</Text>
          <Text style={styles.sectionSubtitle}>Session metrics & recorded distances</Text>

          {/* Status highlight */}
          <View style={styles.todayStatusBox}>
            <View style={styles.statusBoxHeader}>
              <Text style={styles.statusBoxLabel}>Today's Status</Text>
              <View style={[styles.badgePill, { backgroundColor: `${statusLabel.color}15` }]}>
                <Text style={[styles.badgePillText, { color: statusLabel.color }]}>
                  {statusLabel.text}
                </Text>
              </View>
            </View>
            <View style={styles.statusBoxBody}>
              <View
                style={[
                  styles.statusCircleIcon,
                  { backgroundColor: `${statusLabel.color}20` },
                ]}
              >
                <Ionicons name={statusLabel.icon} size={22} color={statusLabel.color} />
              </View>
              <View>
                <Text style={styles.statusDescriptionTitle}>Official Attendance</Text>
                <Text style={styles.statusDescriptionSubtitle}>
                  Computed based on office shifts & geofence
                </Text>
              </View>
            </View>
          </View>

          {/* Distance Metrics Grid */}
          <View style={styles.distGrid}>
            <View style={styles.distTile}>
              <Ionicons name="log-in-outline" size={16} color={accentColors.primary} />
              <Text style={styles.distTileLabel}>Check-in distance</Text>
              <Text
                style={[
                  styles.distTileValue,
                  {
                    color:
                      todayRecord?.loginDistance != null &&
                      todayRecord.loginDistance <= (office?.geoRadiusMeters || 200)
                        ? '#10b981'
                        : todayRecord?.loginDistance != null
                        ? '#ef4444'
                        : colors.text,
                  },
                ]}
              >
                {loginDistKm}
                <Text style={styles.distUnit}> km</Text>
              </Text>
            </View>

            <View style={styles.distTile}>
              <Ionicons name="log-out-outline" size={16} color={accentColors.primary} />
              <Text style={styles.distTileLabel}>Check-out distance</Text>
              <Text
                style={[
                  styles.distTileValue,
                  {
                    color:
                      todayRecord?.logoutDistance != null &&
                      todayRecord.logoutDistance <= (office?.geoRadiusMeters || 200)
                        ? '#10b981'
                        : todayRecord?.logoutDistance != null
                        ? '#ef4444'
                        : colors.text,
                  },
                ]}
              >
                {logoutDistKm}
                <Text style={styles.distUnit}> km</Text>
              </Text>
            </View>
          </View>

          {/* Session Summary Breakdown */}
          <View style={styles.sessionList}>
            <Text style={styles.sessionListHeader}>SESSION BREAKDOWN</Text>

            <View style={styles.sessionRow}>
              <View style={styles.sessionRowLeft}>
                <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.sessionRowLabel}>Check in</Text>
              </View>
              <Text style={styles.sessionRowValue}>{todayRecord?.loginTime || '—'}</Text>
            </View>

            <View style={styles.sessionRow}>
              <View style={styles.sessionRowLeft}>
                <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.sessionRowLabel}>Check out</Text>
              </View>
              <Text style={styles.sessionRowValue}>{todayRecord?.logoutTime || '—'}</Text>
            </View>

            <View style={styles.sessionRow}>
              <View style={styles.sessionRowLeft}>
                <Ionicons name="trending-up-outline" size={16} color={colors.textSecondary} />
                <Text style={styles.sessionRowLabel}>Hours worked</Text>
              </View>
              <Text style={[styles.sessionRowValue, { color: accentColors.primary }]}>
                {isCheckedIn && !isCheckedOut
                  ? formatWorkedDuration(todayRecord?.loginTime || '09:00:00')
                  : todayRecord?.workedHours != null
                  ? `${Number(todayRecord.workedHours).toFixed(1)}h`
                  : '0.0h'}
              </Text>
            </View>
          </View>
        </View>

        {/* Location Policy Notice */}
        <View style={styles.policyCard}>
          <View style={styles.policyIconContainer}>
            <Ionicons name="shield-checkmark" size={20} color={accentColors.primary} />
          </View>
          <View style={styles.policyContent}>
            <Text style={styles.policyTitle}>Location-Based Verification</Text>
            <Text style={styles.policyText}>
              Keep location services enabled so your punch distance is recorded accurately. Discrepancies may be flagged for manager review.
            </Text>
          </View>
        </View>

        {/* Developer Sandbox Section */}
        <View style={styles.sandboxContainer}>
          <TouchableOpacity
            style={styles.sandboxHeader}
            onPress={() => setShowSandbox((prev) => !prev)}
          >
            <View style={styles.sandboxHeaderTitle}>
              <Ionicons name="code-slash-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.sandboxHeaderText}>Developer Sandbox (Mock GPS)</Text>
            </View>
            <Ionicons
              name={showSandbox ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={colors.textSecondary}
            />
          </TouchableOpacity>

          {showSandbox && (
            <View style={styles.sandboxContent}>
              <Text style={styles.sandboxHint}>
                Simulate GPS locations to test radius enforcement without needing to travel to the physical site.
              </Text>

              <View style={styles.sandboxToggleRow}>
                <Text style={styles.sandboxToggleLabel}>Enable Mock Location</Text>
                <TouchableOpacity onPress={toggleMockLocation}>
                  <Ionicons
                    name={isMockEnabled ? 'toggle' : 'toggle-outline'}
                    size={32}
                    color={isMockEnabled ? accentColors.primary : colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>

              {isMockEnabled && (
                <View style={styles.sandboxBtnGroup}>
                  <TouchableOpacity
                    style={[styles.sandboxBtn, styles.sandboxInBtn]}
                    onPress={() => setMockCoords(true)}
                  >
                    <Ionicons name="pin" size={14} color="#10b981" />
                    <Text style={styles.sandboxBtnText}>Simulate In-Office</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.sandboxBtn, styles.sandboxOutBtn]}
                    onPress={() => setMockCoords(false)}
                  >
                    <Ionicons name="navigate-outline" size={14} color="#ef4444" />
                    <Text style={[styles.sandboxBtnText, { color: '#ef4444' }]}>
                      Simulate Out-of-Office
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>
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
      gap: 12,
    },
    loadingText: {
      fontSize: 14,
      color: colors.textSecondary,
      fontWeight: '500',
    },
    container: {
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 110,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
    },
    iconBtn: {
      padding: 6,
      borderRadius: 10,
      backgroundColor: colors.cardElement,
    },
    headerTitles: {
      flex: 1,
    },
    pageTitle: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: -0.5,
    },
    pageSubtitle: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    correctionHeaderBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: accentColors.light,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: accentColors.primary + '30',
    },
    correctionBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: accentColors.primary,
    },
    faceBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: isDark ? '#1e293b50' : '#f8fafc',
      padding: 14,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 18,
    },
    faceBannerIconBox: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: accentColors.light,
      justifyContent: 'center',
      alignItems: 'center',
    },
    faceBannerContent: {
      flex: 1,
    },
    faceBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    faceBannerTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
    },
    faceBannerDescription: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 2,
    },
    faceActionBtn: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 10,
    },
    faceActionBtnText: {
      fontSize: 12,
      fontWeight: '700',
    },
    badgePill: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
    },
    badgePillText: {
      fontSize: 10,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    heroBanner: {
      borderRadius: 22,
      padding: 22,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDark ? 0.4 : 0.06,
      shadowRadius: 10,
      elevation: 4,
    },
    todayPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: isDark ? '#0f172a' : '#ffffff',
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.borderLight,
      marginBottom: 10,
    },
    todayPillText: {
      fontSize: 11,
      fontWeight: '700',
      color: isDark ? '#cbd5e1' : '#475569',
    },
    heroDate: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: -0.3,
    },
    heroClock: {
      fontSize: 32,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: -0.5,
      marginTop: 4,
      fontVariant: ['tabular-nums'],
    },
    heroFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 14,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: isDark ? '#33415550' : '#cbd5e150',
    },
    statusDotRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    heroStatusText: {
      fontSize: 12,
      fontWeight: '700',
    },
    workedDurationText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    punchGrid: {
      flexDirection: 'row',
      gap: 14,
      marginBottom: 22,
    },
    punchCard: {
      flex: 1,
      backgroundColor: colors.backgroundCard,
      borderRadius: 20,
      padding: 16,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.3 : 0.05,
      shadowRadius: 8,
      elevation: 4,
    },
    punchCardDisabled: {
      opacity: 0.55,
    },
    punchIconContainer: {
      width: 58,
      height: 58,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 12,
    },
    checkInIconBg: {
      backgroundColor: 'rgba(16, 185, 129, 0.12)',
    },
    checkOutIconBg: {
      backgroundColor: 'rgba(239, 68, 68, 0.12)',
    },
    punchCardTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 2,
    },
    punchCardSubtitle: {
      fontSize: 11,
      color: colors.textSecondary,
      marginBottom: 12,
    },
    punchRecordedBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(16, 185, 129, 0.12)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
    },
    checkOutRecordedBadge: {
      backgroundColor: 'rgba(239, 68, 68, 0.12)',
    },
    punchRecordedText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#10b981',
    },
    punchTapPrompt: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 4,
    },
    punchTapText: {
      fontSize: 11,
      fontWeight: '700',
      color: accentColors.primary,
    },
    punchWaitingPrompt: {
      paddingVertical: 4,
    },
    punchWaitingText: {
      fontSize: 11,
      fontWeight: '500',
      color: colors.textMuted,
    },
    cardSection: {
      backgroundColor: colors.backgroundCard,
      borderRadius: 22,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.25 : 0.04,
      shadowRadius: 6,
      elevation: 3,
    },
    cardHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
    sectionSubtitle: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    toggleMapBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: accentColors.light,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
    },
    toggleMapText: {
      fontSize: 11,
      fontWeight: '700',
      color: accentColors.primary,
    },
    telemetryBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 12,
      borderRadius: 14,
      borderWidth: 1,
      marginTop: 4,
    },
    telemetryLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
    },
    statusIconBox: {
      width: 32,
      height: 32,
      borderRadius: 10,
      justifyContent: 'center',
      alignItems: 'center',
    },
    telemetryStatusTitle: {
      fontSize: 12,
      fontWeight: '700',
    },
    telemetryStatusDetails: {
      fontSize: 10,
      color: colors.textSecondary,
      marginTop: 2,
    },
    refreshLocBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: colors.backgroundCard,
      borderWidth: 1,
      borderColor: colors.border,
    },
    refreshLocText: {
      fontSize: 11,
      fontWeight: '600',
      color: accentColors.primary,
    },
    locErrorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
      padding: 10,
      borderRadius: 10,
      marginTop: 10,
    },
    locErrorText: {
      fontSize: 11,
      color: '#ef4444',
      flex: 1,
    },
    todayStatusBox: {
      backgroundColor: isDark ? '#1e293b40' : '#f8fafc',
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.borderLight,
      marginTop: 12,
      marginBottom: 14,
    },
    statusBoxHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    statusBoxLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    statusBoxBody: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    statusCircleIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
    },
    statusDescriptionTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
    },
    statusDescriptionSubtitle: {
      fontSize: 11,
      color: colors.textSecondary,
      marginTop: 2,
    },
    distGrid: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 16,
    },
    distTile: {
      flex: 1,
      backgroundColor: isDark ? '#1e293b40' : '#f8fafc',
      padding: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.borderLight,
    },
    distTileLabel: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.textSecondary,
      marginTop: 6,
      marginBottom: 2,
    },
    distTileValue: {
      fontSize: 16,
      fontWeight: '800',
    },
    distUnit: {
      fontSize: 11,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    sessionList: {
      borderTopWidth: 1,
      borderTopColor: colors.borderLight,
      paddingTop: 12,
    },
    sessionListHeader: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.8,
      color: colors.textMuted,
      marginBottom: 10,
    },
    sessionRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 7,
    },
    sessionRowLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    sessionRowLabel: {
      fontSize: 12,
      color: colors.textSecondary,
      fontWeight: '500',
    },
    sessionRowValue: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.text,
      fontVariant: ['tabular-nums'],
    },
    policyCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      backgroundColor: accentColors.light,
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: accentColors.primary + '25',
      marginBottom: 18,
    },
    policyIconContainer: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: '#ffffff',
      justifyContent: 'center',
      alignItems: 'center',
    },
    policyContent: {
      flex: 1,
    },
    policyTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: accentColors.primary,
    },
    policyText: {
      fontSize: 11,
      lineHeight: 16,
      color: colors.textSecondary,
      marginTop: 2,
    },
    sandboxContainer: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.borderLight,
      backgroundColor: isDark ? '#0f172a50' : '#f8fafc',
      overflow: 'hidden',
    },
    sandboxHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 12,
    },
    sandboxHeaderTitle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    sandboxHeaderText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    sandboxContent: {
      padding: 12,
      paddingTop: 0,
    },
    sandboxHint: {
      fontSize: 10,
      color: colors.textMuted,
      lineHeight: 14,
      marginBottom: 10,
    },
    sandboxToggleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 6,
      borderTopWidth: 1,
      borderTopColor: colors.borderLight,
    },
    sandboxToggleLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text,
    },
    sandboxBtnGroup: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 8,
    },
    sandboxBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
    },
    sandboxInBtn: {
      backgroundColor: 'rgba(16, 185, 129, 0.1)',
      borderColor: '#10b981',
    },
    sandboxOutBtn: {
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
      borderColor: '#ef4444',
    },
    sandboxBtnText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#10b981',
    },
  });
