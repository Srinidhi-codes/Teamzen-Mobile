import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
  Platform,
  Linking,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAppTheme } from '../context/ThemeContext';
import ScreenHeader from '../components/ScreenHeader';
import { graphqlRequest, authenticatedFetch, API_URL } from '../services/api';

// =====================================================
// GRAPHQL QUERIES & MUTATIONS
// =====================================================
const MY_ONBOARDING_QUERY = `
  query MyOnboarding {
    myOnboarding {
      id
      status
      progressPct
      joinDate
      userName
      userEmail
      templateName
      tasks {
        id
        title
        description
        assigneeRole
        phase
        status
        dueAt
        isRequired
        requiresDocumentCategory
        sortOrder
        notes
      }
      documents {
        id
        category
        title
        fileName
        fileUrl
        verificationStatus
        rejectionReason
        aiSuggestedCategory
      }
      offerLetter {
        id
        subject
        bodyHtml
        pdfUrl
        signedPdfUrl
        signedUploadedAt
        status
        source
        updatedAt
        acceptedName
        acceptedAt
      }
    }
    myAssignedOnboardingTasks {
      id
      title
      description
      status
      dueAt
      phase
      assigneeRole
    }
  }
`;

const COMPLETE_TASK_MUTATION = `
  mutation CompleteOnboardingTask($taskId: ID!, $notes: String) {
    completeOnboardingTask(taskId: $taskId, notes: $notes) {
      id
      progressPct
      status
      tasks {
        id
        status
        title
      }
    }
  }
`;

const ACCEPT_OFFER_MUTATION = `
  mutation AcceptOfferLetter($input: AcceptOfferInput!) {
    acceptOfferLetter(input: $input) {
      id
      progressPct
      offerLetter {
        id
        status
        acceptedName
        acceptedAt
      }
    }
  }
`;

// =====================================================
// DATA TYPES
// =====================================================
interface OnboardingTask {
  id: string;
  title: string;
  description?: string;
  assigneeRole: string;
  phase?: string;
  status: string;
  dueAt?: string;
  isRequired?: boolean;
  requiresDocumentCategory?: string;
  sortOrder?: number;
  notes?: string;
}

interface OnboardingDocument {
  id: string;
  category: string;
  title: string;
  fileName: string;
  fileUrl?: string;
  verificationStatus: string;
  rejectionReason?: string;
  aiSuggestedCategory?: string;
}

interface OfferLetter {
  id: string;
  subject: string;
  bodyHtml?: string;
  pdfUrl?: string;
  signedPdfUrl?: string;
  signedUploadedAt?: string;
  status: string;
  source?: string;
  updatedAt?: string;
  acceptedName?: string;
  acceptedAt?: string;
}

interface EmployeeOnboardingData {
  id: string;
  status: string;
  progressPct: number;
  joinDate?: string;
  userName?: string;
  userEmail?: string;
  templateName?: string;
  tasks: OnboardingTask[];
  documents: OnboardingDocument[];
  offerLetter?: OfferLetter | null;
}

const DOC_CATEGORIES = [
  { key: 'pan', label: 'PAN Card' },
  { key: 'aadhaar', label: 'Aadhaar' },
  { key: 'id_proof', label: 'ID Proof' },
  { key: 'bank_proof', label: 'Bank Proof' },
  { key: 'education', label: 'Education' },
  { key: 'signed_policy', label: 'Policy Sign' },
  { key: 'other', label: 'Other Document' },
];

