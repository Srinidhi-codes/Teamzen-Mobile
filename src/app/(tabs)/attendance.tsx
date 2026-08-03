import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LocationService, Coordinates } from '../../services/location';
import { AuthService } from '../../services/auth';
import { API_URL, graphqlRequest } from '../../services/api';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Sidebar from '../../components/Sidebar';
import { useAppTheme } from '../../context/ThemeContext';
import FaceCaptureModal from '../../components/FaceCaptureModal';

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
      loginTime
      logoutTime
      isWithinGeofence
      loginLatitude
      loginLongitude
      loginDistance
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
    loginTime: string | null;
    logoutTime: string | null;
    isWithinGeofence: boolean;
    loginLatitude: number | null;
    loginLongitude: number | null;
    loginDistance: number | null;
  }>;
}

export default function AttendanceScreen() {
  const router = useRouter();
  const { colors, accentColors, isDark } = useAppTheme();
  const styles = getStyles(colors, accentColors, isDark);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [setupData, setSetupData] = useState<AttendanceSetupData | null>(null);
  const [currentCoords, setCurrentCoords] = useState<Coordinates | null>(null);
  const [distanceToOffice, setDistanceToOffice] = useState<number | null>(null);
  const [isWithinGeofence, setIsWithinGeofence] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPunching, setIsPunching] = useState(false);
  const [faceModal, setFaceModal] = useState<"enroll" | "verify-in" | "verify-out" | null>(null);
  
  // Developer mock states
  const [isMockEnabled, setIsMockEnabled] = useState(false);

  const faceEnabled = !!setupData?.me?.organization?.faceAttendanceEnabled;
  const faceEnrolled = !!setupData?.me?.faceEnrolled;
  const enrolledDescriptor = setupData?.me?.faceDescriptor || null;

  const fetchSetupData = async () => {
    try {
      const response = await graphqlRequest<AttendanceSetupData>(ATTENDANCE_SETUP_QUERY);
      setSetupData(response);
      
      const activeMock = await LocationService.isMockLocationActive();
      setIsMockEnabled(activeMock);
      
      await updateGPSLocation(response);
    } catch (error: any) {
      console.error('Setup error:', error);
      Alert.alert('Error', 'Failed to load attendance portal configurations.');
    } finally {
      setIsLoading(false);
    }
  };

  const updateGPSLocation = async (dataPayload = setupData) => {
    if (!dataPayload?.me?.officeLocation) return;
    
    const result = await LocationService.getCurrentLocationDetailed();
    if (result.coords) {
      setCurrentCoords(result.coords);
      const office = dataPayload.me?.officeLocation;
      const status = LocationService.checkGeofence(
        result.coords.latitude,
        result.coords.longitude,
        office.latitude,
        office.longitude,
        office.geoRadiusMeters
      );
      setDistanceToOffice(status.distance);
      setIsWithinGeofence(status.isWithin);
    } else {
      let title = 'Location Error';
      let message = 'Could not resolve GPS location. Please check your network and device GPS settings.';
      
      if (result.error === 'PERMISSION_DENIED') {
        title = 'Permission Denied';
        message = 'Location permission is required for attendance verification. Please grant permission in your device settings.';
      } else if (result.error === 'SERVICES_DISABLED') {
        title = 'Location Services Disabled';
        message = 'GPS/Location services are turned off on your device. Please enable location services in your system settings.';
      } else if (result.error === 'GPS_TIMEOUT') {
        title = 'GPS Timeout';
        message = 'Failed to get a precise location signal within the timeout period. Please step near a window or move to an open area and try again.';
      }
      
      Alert.alert(title, message);
    }
  };

  useEffect(() => {
    fetchSetupData();
  }, []);

  const getCurrentTimeFormatted = () => {
    const now = new Date();
    const hrs = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    const secs = String(now.getSeconds()).padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
  };

  const handleCheckIn = async () => {
    if (!currentCoords || !setupData?.me?.officeLocation) {
      Alert.alert('Error', 'Missing GPS location or assigned office details.');
      return;
    }

    if (faceEnabled) {
      if (!faceEnrolled) {
        Alert.alert('Face enrollment required', 'Enroll your face before punching.');
        setFaceModal('enroll');
        return;
      }
      setFaceModal('verify-in');
      return;
    }

    setIsPunching(true);
    try {
      const timeStr = getCurrentTimeFormatted();
      await graphqlRequest(CHECK_IN_MUTATION, {
        input: {
          officeLocationId: setupData.me?.officeLocation?.id,
          latitude: currentCoords.latitude,
          longitude: currentCoords.longitude,
          loginTime: timeStr,
        },
      });

      Alert.alert('Checked In', `Checked in successfully at ${timeStr}`);
      fetchSetupData();
    } catch (error: any) {
      Alert.alert('Check-in Failed', error.message || 'Geofencing or connection error.');
    } finally {
      setIsPunching(false);
    }
  };

  const handleCheckOut = async () => {
    if (!currentCoords) {
      Alert.alert('Error', 'Missing GPS location.');
      return;
    }

    if (faceEnabled) {
      if (!faceEnrolled) {
        Alert.alert('Face enrollment required', 'Enroll your face before punching.');
        setFaceModal('enroll');
        return;
      }
      setFaceModal('verify-out');
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

      Alert.alert('Checked Out', `Checked out successfully at ${timeStr}`);
      fetchSetupData();
    } catch (error: any) {
      Alert.alert('Check-out Failed', error.message || 'Geofencing or connection error.');
    } finally {
      setIsPunching(false);
    }
  };

  const uploadSelfie = async (
    recordId: string,
    kind: 'check_in' | 'check_out',
    photoUri: string
  ) => {
    try {
      const form = new FormData();
      form.append('attendance_record_id', recordId);
      form.append('kind', kind);
      form.append('selfie', {
        uri: photoUri,
        name: `${kind}.jpg`,
        type: 'image/jpeg',
      } as any);

      const headers: Record<string, string> = {};
      const token = await AuthService.getAccessToken();
      if (token) headers.Authorization = `Bearer ${token}`;

      await fetch(`${API_URL}/api/attendance/selfie/`, {
        method: 'POST',
        headers,
        body: form,
      });
    } catch {
      // Non-blocking — punch already succeeded
    }
  };

  const completePunchWithFace = async (
    type: 'in' | 'out',
    result: { matchScore: number; verified: boolean; imageBase64: string; photoUri: string }
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
          },
        });
        if (data.checkIn?.id) {
          await uploadSelfie(String(data.checkIn.id), 'check_in', result.photoUri);
        }
        Alert.alert('Checked In', `Face verified · ${timeStr}`);
      } else {
        const data = await graphqlRequest<{ checkOut: { id: string } }>(CHECK_OUT_MUTATION, {
          input: {
            latitude: currentCoords.latitude,
            longitude: currentCoords.longitude,
            logoutTime: timeStr,
            faceVerified: result.verified,
            faceMatchScore: result.matchScore,
          },
        });
        if (data.checkOut?.id) {
          await uploadSelfie(String(data.checkOut.id), 'check_out', result.photoUri);
        }
        Alert.alert('Checked Out', `Face verified · ${timeStr}`);
      }
      setFaceModal(null);
      fetchSetupData();
    } catch (error: any) {
      Alert.alert('Punch failed', error.message || 'Could not record attendance');
    } finally {
      setIsPunching(false);
    }
  };

  // Developer Mock Methods
  const toggleMockLocation = async () => {
    if (isMockEnabled) {
      await LocationService.clearMockLocation();
      setIsMockEnabled(false);
      Alert.alert('Mock Disabled', 'Using actual hardware GPS.');
    } else {
      setIsMockEnabled(true);
      Alert.alert('Mock Enabled', 'Mock panel is now active.');
    }
    updateGPSLocation();
  };

  const setMockCoords = async (inside: boolean) => {
    const office = setupData?.me?.officeLocation;
    if (!office) return;

    if (inside) {
      // Set to exactly the office coordinates
      await LocationService.setMockLocation(office.latitude, office.longitude);
    } else {
      // Set to somewhere far away (e.g. addition of 1 degree to coordinates)
      await LocationService.setMockLocation(office.latitude + 0.1, office.longitude + 0.1);
    }
    updateGPSLocation();
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={accentColors.primary} />
      </View>
    );
  }

  const office = setupData?.me?.officeLocation;
  const todayRecord = setupData?.myAttendance && setupData.myAttendance.length > 0 ? setupData.myAttendance[0] : null;

  return (
    <SafeAreaView style={styles.safeContainer}>
      <FaceCaptureModal
        visible={faceModal !== null}
        mode={faceModal === "enroll" ? "enroll" : "verify"}
        enrolledDescriptor={enrolledDescriptor}
        onClose={() => setFaceModal(null)}
        onSuccess={async (result) => {
          if (faceModal === "enroll") {
            try {
              const res = await graphqlRequest<{
                enrollFace: { success: boolean; error?: string };
              }>(ENROLL_FACE_MUTATION, {
                input: {
                  descriptor: result.descriptor,
                  imageBase64: result.imageBase64,
                },
              });
              if (res.enrollFace?.error) {
                Alert.alert("Enrollment failed", res.enrollFace.error);
                return;
              }
              Alert.alert("Enrolled", "Face enrolled successfully.");
              setFaceModal(null);
              fetchSetupData();
            } catch (e: any) {
              Alert.alert("Enrollment failed", e?.message || "Try again");
            }
            return;
          }
          if (faceModal === "verify-in") await completePunchWithFace("in", result);
          if (faceModal === "verify-out") await completePunchWithFace("out", result);
        }}
      />
      <ScrollView contentContainerStyle={styles.container}>
        {/* Custom Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.menuBtn}
            onPress={() => setIsSidebarOpen(true)}
          >
            <Ionicons name="menu" size={26} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Attendance Tracking</Text>
          <TouchableOpacity 
            style={styles.avatarBtn}
            onPress={() => router.push('/profile')}
          >
            <Ionicons name="person-circle-outline" size={28} color={accentColors.primary} />
          </TouchableOpacity>
        </View>

        {/* Status Indicator */}
        <View style={styles.radialContainer}>
          <View
            style={[
              styles.radialBorder,
              { borderColor: isWithinGeofence ? '#10b981' : '#ef4444' },
            ]}
          >
            <Ionicons name="location" size={48} color={isWithinGeofence ? '#10b981' : '#ef4444'} />
            <Text style={[styles.statusText, { color: isWithinGeofence ? '#10b981' : '#ef4444' }]}>
              {isWithinGeofence ? 'Inside Office Geofence' : 'Outside Office Geofence'}
            </Text>
            {distanceToOffice !== null && (
              <Text style={styles.distanceText}>
                {distanceToOffice < 1000
                  ? `${Math.round(distanceToOffice)} meters away`
                  : `${(distanceToOffice / 1000).toFixed(2)} km away`}
              </Text>
            )}
          </View>
        </View>

        {/* Sync coordinates */}
        <View style={styles.row}>
          <Text style={styles.coordsText}>
            GPS: {currentCoords ? `${currentCoords.latitude.toFixed(5)}, ${currentCoords.longitude.toFixed(5)}` : 'Resolving...'}
          </Text>
          <TouchableOpacity onPress={() => updateGPSLocation()}>
            <Ionicons name="refresh" size={18} color="#3b82f6" />
          </TouchableOpacity>
        </View>

        {faceEnabled && (
          <View style={[styles.actionCard, { marginBottom: 12 }]}>
            <Text style={styles.statusDisplay}>
              Face attendance {faceEnrolled ? 'enrolled' : 'required'}
            </Text>
            <Text style={styles.coordsText}>
              {faceEnrolled
                ? 'Punch requires face verification. Outside geofence is flagged only.'
                : 'Enroll your face before check-in/out.'}
            </Text>
            <TouchableOpacity
              style={[styles.checkInButton, { marginTop: 12, opacity: 1 }]}
              onPress={() => setFaceModal('enroll')}
            >
              <Ionicons name="scan-outline" size={18} color="#fff" />
              <Text style={styles.buttonText}>
                {faceEnrolled ? 'Re-enroll face' : 'Enroll face'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Punch Actions */}
        <View style={styles.actionCard}>
          <View style={styles.statusDisplay}>
            <View style={styles.statusCol}>
              <Text style={styles.statusLabel}>PUNCH IN</Text>
              <Text style={styles.statusValue}>{todayRecord?.loginTime || '--:--'}</Text>
            </View>
            <View style={styles.statusDivider} />
            <View style={styles.statusCol}>
              <Text style={styles.statusLabel}>PUNCH OUT</Text>
              <Text style={styles.statusValue}>{todayRecord?.logoutTime || '--:--'}</Text>
            </View>
          </View>

          {isPunching ? (
            <ActivityIndicator style={{ marginVertical: 18 }} color="#3b82f6" />
          ) : (
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[
                  styles.punchButton,
                  styles.inButton,
                  ((!faceEnabled && !isWithinGeofence) ||
                    (todayRecord !== null && todayRecord.loginTime !== null)) &&
                    styles.disabledButton,
                ]}
                onPress={handleCheckIn}
                disabled={
                  (!faceEnabled && !isWithinGeofence) ||
                  (todayRecord !== null && todayRecord.loginTime !== null)
                }
              >
                <Ionicons name="log-in" size={20} color="#ffffff" />
                <Text style={styles.punchButtonText}>Clock In</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.punchButton,
                  styles.outButton,
                  ((!faceEnabled && !isWithinGeofence) ||
                    !todayRecord ||
                    !todayRecord.loginTime ||
                    todayRecord.logoutTime) &&
                    styles.disabledButton,
                ]}
                onPress={handleCheckOut}
                disabled={
                  (!faceEnabled && !isWithinGeofence) ||
                  !todayRecord ||
                  todayRecord.loginTime === null ||
                  todayRecord.logoutTime !== null
                }
              >
                <Ionicons name="log-out" size={20} color="#ffffff" />
                <Text style={styles.punchButtonText}>Clock Out</Text>
              </TouchableOpacity>
            </View>
          )}

          {!isWithinGeofence && !faceEnabled && (
            <Text style={styles.warningText}>
              You must be within the geofenced office area to check in or out.
            </Text>
          )}
          {!isWithinGeofence && faceEnabled && (
            <Text style={styles.warningText}>
              Outside geofence — punch is allowed; location will be flagged.
            </Text>
          )}
        </View>

        {/* Developer Sandbox Panel */}
        <View style={styles.devPanel}>
          <View style={styles.devHeader}>
            <Ionicons name="code-slash" size={18} color="#e2e8f0" />
            <Text style={styles.devTitle}>Developer Sandbox (Mock Location)</Text>
            <TouchableOpacity onPress={toggleMockLocation}>
              {isMockEnabled ? (
                <Ionicons name="toggle" size={28} color="#3b82f6" />
              ) : (
                <Ionicons name="toggle" size={28} color="#64748b" />
              )}
            </TouchableOpacity>
          </View>

          {isMockEnabled && (
            <View style={styles.devContent}>
              <Text style={styles.devHint}>
                Allows simulating GPS coordinates directly on physical devices or emulators to verify the backend's radius checks.
              </Text>
              <View style={styles.devButtonsRow}>
                <TouchableOpacity
                  style={[styles.devBtn, styles.devBtnGreen]}
                  onPress={() => setMockCoords(true)}
                >
                  <Text style={styles.devBtnText}>Simulate In-Office</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.devBtn, styles.devBtnRed]}
                  onPress={() => setMockCoords(false)}
                >
                  <Text style={styles.devBtnText}>Simulate Out-of-Office</Text>
                </TouchableOpacity>
              </View>
              {office && (
                <Text style={styles.devOfficeCoords}>
                  Office Target:{' '}
                  {office.latitude != null ? parseFloat(office.latitude as any).toFixed(5) : 0},{' '}
                  {office.longitude != null ? parseFloat(office.longitude as any).toFixed(5) : 0}{' '}
                  ({office.geoRadiusMeters || 0}m radius)
                </Text>
              )}
            </View>
          )}
        </View>
      </ScrollView>
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
    alignItems: 'center',
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
  radialContainer: {
    marginVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radialBorder: {
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 6,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: colors.backgroundCard,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: isDark ? 0.3 : 0.08,
    shadowRadius: 10,
    elevation: 8,
  },
  statusText: {
    fontSize: 15,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 12,
  },
  distanceText: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    backgroundColor: colors.backgroundCard,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
  },
  coordsText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  actionCard: {
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 20,
    width: '100%',
    marginBottom: 20,
  },
  statusDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  statusCol: {
    flex: 1,
    alignItems: 'center',
  },
  statusLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  statusValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 4,
  },
  statusDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.border,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  punchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: 12,
    width: '48%',
  },
  inButton: {
    backgroundColor: '#10b981',
  },
  outButton: {
    backgroundColor: accentColors.primary,
  },
  disabledButton: {
    backgroundColor: colors.border,
    opacity: 0.5,
  },
  punchButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  warningText: {
    color: '#f87171',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 14,
    lineHeight: 16,
  },
  devPanel: {
    backgroundColor: colors.cardElement,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    width: '100%',
  },
  devHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  devTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
    flex: 1,
  },
  devContent: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
  },
  devHint: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 12,
  },
  devButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  devBtn: {
    paddingVertical: 10,
    borderRadius: 8,
    width: '48%',
    alignItems: 'center',
  },
  devBtnGreen: {
    backgroundColor: '#065f46',
  },
  devBtnRed: {
    backgroundColor: '#991b1b',
  },
  devBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  devOfficeCoords: {
    color: colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 6,
  },
});
