import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useAppTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import {
  DocumentService,
  IssuedDocumentItem,
  DocumentRequestItem,
  VaultUploadItem,
  MyDocumentsData,
} from '../services/documents';
import { API_URL } from '../services/api';
import Sidebar from '../components/Sidebar';

type Tab = 'issued' | 'requests' | 'uploads';

const CATEGORIES = [
  { label: 'Identity / KYC', value: 'identity' },
  { label: 'Education', value: 'education' },
  { label: 'Experience', value: 'experience' },
  { label: 'Tax & Finance', value: 'tax' },
  { label: 'Medical', value: 'medical' },
  { label: 'Other', value: 'other' },
];

function getAbsoluteFileUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${API_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Module-level cache to eliminate white screen / flicker on revisit
let cachedDocuments: MyDocumentsData | null = null;

export default function DocumentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, accentColors, isDark } = useAppTheme();
  const { showToast, showImagePreview } = useToast();

  const [activeTab, setActiveTab] = useState<Tab>('issued');
  const [data, setData] = useState<MyDocumentsData | null>(cachedDocuments);
  const [loading, setLoading] = useState<boolean>(!cachedDocuments);
  const [refreshing, setRefreshing] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Uploading state for HR requests
  const [uploadingRequestId, setUploadingRequestId] = useState<string | null>(null);

  // Upload modal state for employee self-uploads
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadCategory, setUploadCategory] = useState('identity');
  const [uploadTitle, setUploadTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState<{
    uri: string;
    name: string;
    mimeType: string;
    size?: number;
  } | null>(null);
  const [isSubmittingUpload, setIsSubmittingUpload] = useState(false);

  const fetchDocuments = useCallback(async (isRefresh = false) => {
    if (!isRefresh && !cachedDocuments) setLoading(true);
    try {
      const result = await DocumentService.fetchAllDocuments();
      cachedDocuments = result;
      setData(result);
    } catch (err: any) {
      console.error('Failed to load documents:', err);
      showToast({
        title: 'Documents Load Error',
        message: err.message || 'Could not fetch documents vault.',
        verb: 'error',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDocuments(true);
  };

  const openRequestsCount = useMemo(() => {
    return data?.requests?.filter((r) => r.status === 'open').length ?? 0;
  }, [data?.requests]);

  const handleOpenFile = async (fileUrl?: string | null, title?: string) => {
    const absolute = getAbsoluteFileUrl(fileUrl);
    if (!absolute) {
      showToast({
        title: 'File Unavailable',
        message: 'Document link is not available yet.',
        verb: 'warning',
      });
      return;
    }

    const isImage = /\.(jpe?g|png|webp|gif|bmp)($|\?)/i.test(absolute);
    if (isImage) {
      showImagePreview(absolute, title || 'Document Preview');
    } else {
      try {
        await WebBrowser.openBrowserAsync(absolute);
      } catch {
        Linking.openURL(absolute);
      }
    }
  };

  // Direct fulfillment for HR request
  const handleUploadForRequest = async (requestId: string) => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });

      if (res.canceled || !res.assets || res.assets.length === 0) return;

      const file = res.assets[0];
      setUploadingRequestId(requestId);

      await DocumentService.uploadDocument({
        fileUri: file.uri,
        fileName: file.name,
        mimeType: file.mimeType || 'application/pdf',
        requestId,
      });

      showToast({
        title: 'Document Uploaded',
        message: 'Your document was sent to HR for verification.',
        verb: 'success',
      });

      await fetchDocuments(true);
    } catch (err: any) {
      showToast({
        title: 'Upload Failed',
        message: err.message || 'Could not upload document.',
        verb: 'error',
      });
    } finally {
      setUploadingRequestId(null);
    }
  };

  // Document Picker for general modal upload
  const pickDocumentForModal = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        const file = res.assets[0];
        setSelectedFile({
          uri: file.uri,
          name: file.name,
          mimeType: file.mimeType || 'application/pdf',
          size: file.size,
        });
        if (!uploadTitle.trim()) {
          setUploadTitle(file.name.replace(/\.[^/.]+$/, ''));
        }
      }
    } catch (err) {
      console.warn('Doc pick cancel/error', err);
    }
  };

  // Image Picker for general modal upload
  const pickImageForModal = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        const asset = res.assets[0];
        const filename = asset.fileName || `document_${Date.now()}.jpg`;
        setSelectedFile({
          uri: asset.uri,
          name: filename,
          mimeType: asset.mimeType || 'image/jpeg',
          size: asset.fileSize,
        });
        if (!uploadTitle.trim()) {
          setUploadTitle(filename.replace(/\.[^/.]+$/, ''));
        }
      }
    } catch (err) {
      console.warn('Image pick cancel/error', err);
    }
  };

  // Submit modal upload
  const handleModalSubmit = async () => {
    if (!selectedFile) {
      Alert.alert('Required', 'Please choose a document or image file first.');
      return;
    }
    setIsSubmittingUpload(true);
    try {
      await DocumentService.uploadDocument({
        fileUri: selectedFile.uri,
        fileName: selectedFile.name,
        mimeType: selectedFile.mimeType,
        category: uploadCategory,
        title: uploadTitle.trim() || selectedFile.name,
      });

      showToast({
        title: 'Uploaded to Vault',
        message: 'Your document has been added to My Uploads.',
        verb: 'success',
      });

      setIsUploadModalOpen(false);
      setSelectedFile(null);
      setUploadTitle('');
      await fetchDocuments(true);
      setActiveTab('uploads');
    } catch (err: any) {
      showToast({
        title: 'Upload Error',
        message: err.message || 'Could not complete document upload.',
        verb: 'error',
      });
    } finally {
      setIsSubmittingUpload(false);
    }
  };

  const styles = useMemo(
    () => getStyles(colors, accentColors, isDark),
    [colors, accentColors, isDark]
  );

  return (
    <SafeAreaView style={styles.safeContainer} edges={['right', 'left']}>
      {/* ── Top App Bar ── */}
      <View
        style={[
          styles.headerBar,
          { paddingTop: Math.max(insets.top + 8, Platform.OS === 'ios' ? 52 : 36) },
        ]}
      >
        <View style={styles.headerLeft}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Documents Vault</Text>
            <Text style={styles.headerSubtitle}>Form 16, HR requests & records</Text>
          </View>
        </View>
      </View>

      {/* ── Segmented Tabs ── */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[
            styles.tabButton,
            activeTab === 'issued' && {
              backgroundColor: accentColors.primary,
              borderColor: accentColors.primary,
            },
          ]}
          onPress={() => setActiveTab('issued')}
        >
          <Ionicons
            name="document-text"
            size={16}
            color={activeTab === 'issued' ? '#ffffff' : colors.textSecondary}
          />
          <Text
            style={[
              styles.tabButtonText,
              activeTab === 'issued' && styles.tabButtonTextActive,
            ]}
          >
            Issued ({data?.issued?.length ?? 0})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabButton,
            activeTab === 'requests' && {
              backgroundColor: accentColors.primary,
              borderColor: accentColors.primary,
            },
          ]}
          onPress={() => setActiveTab('requests')}
        >
          <Ionicons
            name="alert-circle"
            size={16}
            color={activeTab === 'requests' ? '#ffffff' : colors.textSecondary}
          />
          <Text
            style={[
              styles.tabButtonText,
              activeTab === 'requests' && styles.tabButtonTextActive,
            ]}
          >
            Requests ({openRequestsCount})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabButton,
            activeTab === 'uploads' && {
              backgroundColor: accentColors.primary,
              borderColor: accentColors.primary,
            },
          ]}
          onPress={() => setActiveTab('uploads')}
        >
          <Ionicons
            name="folder"
            size={16}
            color={activeTab === 'uploads' ? '#ffffff' : colors.textSecondary}
          />
          <Text
            style={[
              styles.tabButtonText,
              activeTab === 'uploads' && styles.tabButtonTextActive,
            ]}
          >
            My Uploads ({data?.uploads?.length ?? 0})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={accentColors.primary}
          />
        }
      >
        {loading && !data ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={accentColors.primary} />
            <Text style={styles.loadingText}>Loading documents vault...</Text>
          </View>
        ) : null}

        {/* ── TAB 1: ISSUED DOCUMENTS ── */}
        {activeTab === 'issued' && data && (
          <View style={styles.sectionWrap}>
            {data.issued.length === 0 ? (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIconBg}>
                  <Ionicons name="folder-open-outline" size={38} color={accentColors.primary} />
                </View>
                <Text style={styles.emptyTitle}>No Issued Documents</Text>
                <Text style={styles.emptySubtitle}>
                  Form 16, appraisal letters, and official HR certificates will be listed here.
                </Text>
              </View>
            ) : (
              data.issued.map((doc) => (
                <View key={doc.id} style={styles.docCard}>
                  <View style={styles.docTopRow}>
                    <View style={styles.docIconBox}>
                      <Ionicons name="document-text" size={22} color={accentColors.primary} />
                    </View>
                    <View style={styles.docMetaCol}>
                      <Text style={styles.docTitle} numberOfLines={2}>
                        {doc.title}
                      </Text>
                      <View style={styles.docBadgeRow}>
                        <View style={styles.categoryPill}>
                          <Text style={styles.categoryPillText}>
                            {doc.category?.replace(/_/g, ' ').toUpperCase() || 'DOCUMENT'}
                          </Text>
                        </View>
                        {doc.financialYear ? (
                          <View style={styles.yearPill}>
                            <Text style={styles.yearPillText}>FY {doc.financialYear}</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </View>

                  <View style={styles.docDivider} />

                  <View style={styles.docFooterRow}>
                    <Text style={styles.docDate}>
                      {doc.publishedAt ? `Published ${formatDate(doc.publishedAt)}` : 'Official Record'}
                    </Text>

                    {doc.downloadUrl ? (
                      <TouchableOpacity
                        style={[styles.downloadBtn, { backgroundColor: accentColors.primary }]}
                        onPress={() => handleOpenFile(doc.downloadUrl, doc.title)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="eye-outline" size={16} color="#ffffff" />
                        <Text style={styles.downloadBtnText}>View File</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* ── TAB 2: HR REQUESTS ── */}
        {activeTab === 'requests' && data && (
          <View style={styles.sectionWrap}>
            {data.requests.length === 0 ? (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIconBg}>
                  <Ionicons name="checkmark-done-circle-outline" size={40} color="#10b981" />
                </View>
                <Text style={styles.emptyTitle}>All Caught Up!</Text>
                <Text style={styles.emptySubtitle}>
                  You have no pending document requests from your HR team.
                </Text>
              </View>
            ) : (
              data.requests.map((req) => {
                const isOpen = req.status === 'open';
                const isUploadingThis = uploadingRequestId === req.id;

                return (
                  <View key={req.id} style={styles.docCard}>
                    <View style={styles.docTopRow}>
                      <View
                        style={[
                          styles.docIconBox,
                          { backgroundColor: isOpen ? '#fef3c7' : '#ecfdf5' },
                        ]}
                      >
                        <Ionicons
                          name={isOpen ? 'alert-circle' : 'checkmark-circle'}
                          size={22}
                          color={isOpen ? '#d97706' : '#10b981'}
                        />
                      </View>
                      <View style={styles.docMetaCol}>
                        <View style={styles.titleWithStatus}>
                          <Text style={[styles.docTitle, { flex: 1 }]} numberOfLines={2}>
                            {req.title}
                          </Text>
                          <View
                            style={[
                              styles.statusTag,
                              { backgroundColor: isOpen ? '#fef3c7' : '#ecfdf5' },
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusTagText,
                                { color: isOpen ? '#b45309' : '#059669' },
                              ]}
                            >
                              {isOpen ? 'ACTION REQUIRED' : 'FULFILLED'}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.docBadgeRow}>
                          <View style={styles.categoryPill}>
                            <Text style={styles.categoryPillText}>
                              {req.category?.replace(/_/g, ' ').toUpperCase() || 'KYC'}
                            </Text>
                          </View>
                          {req.dueAt ? (
                            <Text style={styles.dueText}>
                              Due: {formatDate(req.dueAt)}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    </View>

                    {req.description ? (
                      <Text style={styles.reqDescription}>{req.description}</Text>
                    ) : null}

                    {req.verificationStatus ? (
                      <View style={styles.verificationRow}>
                        <Text style={styles.verificationLabel}>Verification:</Text>
                        <Text
                          style={[
                            styles.verificationVal,
                            {
                              color:
                                req.verificationStatus === 'verified'
                                  ? '#10b981'
                                  : req.verificationStatus === 'rejected'
                                  ? '#ef4444'
                                  : '#f59e0b',
                            },
                          ]}
                        >
                          {req.verificationStatus.toUpperCase()}
                        </Text>
                      </View>
                    ) : null}

                    <View style={styles.docDivider} />

                    <View style={styles.docFooterRow}>
                      <Text style={styles.docDate}>
                        Requested {formatDate(req.createdAt)}
                      </Text>

                      {isOpen ? (
                        <TouchableOpacity
                          style={[styles.uploadActionBtn, { backgroundColor: accentColors.primary }]}
                          disabled={isUploadingThis}
                          onPress={() => handleUploadForRequest(req.id)}
                          activeOpacity={0.8}
                        >
                          {isUploadingThis ? (
                            <ActivityIndicator size="small" color="#ffffff" />
                          ) : (
                            <>
                              <Ionicons name="arrow-up-circle-outline" size={16} color="#ffffff" />
                              <Text style={styles.uploadActionBtnText}>Upload File</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      ) : req.fileUrl ? (
                        <TouchableOpacity
                          style={styles.viewGhostBtn}
                          onPress={() => handleOpenFile(req.fileUrl, req.title)}
                        >
                          <Ionicons name="eye-outline" size={15} color={colors.text} />
                          <Text style={[styles.viewGhostBtnText, { color: colors.text }]}>
                            View Submitted
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ── TAB 3: MY UPLOADS ── */}
        {activeTab === 'uploads' && data && (
          <View style={styles.sectionWrap}>
            {data.uploads.length === 0 ? (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIconBg}>
                  <Ionicons name="cloud-upload-outline" size={40} color={accentColors.primary} />
                </View>
                <Text style={styles.emptyTitle}>No Uploads Yet</Text>
                <Text style={styles.emptySubtitle}>
                  You haven’t uploaded any personal documents. Tap the Upload button above to submit IDs, degrees, or certs.
                </Text>
                <TouchableOpacity
                  style={[styles.emptyActionBtn, { backgroundColor: accentColors.primary }]}
                  onPress={() => setIsUploadModalOpen(true)}
                >
                  <Ionicons name="add" size={18} color="#ffffff" />
                  <Text style={styles.emptyActionBtnText}>Upload Document</Text>
                </TouchableOpacity>
              </View>
            ) : (
              data.uploads.map((doc) => {
                const isVerified = doc.verificationStatus === 'verified';
                const isRejected = doc.verificationStatus === 'rejected';
                const statusColor = isVerified
                  ? '#10b981'
                  : isRejected
                  ? '#ef4444'
                  : '#f59e0b';
                const statusBg = isVerified
                  ? '#ecfdf5'
                  : isRejected
                  ? '#fef2f2'
                  : '#fffbeb';

                return (
                  <View key={doc.id} style={styles.docCard}>
                    <View style={styles.docTopRow}>
                      <View style={styles.docIconBox}>
                        <Ionicons name="document-attach" size={22} color={accentColors.primary} />
                      </View>
                      <View style={styles.docMetaCol}>
                        <View style={styles.titleWithStatus}>
                          <Text style={[styles.docTitle, { flex: 1 }]} numberOfLines={2}>
                            {doc.title || doc.fileName || 'Uploaded Document'}
                          </Text>
                          <View style={[styles.statusTag, { backgroundColor: statusBg }]}>
                            <Text style={[styles.statusTagText, { color: statusColor }]}>
                              {(doc.verificationStatus || 'PENDING').toUpperCase()}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.docBadgeRow}>
                          <View style={styles.categoryPill}>
                            <Text style={styles.categoryPillText}>
                              {doc.category?.replace(/_/g, ' ').toUpperCase() || 'GENERAL'}
                            </Text>
                          </View>
                          {doc.source ? (
                            <View style={styles.yearPill}>
                              <Text style={styles.yearPillText}>
                                {doc.source.replace(/_/g, ' ')}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    </View>

                    {isRejected && doc.rejectionReason ? (
                      <View style={styles.rejectionNotice}>
                        <Ionicons name="alert-circle" size={16} color="#ef4444" />
                        <Text style={styles.rejectionText}>
                          Rejected: {doc.rejectionReason}
                        </Text>
                      </View>
                    ) : null}

                    <View style={styles.docDivider} />

                    <View style={styles.docFooterRow}>
                      <Text style={styles.docDate}>
                        Added {formatDate(doc.createdAt)}
                      </Text>

                      {doc.fileUrl ? (
                        <TouchableOpacity
                          style={[styles.downloadBtn, { backgroundColor: accentColors.primary }]}
                          onPress={() => handleOpenFile(doc.fileUrl, doc.title || doc.fileName)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="eye-outline" size={16} color="#ffffff" />
                          <Text style={styles.downloadBtnText}>View File</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>

      {/* ── Fixed Bottom Upload Action Bar ── */}
      <View
        style={[
          styles.bottomUploadBar,
          { paddingBottom: Math.max(insets.bottom, 16) },
        ]}
      >
        <TouchableOpacity
          style={[styles.bottomUploadBtn, { backgroundColor: accentColors.primary }]}
          onPress={() => setIsUploadModalOpen(true)}
          activeOpacity={0.88}
        >
          <Ionicons name="cloud-upload" size={18} color="#ffffff" />
          <Text style={styles.bottomUploadBtnText}>Upload Document</Text>
        </TouchableOpacity>
      </View>

      {/* ── Upload Modal ── */}
      <Modal
        visible={isUploadModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (!isSubmittingUpload) setIsUploadModalOpen(false);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Upload Document</Text>
                <Text style={styles.modalSubtitle}>Store KYC, degrees, or certifications</Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsUploadModalOpen(false)}
                disabled={isSubmittingUpload}
              >
                <Ionicons name="close-circle" size={26} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
              {/* Category selector */}
              <Text style={styles.inputLabel}>Document Category</Text>
              <View style={styles.categoryGrid}>
                {CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat.value}
                    style={[
                      styles.categoryChoice,
                      uploadCategory === cat.value && {
                        borderColor: accentColors.primary,
                        backgroundColor: isDark ? 'rgba(59,130,246,0.15)' : '#eff6ff',
                      },
                    ]}
                    onPress={() => setUploadCategory(cat.value)}
                  >
                    <Text
                      style={[
                        styles.categoryChoiceText,
                        uploadCategory === cat.value && {
                          color: accentColors.primary,
                          fontWeight: '700',
                        },
                      ]}
                    >
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Title input */}
              <Text style={[styles.inputLabel, { marginTop: 14 }]}>Document Title</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Passport, Degree Certificate, PAN Card"
                placeholderTextColor={colors.textSecondary}
                value={uploadTitle}
                onChangeText={setUploadTitle}
              />

              {/* File Attachment Pickers */}
              <Text style={[styles.inputLabel, { marginTop: 14 }]}>Choose File</Text>
              <View style={styles.pickerRow}>
                <TouchableOpacity style={styles.pickerBtn} onPress={pickDocumentForModal}>
                  <Ionicons name="document-text-outline" size={18} color={accentColors.primary} />
                  <Text style={[styles.pickerBtnText, { color: accentColors.primary }]}>
                    Pick Document / PDF
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.pickerBtn} onPress={pickImageForModal}>
                  <Ionicons name="image-outline" size={18} color={accentColors.primary} />
                  <Text style={[styles.pickerBtnText, { color: accentColors.primary }]}>
                    Take / Pick Photo
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Selected File Chip */}
              {selectedFile ? (
                <View style={styles.selectedFileChip}>
                  <Ionicons name="checkmark-circle" size={18} color="#10b981" />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={styles.selectedFileName} numberOfLines={1}>
                      {selectedFile.name}
                    </Text>
                    {selectedFile.size ? (
                      <Text style={styles.selectedFileSize}>
                        {(selectedFile.size / 1024).toFixed(1)} KB
                      </Text>
                    ) : null}
                  </View>
                  <TouchableOpacity onPress={() => setSelectedFile(null)}>
                    <Ionicons name="close" size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              ) : null}
            </ScrollView>

            <View style={styles.modalActionRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setIsUploadModalOpen(false)}
                disabled={isSubmittingUpload}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: accentColors.primary }]}
                onPress={handleModalSubmit}
                disabled={isSubmittingUpload || !selectedFile}
              >
                {isSubmittingUpload ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="cloud-upload" size={18} color="#ffffff" />
                    <Text style={styles.submitBtnText}>Submit Document</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
    </SafeAreaView>
  );
}

const getStyles = (colors: any, accentColors: any, isDark: boolean) =>
  StyleSheet.create({
    safeContainer: {
      flex: 1,
      backgroundColor: colors.background,
    },
    headerBar: {
      paddingHorizontal: 20,
      paddingBottom: 14,
      backgroundColor: colors.backgroundCard,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    backBtn: {
      marginRight: 12,
      padding: 6,
      borderRadius: 8,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: -0.3,
    },
    headerSubtitle: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 1,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    menuBtn: {
      padding: 6,
      borderRadius: 8,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
    },
    tabsContainer: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingVertical: 10,
      gap: 8,
      backgroundColor: colors.backgroundCard,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    tabButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    tabButtonText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    tabButtonTextActive: {
      color: '#ffffff',
    },
    contentContainer: {
      padding: 16,
      paddingBottom: 100,
    },
    bottomUploadBar: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: colors.backgroundCard,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      paddingHorizontal: 16,
      paddingTop: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -3 },
      shadowOpacity: isDark ? 0.3 : 0.08,
      shadowRadius: 6,
      elevation: 8,
    },
    bottomUploadBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 48,
      borderRadius: 14,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 3,
      elevation: 2,
    },
    bottomUploadBtnText: {
      color: '#ffffff',
      fontSize: 15,
      fontWeight: '700',
      letterSpacing: -0.2,
    },
    loadingBox: {
      paddingVertical: 40,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    loadingText: {
      color: colors.textSecondary,
      fontSize: 14,
    },
    sectionWrap: {
      gap: 12,
    },
    emptyCard: {
      backgroundColor: colors.backgroundCard,
      borderRadius: 16,
      padding: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: 20,
    },
    emptyIconBg: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    emptyTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 6,
    },
    emptySubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 18,
      maxWidth: 280,
    },
    emptyActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
      marginTop: 18,
    },
    emptyActionBtnText: {
      color: '#ffffff',
      fontSize: 13,
      fontWeight: '600',
    },
    docCard: {
      backgroundColor: colors.backgroundCard,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: isDark ? 0.2 : 0.04,
      shadowRadius: 3,
      elevation: 1,
    },
    docTopRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    docIconBox: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: isDark ? 'rgba(59,130,246,0.14)' : '#eff6ff',
      alignItems: 'center',
      justifyContent: 'center',
    },
    docMetaCol: {
      flex: 1,
    },
    titleWithStatus: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 8,
    },
    docTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
      lineHeight: 20,
    },
    docBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 6,
    },
    categoryPill: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
    },
    categoryPillText: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.textSecondary,
      letterSpacing: 0.5,
    },
    yearPill: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: isDark ? 'rgba(59,130,246,0.15)' : '#eff6ff',
    },
    yearPillText: {
      fontSize: 10,
      fontWeight: '600',
      color: accentColors.primary,
    },
    dueText: {
      fontSize: 11,
      color: '#d97706',
      fontWeight: '600',
    },
    reqDescription: {
      marginTop: 10,
      fontSize: 13,
      lineHeight: 18,
      color: colors.textSecondary,
    },
    verificationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 8,
    },
    verificationLabel: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    verificationVal: {
      fontSize: 12,
      fontWeight: '700',
    },
    rejectionNotice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: '#fef2f2',
      padding: 8,
      borderRadius: 8,
      marginTop: 10,
    },
    rejectionText: {
      color: '#dc2626',
      fontSize: 12,
      fontWeight: '500',
      flex: 1,
    },
    docDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: 12,
    },
    docFooterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    docDate: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    downloadBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
    },
    downloadBtnText: {
      color: '#ffffff',
      fontSize: 12,
      fontWeight: '600',
    },
    uploadActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
    },
    uploadActionBtnText: {
      color: '#ffffff',
      fontSize: 12,
      fontWeight: '600',
    },
    viewGhostBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.border,
    },
    viewGhostBtnText: {
      fontSize: 12,
      fontWeight: '500',
    },
    statusTag: {
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 6,
    },
    statusTagText: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: colors.backgroundCard,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 22,
      paddingBottom: Math.max(Platform.OS === 'ios' ? 38 : 22, 22),
      borderWidth: 1,
      borderColor: colors.border,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    modalSubtitle: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    inputLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 8,
    },
    categoryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    categoryChoice: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    categoryChoiceText: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    textInput: {
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      color: colors.text,
      fontSize: 14,
    },
    pickerRow: {
      flexDirection: 'row',
      gap: 10,
    },
    pickerBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingVertical: 11,
      backgroundColor: colors.background,
    },
    pickerBtnText: {
      fontSize: 12,
      fontWeight: '600',
    },
    selectedFileChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(16,185,129,0.12)' : '#ecfdf5',
      borderWidth: 1,
      borderColor: '#10b981',
      borderRadius: 10,
      padding: 10,
      marginTop: 12,
    },
    selectedFileName: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
    },
    selectedFileSize: {
      fontSize: 11,
      color: colors.textSecondary,
    },
    modalActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 20,
    },
    cancelBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    cancelBtnText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    submitBtn: {
      flex: 2,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      borderRadius: 10,
    },
    submitBtnText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#ffffff',
    },
  });