export default function EmployeeOnboardingScreen() {
  const router = useRouter();
  const { colors, accentColors, isDark } = useAppTheme();

  const [onboarding, setOnboarding] = useState<EmployeeOnboardingData | null>(null);
  const [assignedTasks, setAssignedTasks] = useState<OnboardingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Offer letter acceptance
  const [acceptedName, setAcceptedName] = useState('');
  const [isAcceptingOffer, setIsAcceptingOffer] = useState(false);

  // Document upload state
  const [selectedCategory, setSelectedCategory] = useState('pan');
  const [uploadModalVisible, setUploadModalVisible] = useState(false);

  // Fetch Data
  const fetchData = useCallback(async () => {
    try {
      const data = await graphqlRequest<{
        myOnboarding: EmployeeOnboardingData | null;
        myAssignedOnboardingTasks: OnboardingTask[];
      }>(MY_ONBOARDING_QUERY);

      setOnboarding(data.myOnboarding);
      setAssignedTasks(data.myAssignedOnboardingTasks || []);
    } catch (err: any) {
      console.error('Error fetching onboarding:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // Complete Task Handler
  const handleCompleteTask = async (taskId: string) => {
    setActionLoading(true);
    try {
      await graphqlRequest(COMPLETE_TASK_MUTATION, { taskId });
      Alert.alert('Success', 'Task marked as completed.');
      fetchData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to complete task.');
    } finally {
      setActionLoading(false);
    }
  };

  // Accept Offer Handler
  const handleAcceptOffer = async () => {
    if (!acceptedName.trim()) {
      Alert.alert('Required', 'Please type your full legal name to accept the offer.');
      return;
    }
    if (!onboarding?.id) return;

    setIsAcceptingOffer(true);
    try {
      await graphqlRequest(ACCEPT_OFFER_MUTATION, {
        input: {
          onboardingId: onboarding.id,
          acceptedName: acceptedName.trim(),
        },
      });
      Alert.alert('Congratulations!', 'You have officially accepted the offer letter.');
      setAcceptedName('');
      fetchData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to accept offer letter.');
    } finally {
      setIsAcceptingOffer(false);
    }
  };

  // Open Document or Offer URL
  const handleOpenFile = async (url?: string) => {
    if (!url) {
      Alert.alert('Notice', 'File URL is not available.');
      return;
    }
    const fullUrl = url.startsWith('http') ? url : `${API_URL}${url.startsWith('/') ? '' : '/'}${url}`;
    try {
      const supported = await Linking.canOpenURL(fullUrl);
      if (supported) {
        await Linking.openURL(fullUrl);
      } else {
        Alert.alert('Error', 'Cannot open this document on your device.');
      }
    } catch {
      Alert.alert('Error', 'Unable to launch file viewer.');
    }
  };

  // Upload Document
  const handlePickAndUpload = async (useCamera = false) => {
    setUploadModalVisible(false);
    try {
      let result;
      if (useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Camera access is required to capture documents.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          quality: 0.8,
          allowsEditing: false,
        });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Gallery access is required to select documents.');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.8,
          allowsEditing: false,
        });
      }

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      const filename = asset.fileName || `${selectedCategory}_${Date.now()}.jpg`;

      setActionLoading(true);

      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        name: filename,
        type: asset.mimeType || 'image/jpeg',
      } as any);
      formData.append('category', selectedCategory);
      formData.append('title', filename);
      if (onboarding?.id) {
        formData.append('onboarding_id', onboarding.id);
      }

      const uploadUrl = `${API_URL}/api/onboarding/documents/upload/`;
      const response = await authenticatedFetch(uploadUrl, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Upload failed');
      }

      Alert.alert('Uploaded', 'Your document has been submitted for HR verification.');
      fetchData();
    } catch (err: any) {
      console.error('Upload error:', err);
      Alert.alert('Upload Error', err.message || 'Could not upload document.');
    } finally {
      setActionLoading(false);
    }
  };

  // Helper formatting
  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'completed':
      case 'verified':
        return '#10b981';
      case 'rejected':
      case 'cancelled':
        return '#ef4444';
      case 'in_progress':
      case 'preboarding':
        return accentColors.primary;
      default:
        return '#f59e0b';
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'bottom', 'left', 'right']}>
        <ScreenHeader title="My Onboarding" subtitle="Track tasks, accept offer & submit documents" showBack={true} />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={accentColors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading your onboarding checklist...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Empty State: No active onboarding
  if (!onboarding) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'bottom', 'left', 'right']}>
        <ScreenHeader title="My Onboarding" subtitle="Corporate Onboarding Portal" showBack={true} />
        <ScrollView
          contentContainerStyle={styles.emptyContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accentColors.primary} />}
        >
          <View style={[styles.emptyIconCircle, { backgroundColor: accentColors.light }]}>
            <Ionicons name="document-text-outline" size={48} color={accentColors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No Active Onboarding</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            Your onboarding checklist and document submission portal will appear here as soon as HR initiates your journey.
          </Text>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: accentColors.primary, marginTop: 24 }]}
            onPress={() => router.push('/(tabs)')}
          >
            <Ionicons name="home-outline" size={18} color="#ffffff" style={{ marginRight: 8 }} />
            <Text style={styles.primaryButtonText}>Go to Dashboard</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const hireTasks = (onboarding.tasks || []).filter((t) => t.assigneeRole === 'hire');
  const otherTasks = (onboarding.tasks || []).filter((t) => t.assigneeRole !== 'hire');

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'bottom', 'left', 'right']}>
      <ScreenHeader
        title="My Onboarding"
        subtitle={`${onboarding.progressPct}% complete · ${onboarding.status.replace('_', ' ').toUpperCase()}`}
        showBack={true}
      />

      <ScrollView
        contentContainerStyle={styles.contentContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accentColors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. Progress Banner */}
        <View style={[styles.card, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
          <View style={styles.cardHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Onboarding Progress</Text>
              {onboarding.joinDate && (
                <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                  Joining Date: {new Date(onboarding.joinDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                </Text>
              )}
            </View>
            <View style={[styles.statusPill, { backgroundColor: getStatusColor(onboarding.status) + '20' }]}>
              <Text style={[styles.statusPillText, { color: getStatusColor(onboarding.status) }]}>
                {onboarding.status.replace('_', ' ').toUpperCase()}
              </Text>
            </View>
          </View>

          {/* Progress Bar */}
          <View style={styles.progressContainer}>
            <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(100, Math.max(0, onboarding.progressPct))}%`,
                    backgroundColor: onboarding.progressPct >= 100 ? '#10b981' : accentColors.primary,
                  },
                ]}
              />
            </View>
            <Text style={[styles.progressPctText, { color: accentColors.primary }]}>
              {onboarding.progressPct}%
            </Text>
          </View>

          {onboarding.status === 'completed' && (
            <View style={styles.completedNotice}>
              <Ionicons name="checkmark-circle" size={20} color="#10b981" />
              <Text style={styles.completedNoticeText}>
                Onboarding complete! Your employee profile is fully verified.
              </Text>
            </View>
          )}
        </View>

        {/* 2. Offer Letter Section */}
        {onboarding.offerLetter && (
          <View style={[styles.card, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="document-attach-outline" size={20} color={accentColors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Offer Letter</Text>
            </View>
            <Text style={[styles.offerSubject, { color: colors.textSecondary }]}>
              {onboarding.offerLetter.subject || 'Employment Offer Letter'}
            </Text>

            {/* Offer status badge */}
            <View style={styles.offerStatusRow}>
              <View
                style={[
                  styles.statusPill,
                  {
                    backgroundColor:
                      onboarding.offerLetter.status === 'accepted' ? '#10b98120' : '#f59e0b20',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.statusPillText,
                    {
                      color:
                        onboarding.offerLetter.status === 'accepted' ? '#10b981' : '#f59e0b',
                    },
                  ]}
                >
                  {onboarding.offerLetter.status === 'accepted' ? '✓ Accepted' : 'Pending Acceptance'}
                </Text>
              </View>

              {onboarding.offerLetter.pdfUrl && (
                <TouchableOpacity
                  style={[styles.linkBtn, { borderColor: accentColors.primary }]}
                  onPress={() => handleOpenFile(onboarding.offerLetter?.pdfUrl)}
                >
                  <Ionicons name="eye-outline" size={16} color={accentColors.primary} />
                  <Text style={[styles.linkBtnText, { color: accentColors.primary }]}>View Offer PDF</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Accept offer form */}
            {onboarding.offerLetter.status !== 'accepted' && (
              <View style={[styles.acceptBox, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <Text style={[styles.acceptInstruction, { color: colors.textSecondary }]}>
                  Type your full legal name below to electronically sign and accept your offer:
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.backgroundCard, color: colors.text, borderColor: colors.border }]}
                  placeholder="Enter full legal name"
                  placeholderTextColor={colors.textMuted}
                  value={acceptedName}
                  onChangeText={setAcceptedName}
                  autoCapitalize="words"
                />
                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    { backgroundColor: accentColors.primary },
                    (isAcceptingOffer || acceptedName.trim().length < 2) && styles.disabledButton,
                  ]}
                  onPress={handleAcceptOffer}
                  disabled={isAcceptingOffer || acceptedName.trim().length < 2}
                >
                  {isAcceptingOffer ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-done" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                      <Text style={styles.primaryButtonText}>Accept Offer</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* 3. Document Submission Section */}
        <View style={[styles.card, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="cloud-upload-outline" size={20} color={accentColors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>KYC & Documents</Text>
            </View>
            <TouchableOpacity
              style={[styles.uploadActionBtn, { backgroundColor: accentColors.primary }]}
              onPress={() => setUploadModalVisible(true)}
              disabled={actionLoading}
            >
              <Ionicons name="add" size={18} color="#ffffff" />
              <Text style={styles.uploadActionText}>Upload</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.helperText, { color: colors.textSecondary }]}>
            Select a document category and upload clear photos of your official documents.
          </Text>

          {/* Categories Horizontal Scroll */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoriesScroll}>
            {DOC_CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat.key;
              return (
                <TouchableOpacity
                  key={cat.key}
                  style={[
                    styles.categoryChip,
                    {
                      backgroundColor: isSelected ? accentColors.primary : colors.background,
                      borderColor: isSelected ? accentColors.primary : colors.border,
                    },
                  ]}
                  onPress={() => setSelectedCategory(cat.key)}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      { color: isSelected ? '#ffffff' : colors.textSecondary },
                    ]}
                  >
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Uploaded Documents List */}
          <View style={styles.documentsList}>
            {onboarding.documents && onboarding.documents.length > 0 ? (
              onboarding.documents.map((doc) => (
                <View
                  key={doc.id}
                  style={[styles.docItem, { borderColor: colors.border, backgroundColor: colors.background }]}
                >
                  <View style={styles.docItemLeft}>
                    <View style={[styles.docIconCircle, { backgroundColor: accentColors.light }]}>
                      <Ionicons name="document-outline" size={18} color={accentColors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.docTitle, { color: colors.text }]} numberOfLines={1}>
                        {doc.title || doc.fileName}
                      </Text>
                      <Text style={[styles.docCategory, { color: colors.textMuted }]}>
                        Category: {doc.category.toUpperCase()}
                      </Text>
                      {doc.rejectionReason && (
                        <Text style={styles.docRejectionText}>
                          Reason: {doc.rejectionReason}
                        </Text>
                      )}
                    </View>
                  </View>

                  <View style={styles.docItemRight}>
                    <View
                      style={[
                        styles.statusPill,
                        { backgroundColor: getStatusColor(doc.verificationStatus) + '20' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusPillText,
                          { color: getStatusColor(doc.verificationStatus) },
                        ]}
                      >
                        {doc.verificationStatus}
                      </Text>
                    </View>
                    {doc.fileUrl && (
                      <TouchableOpacity
                        style={styles.docEyeBtn}
                        onPress={() => handleOpenFile(doc.fileUrl)}
                      >
                        <Ionicons name="open-outline" size={18} color={colors.textSecondary} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))
            ) : (
              <View style={[styles.emptyDocsBox, { borderColor: colors.border }]}>
                <Ionicons name="cloud-upload-outline" size={32} color={colors.textMuted} />
                <Text style={[styles.emptyDocsText, { color: colors.textMuted }]}>
                  No documents uploaded yet. Tap "Upload" above to add your KYC files.
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* 4. Onboarding Tasks Checklist */}
        <View style={[styles.card, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="checkbox-outline" size={20} color={accentColors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>My Checklist</Text>
          </View>

          <View style={styles.taskList}>
            {hireTasks.length > 0 ? (
              hireTasks.map((task) => {
                const isCompleted = task.status === 'completed';
                return (
                  <View
                    key={task.id}
                    style={[
                      styles.taskItem,
                      {
                        borderColor: colors.border,
                        backgroundColor: colors.background,
                        opacity: isCompleted ? 0.75 : 1,
                      },
                    ]}
                  >
                    <View style={styles.taskItemLeft}>
                      <Ionicons
                        name={isCompleted ? 'checkmark-circle' : 'ellipse-outline'}
                        size={22}
                        color={isCompleted ? '#10b981' : colors.textMuted}
                        style={{ marginRight: 10 }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.taskTitle,
                            {
                              color: colors.text,
                              textDecorationLine: isCompleted ? 'line-through' : 'none',
                            },
                          ]}
                        >
                          {task.title}
                        </Text>
                        {task.description ? (
                          <Text style={[styles.taskDescription, { color: colors.textSecondary }]}>
                            {task.description}
                          </Text>
                        ) : null}
                        {task.dueAt && (
                          <Text style={[styles.taskDueDate, { color: colors.textMuted }]}>
                            Due: {new Date(task.dueAt).toLocaleDateString()}
                          </Text>
                        )}
                      </View>
                    </View>

                    {!isCompleted && (
                      <TouchableOpacity
                        style={[styles.taskActionBtn, { borderColor: accentColors.primary }]}
                        onPress={() => handleCompleteTask(task.id)}
                        disabled={actionLoading}
                      >
                        <Text style={[styles.taskActionText, { color: accentColors.primary }]}>
                          Done
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })
            ) : (
              <Text style={[styles.emptyDocsText, { color: colors.textMuted, marginVertical: 12 }]}>
                No tasks assigned to your role currently.
              </Text>
            )}
          </View>
        </View>

        {/* 5. Assigned Tasks for Teammates (if manager or HR) */}
        {assignedTasks.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="people-outline" size={20} color={accentColors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Tasks for Teammates</Text>
            </View>

            <View style={styles.taskList}>
              {assignedTasks.map((task) => (
                <View
                  key={task.id}
                  style={[styles.taskItem, { borderColor: colors.border, backgroundColor: colors.background }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.taskTitle, { color: colors.text }]}>{task.title}</Text>
                    {task.dueAt && (
                      <Text style={[styles.taskDueDate, { color: colors.textMuted }]}>
                        Due: {new Date(task.dueAt).toLocaleDateString()}
                      </Text>
                    )}
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.taskActionBtn,
                      {
                        backgroundColor: task.status === 'completed' ? '#10b98120' : accentColors.primary,
                        borderColor: task.status === 'completed' ? '#10b981' : accentColors.primary,
                      },
                    ]}
                    onPress={() => handleCompleteTask(task.id)}
                    disabled={actionLoading || task.status === 'completed'}
                  >
                    <Text
                      style={[
                        styles.taskActionText,
                        { color: task.status === 'completed' ? '#10b981' : '#ffffff' },
                      ]}
                    >
                      {task.status === 'completed' ? 'Done' : 'Complete'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Upload Choice Modal */}
      <Modal
        visible={uploadModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setUploadModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.backgroundCard, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Upload {selectedCategory.toUpperCase()} Document
            </Text>
            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
              Choose how you want to upload your document
            </Text>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: accentColors.primary }]}
                onPress={() => handlePickAndUpload(true)}
              >
                <Ionicons name="camera-outline" size={20} color="#ffffff" style={{ marginRight: 8 }} />
                <Text style={styles.modalBtnText}>Take Photo</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1 }]}
                onPress={() => handlePickAndUpload(false)}
              >
                <Ionicons name="images-outline" size={20} color={colors.text} style={{ marginRight: 8 }} />
                <Text style={[styles.modalBtnText, { color: colors.text }]}>Choose from Gallery</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.cancelBtn]}
                onPress={() => setUploadModalVisible(false)}
              >
                <Text style={[styles.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 14,
    fontSize: 14,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  cardSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressPctText: {
    fontSize: 14,
    fontWeight: '800',
    width: 44,
    textAlign: 'right',
  },
  completedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#10b98115',
    padding: 10,
    borderRadius: 10,
    marginTop: 14,
  },
  completedNoticeText: {
    fontSize: 13,
    color: '#10b981',
    fontWeight: '600',
    flex: 1,
  },
  offerSubject: {
    fontSize: 14,
    marginBottom: 8,
  },
  offerStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 10,
  },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  linkBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  acceptBox: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  acceptInstruction: {
    fontSize: 13,
    lineHeight: 18,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  primaryButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.5,
  },
  uploadActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  uploadActionText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  helperText: {
    fontSize: 13,
    marginBottom: 10,
  },
  categoriesScroll: {
    marginBottom: 12,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  documentsList: {
    gap: 8,
  },
  docItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  docItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  docIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  docTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  docCategory: {
    fontSize: 11,
    marginTop: 2,
  },
  docRejectionText: {
    fontSize: 11,
    color: '#ef4444',
    marginTop: 2,
  },
  docItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  docEyeBtn: {
    padding: 4,
  },
  emptyDocsBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    gap: 8,
  },
  emptyDocsText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  taskList: {
    gap: 8,
    marginTop: 4,
  },
  taskItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  taskItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  taskDescription: {
    fontSize: 12,
    marginTop: 2,
  },
  taskDueDate: {
    fontSize: 11,
    marginTop: 4,
  },
  taskActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  taskActionText: {
    fontSize: 12,
    fontWeight: '700',
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 18,
    borderWidth: 1,
    padding: 20,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    marginBottom: 18,
  },
  modalActions: {
    gap: 10,
  },
  modalBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
  },
  modalBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
