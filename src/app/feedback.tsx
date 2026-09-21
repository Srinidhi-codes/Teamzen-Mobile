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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { FileSystemUploadType } from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppTheme } from '../context/ThemeContext';
import { graphqlRequest, API_URL } from '../services/api';
import ScreenHeader from '../components/ScreenHeader';

interface FeedbackItem {
  id: string;
  title: string;
  message: string;
  category: string;
  status: string;
  adminReply?: string;
  createdAt: string;
}

const FEEDBACK_LIST_QUERY = `
  query FeedbackList {
    feedbackList {
      id
      title
      message
      category
      status
      adminReply
      createdAt
    }
  }
`;

const CREATE_FEEDBACK_MUTATION = `
  mutation CreateFeedback($input: CreateFeedbackInput!) {
    createFeedback(input: $input) {
      success
      error
      feedback {
        id
      }
    }
  }
`;

const CATEGORIES = [
  { value: "general", label: "General", icon: "chatbubble-outline" },
  { value: "bug", label: "Bug", icon: "bug-outline" },
  { value: "feature", label: "Feature", icon: "bulb-outline" },
  { value: "praise", label: "Praise", icon: "star-outline" },
];

export default function FeedbackScreen() {
  const router = useRouter();
  const { colors, accentColors, isDark } = useAppTheme();
  
  const [tab, setTab] = useState<'list' | 'new'>('list');
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Form State
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('general');
  const [files, setFiles] = useState<{uri: string, name: string}[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const fetchFeedbacks = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const response: any = await graphqlRequest(FEEDBACK_LIST_QUERY);
      if (response && response.feedbackList) {
        setFeedbacks(response.feedbackList);
      }
    } catch (err: any) {
      console.error('Error fetching feedback:', err);
    } finally {
      setLoading(false);
      if (isRefresh) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchFeedbacks();
  }, [fetchFeedbacks]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchFeedbacks(true);
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (!result.canceled) {
        setFiles(prev => [
          ...prev,
          ...result.assets.map(a => ({ uri: a.uri, name: a.name }))
        ]);
      }
    } catch (err) {
      console.log('Document picker error:', err);
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        quality: 0.85,
        allowsMultipleSelection: true,
      });
      if (!result.canceled) {
        setFiles(prev => [
          ...prev,
          ...result.assets.map(a => ({
            uri: a.uri,
            name: a.fileName || `media_${Date.now()}.${a.type === 'video' ? 'mp4' : 'jpg'}`,
          }))
        ]);
      }
    } catch (err) {
      console.log('Image picker error:', err);
    }
  };

  const showAttachmentOptions = () => {
    Alert.alert(
      'Add Attachment',
      'Choose attachment type',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Photo / Video', onPress: pickImage },
        { text: 'Document', onPress: pickDocument },
      ]
    );
  };

  const handleRemoveFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!title.trim() || !message.trim()) {
      Alert.alert('Validation Error', 'Please provide a title and a message.');
      return;
    }
    
    setSubmitting(true);
    try {
      const response: any = await graphqlRequest(CREATE_FEEDBACK_MUTATION, {
        input: {
          title: title.trim(),
          message: message.trim(),
          category,
          visibility: 'private',
        }
      });
      
      if (response?.createFeedback?.success) {
        const fbId = response.createFeedback.feedback?.id;
        if (fbId && files.length > 0) {
          const token = await AsyncStorage.getItem('accessToken');
          for (const file of files) {
            try {
              await FileSystem.uploadAsync(
                `${API_URL}/api/feedback/attachments/`,
                file.uri,
                {
                  fieldName: 'file',
                  httpMethod: 'POST',
                  uploadType: FileSystemUploadType.MULTIPART,
                  parameters: {
                    feedback_id: fbId,
                  },
                  headers: {
                    Authorization: `Bearer ${token}`,
                  },
                }
              );
            } catch (err) {
              console.error('File upload failed:', err);
            }
          }
        }

        Alert.alert(
          'Feedback Submitted',
          'Thank you for your feedback! It has been submitted directly and confidentially to company administrators.',
          [{ text: 'OK', onPress: () => {
            setTitle('');
            setMessage('');
            setFiles([]);
            setCategory('general');
            setTab('list');
            fetchFeedbacks();
          }}]
        );
      } else {
        Alert.alert('Error', response?.createFeedback?.error || 'Failed to submit feedback.');
      }
    } catch (err: any) {
      console.error('Submit feedback error:', err);
      Alert.alert('Error', err.message || 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <SafeAreaView style={[styles.safeContainer, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <ScreenHeader
        title="Feedback"
        subtitle="Confidential • Visible only to Admin & You"
        showBack={true}
        showMenu={false}
        showNotifications={true}
      />

      <View style={styles.toggleContainer}>
        <TouchableOpacity
          style={[styles.toggleButton, { backgroundColor: tab === 'list' ? accentColors.primary + '20' : 'transparent' }]}
          onPress={() => setTab('list')}
        >
          <Ionicons name="list-outline" size={20} color={tab === 'list' ? accentColors.primary : colors.textSecondary} />
          <Text style={[styles.toggleText, { color: tab === 'list' ? accentColors.primary : colors.textSecondary }]}>My Feedback</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleButton, { backgroundColor: tab === 'new' ? accentColors.primary + '20' : 'transparent' }]}
          onPress={() => setTab('new')}
        >
          <Ionicons name="add-circle-outline" size={20} color={tab === 'new' ? accentColors.primary : colors.textSecondary} />
          <Text style={[styles.toggleText, { color: tab === 'new' ? accentColors.primary : colors.textSecondary }]}>Submit New</Text>
        </TouchableOpacity>
      </View>

      {tab === 'list' ? (
        loading && !refreshing ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={accentColors.primary} />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accentColors.primary} />}
          >
            {feedbacks.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="chatbubbles-outline" size={64} color={colors.border} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No feedback submitted yet.</Text>
              </View>
            ) : (
              <View style={styles.listContainer}>
                {feedbacks.map((item) => (
                  <View key={item.id} style={[styles.card, { backgroundColor: isDark ? '#1e2436' : '#fff', borderColor: colors.border }]}>
                    <View style={styles.cardHeader}>
                      <View style={[styles.statusBadge, { backgroundColor: item.status === 'resolved' ? '#10b98115' : '#f59e0b15' }]}>
                        <Text style={[styles.statusText, { color: item.status === 'resolved' ? '#10b981' : '#f59e0b' }]}>
                          {item.status}
                        </Text>
                      </View>
                      <Text style={[styles.dateText, { color: colors.textSecondary }]}>{formatDate(item.createdAt)}</Text>
                    </View>
                    
                    <Text style={[styles.titleText, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
                    <Text style={[styles.msgText, { color: colors.textSecondary }]} numberOfLines={3}>{item.message}</Text>
                    
                    {item.adminReply && (
                      <View style={[styles.replyBox, { backgroundColor: isDark ? '#2a3143' : '#f8fafc', borderLeftColor: accentColors.primary }]}>
                        <Text style={[styles.replyLabel, { color: accentColors.primary }]}>Admin Reply</Text>
                        <Text style={[styles.replyText, { color: colors.text }]}>{item.adminReply}</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        )
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={[styles.label, { color: colors.text }]}>Category</Text>
          <View style={styles.categoriesRow}>
            {CATEGORIES.map(c => (
              <TouchableOpacity 
                key={c.value}
                style={[
                  styles.categoryChip, 
                  { 
                    backgroundColor: category === c.value ? accentColors.primary : (isDark ? '#1e2436' : '#f1f5f9'),
                    borderColor: category === c.value ? accentColors.primary : colors.border 
                  }
                ]}
                onPress={() => setCategory(c.value)}
              >
                <Ionicons 
                  name={c.icon as any} 
                  size={16} 
                  color={category === c.value ? '#fff' : colors.textSecondary} 
                />
                <Text style={[
                  styles.categoryText, 
                  { color: category === c.value ? '#fff' : colors.textSecondary }
                ]}>
                  {c.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.label, { color: colors.text }]}>Title</Text>
          <TextInput
            style={[styles.input, { backgroundColor: isDark ? '#1e2436' : '#fff', color: colors.text, borderColor: colors.border }]}
            placeholder="Brief summary..."
            placeholderTextColor={colors.textSecondary}
            value={title}
            onChangeText={setTitle}
          />

          <Text style={[styles.label, { color: colors.text }]}>Message</Text>
          <TextInput
            style={[styles.textArea, { backgroundColor: isDark ? '#1e2436' : '#fff', color: colors.text, borderColor: colors.border }]}
            placeholder="Details about your feedback..."
            placeholderTextColor={colors.textSecondary}
            multiline
            textAlignVertical="top"
            value={message}
            onChangeText={setMessage}
          />

          <View style={styles.attachmentHeader}>
            <Text style={[styles.label, { color: colors.text, marginTop: 0 }]}>Attachments</Text>
            <TouchableOpacity onPress={showAttachmentOptions} style={styles.attachBtn}>
              <Ionicons name="attach-outline" size={20} color={accentColors.primary} />
              <Text style={[styles.attachBtnText, { color: accentColors.primary }]}>Add File</Text>
            </TouchableOpacity>
          </View>
          
          {files.length > 0 && (
            <View style={styles.filesList}>
              {files.map((file, index) => (
                <View key={index} style={[styles.fileItem, { backgroundColor: isDark ? '#1e2436' : '#f1f5f9', borderColor: colors.border }]}>
                  <Ionicons name="document-outline" size={16} color={colors.textSecondary} />
                  <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>
                    {file.name}
                  </Text>
                  <TouchableOpacity onPress={() => handleRemoveFile(index)}>
                    <Ionicons name="close-circle-outline" size={20} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          <TouchableOpacity 
            style={[styles.submitBtn, { backgroundColor: accentColors.primary, opacity: submitting ? 0.7 : 1 }]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="send" size={20} color="#fff" />
                <Text style={styles.submitBtnText}>Submit Feedback</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
  },
  toggleContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  toggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
  },
  listContainer: {
    gap: 16,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  dateText: {
    fontSize: 12,
  },
  titleText: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  msgText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  replyBox: {
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    marginTop: 8,
  },
  replyLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  replyText: {
    fontSize: 14,
    lineHeight: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 16,
  },
  categoriesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '500',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 120,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 32,
    gap: 8,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  attachmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 8,
  },
  attachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  attachBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  filesList: {
    gap: 8,
    marginBottom: 8,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
  },
  fileName: {
    flex: 1,
    fontSize: 14,
  },
});
