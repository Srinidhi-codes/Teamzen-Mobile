import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Share,
  Image,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { API_URL, authenticatedFetch } from '../../services/api';
import { LocationService } from '../../services/location';
import { parseMessage, MessagePart } from '../../services/messageParser';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Sidebar from '../../components/Sidebar';
import { useAppTheme } from '../../context/ThemeContext';
import { GenUIActionCard } from '../../components/GenUICards';
import { VoiceWave } from '../../components/VoiceWave';
import { voiceWhisper } from '../../services/voiceWhisper';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

interface SuggestedPrompt {
  id: string;
  category: 'Attendance' | 'Leaves' | 'Payroll' | 'Policies';
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  prompt: string;
}

const PROMPT_CATEGORIES = ['All', 'Attendance', 'Leaves', 'Payroll', 'Policies'] as const;

const SUGGESTED_PROMPTS: SuggestedPrompt[] = [
  { id: 'leave', category: 'Leaves', icon: 'calendar-outline', label: 'Request Leave', prompt: 'I want to apply for a leave' },
  { id: 'balance', category: 'Leaves', icon: 'pie-chart-outline', label: 'Leave Balances', prompt: 'What is my current leave balance?' },
  { id: 'punch', category: 'Attendance', icon: 'time-outline', label: 'Check-in Status', prompt: 'What is my attendance status today?' },
  { id: 'summary', category: 'Attendance', icon: 'stats-chart-outline', label: 'Monthly Attendance', prompt: 'Summarize my monthly attendance' },
  { id: 'salary', category: 'Payroll', icon: 'cash-outline', label: 'Salary Structure', prompt: 'What is my current salary breakdown?' },
  { id: 'payslip', category: 'Payroll', icon: 'receipt-outline', label: 'Latest Payslip', prompt: 'Show my latest net take-home pay and payslip details' },
  { id: 'policy', category: 'Policies', icon: 'book-outline', label: 'Leave Policy', prompt: 'Explain the company leave policy' },
  { id: 'holidays', category: 'Policies', icon: 'partly-sunny-outline', label: 'Upcoming Holidays', prompt: 'What are the upcoming company holidays?' },
];

// =====================================================
// HELPERS FOR INSIGHT CARDS
// =====================================================
const parseStatsString = (statsStr: string) => {
  if (!statsStr) return [];
  return statsStr
    .replace(/[{}]/g, '')
    .split(',')
    .map((s) => {
      const colonIndex = s.indexOf(':');
      return {
        label: colonIndex !== -1 ? s.slice(0, colonIndex).trim() : s.trim(),
        value: colonIndex !== -1 ? s.slice(colonIndex + 1).trim() : '',
      };
    })
    .filter((s) => s.label);
};

const getInsightTheme = (type?: string, topic?: string) => {
  const t = type?.toLowerCase() || '';
  const top = topic?.toLowerCase() || '';
  
  const isWarning = t === 'warning' || t === 'anomaly';
  const isPolicy = top.includes('policy') || t === 'policy';
  const isStats = t === 'stats';

  if (isWarning) {
    return {
      borderColor: '#f59e0b40',
      backgroundColor: '#78350f15',
      iconColor: '#f59e0b',
      iconName: 'alert-circle' as const,
      tagColor: '#f59e0b',
    };
  }
  if (isPolicy) {
    return {
      borderColor: '#10b98140',
      backgroundColor: '#064e3b15',
      iconColor: '#10b981',
      iconName: 'book-outline' as const,
      tagColor: '#10b981',
    };
  }
  if (isStats) {
    return {
      borderColor: '#3b82f640',
      backgroundColor: '#1e3a8a15',
      iconColor: '#3b82f6',
      iconName: 'trending-up' as const,
      tagColor: '#3b82f6',
    };
  }
  return {
    borderColor: '#8b5cf640',
    backgroundColor: '#4c1d9515',
    iconColor: '#8b5cf6',
    iconName: 'sparkles' as const,
    tagColor: '#8b5cf6',
  };
};

export default function ChatScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, accentColors, isDark } = useAppTheme();
  const styles = getStyles(colors, accentColors, isDark);
  const params = useLocalSearchParams<{ initialQuery?: string }>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [showScrollBottom, setShowScrollBottom] = useState<boolean>(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const [cancelledIds, setCancelledIds] = useState<Set<string>>(new Set());
  const [processedQuery, setProcessedQuery] = useState<string | null>(null);

  // Voice recording & transcription state
  const [isVoiceRecording, setIsVoiceRecording] = useState<boolean>(false);
  const [isVoiceProcessing, setIsVoiceProcessing] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const recordingTimerRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      voiceWhisper.cancelRecording();
    };
  }, []);

  const handleStartVoice = async () => {
    try {
      await voiceWhisper.startRecording();
      setIsVoiceRecording(true);
      setRecordingSeconds(0);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch (err: any) {
      Alert.alert(
        'Microphone Permission Required',
        err.message || 'Unable to access microphone. Please enable microphone permission in your device settings.'
      );
    }
  };

  const handleStopVoice = async () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsVoiceRecording(false);
    setIsVoiceProcessing(true);
    try {
      const transcript = await voiceWhisper.stopAndTranscribe();
      if (transcript && transcript.trim()) {
        setInputMessage('');
        handleSendMessage(transcript.trim());
      } else {
        Alert.alert('Speech Not Recognized', 'Could not catch what you said. Please try speaking closer to the mic.');
      }
    } catch (err: any) {
      Alert.alert('Voice Error', err.message || 'Failed to transcribe audio.');
    } finally {
      setIsVoiceProcessing(false);
      setRecordingSeconds(0);
    }
  };

  const handleCancelVoice = async () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsVoiceRecording(false);
    setIsVoiceProcessing(false);
    setRecordingSeconds(0);
    await voiceWhisper.cancelRecording();
  };

  const formatMessageTime = (timestamp?: string) => {
    if (!timestamp) {
      return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    try {
      const d = new Date(timestamp);
      if (isNaN(d.getTime())) {
        return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const handleShareMessage = async (content: string) => {
    try {
      const cleanContent = content.replace(/\[\/?(PAYROLL_CARD|ATTENDANCE_CARD|INSIGHT_CARD|ERROR_CARD)\]/g, '').trim();
      await Share.share({
        message: cleanContent,
        title: 'TeamZen AI Co-pilot',
      });
    } catch (error) {
      console.error('Failed to share message:', error);
    }
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    setShowScrollBottom(distanceFromBottom > 160);
  };

  const scrollToBottom = () => {
    scrollViewRef.current?.scrollToEnd({ animated: true });
  };

  const handleVoidLeave = (id: string) => {
    setCancelledIds(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    handleSendMessage(`Cancel my leave with ID ${id}`);
  };

  useEffect(() => {
    fetchChatHistory();
  }, []);

  useEffect(() => {
    if (accessToken && !isHistoryLoading && params.initialQuery && params.initialQuery !== processedQuery) {
      setProcessedQuery(params.initialQuery);
      handleSendMessage(params.initialQuery);
    }
  }, [accessToken, isHistoryLoading, params.initialQuery, processedQuery]);

  const fetchChatHistory = async () => {
    try {
      const response = await authenticatedFetch(`${API_URL}/api/ai/chat/?context=user`);

      if (response.ok) {
        const data = await response.json();
        if (data.history) {
          setMessages(data.history);
        }
      }
    } catch (error) {
      console.error('Failed to fetch chat history:', error);
    } finally {
      setIsHistoryLoading(false);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const handleSendMessage = async (customQuery?: string) => {
    const query = customQuery !== undefined ? customQuery.trim() : inputMessage.trim();
    if (!query) return;

    setInputMessage('');
    setIsLoading(true);

    // Optimistically add user message
    const userMsg: ChatMessage = { role: 'user', content: query, timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 50);

    // Get current location coordinates to inject context for the AI
    const coords = await LocationService.getCurrentLocation();
    const lat = coords?.latitude || 0;
    const lon = coords?.longitude || 0;

    try {
      const response = await authenticatedFetch(`${API_URL}/api/ai/chat/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          latitude: lat,
          longitude: lon,
          context: 'user',
        }),
      });

      if (!response.ok) {
        let errMsg = 'Failed to send message';
        try {
          const errData = await response.json();
          errMsg = errData.error || errData.detail || errMsg;
        } catch {
          const text = await response.text();
          if (text) errMsg = text.slice(0, 160);
        }
        throw new Error(errMsg);
      }

      // Read response text (since it is StreamingHttpResponse, reading as text at end parses the SSE)
      const rawText = await response.text();
      const lines = rawText.split('\n');
      let finalHistory: ChatMessage[] | null = null;
      let streamedError: string | null = null;

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6).trim();
          if (dataStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.error) {
              streamedError = parsed.error;
            }
            if (parsed.history) {
              finalHistory = parsed.history;
            }
          } catch {}
        }
      }

      if (streamedError && !finalHistory) {
        throw new Error(streamedError);
      }

      if (finalHistory) {
        setMessages(finalHistory);
      } else {
        // Fallback if no history was parsed
        await fetchChatHistory();
      }
    } catch (error: any) {
      Alert.alert('AI Assistant', error.message || 'Failed to communicate with AI Assistant.');
      // Refresh chat history to remove or sync state
      fetchChatHistory();
    } finally {
      setIsLoading(false);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const handleClearHistory = async () => {
    Alert.alert('Clear Chat', 'Are you sure you want to clear your conversation history?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          try {
            const response = await authenticatedFetch(`${API_URL}/api/ai/chat/?context=user`, {
              method: 'DELETE',
            });
            if (response.ok) {
              setMessages([]);
            }
          } catch (error) {
            console.error('Failed to clear chat history:', error);
          }
        },
      },
    ]);
  };

  const renderCard = (part: MessagePart, index: number) => {
    const { type, value } = part;

    switch (type) {
      case 'payroll':
        return (
          <View key={index} style={[styles.card, styles.payrollCard]}>
            <View style={styles.cardHeader}>
              <Ionicons name="business" size={18} color="#3b82f6" />
              <Text style={styles.cardTitle}>Payslip breakdown</Text>
            </View>
            <View style={styles.cardBody}>
              {value['net pay'] && (
                <View style={styles.payrollHighlight}>
                  <Text style={styles.payrollHighlightLabel}>Net Take-Home Pay</Text>
                  <Text style={styles.payrollHighlightValue}>{value['net pay']}</Text>
                </View>
              )}
              {Object.keys(value).map((key) => {
                if (key === 'net pay') return null;
                return (
                  <View key={key} style={styles.cardRow}>
                    <Text style={styles.cardRowLabel}>{key.toUpperCase()}</Text>
                    <Text style={styles.cardRowValue}>{value[key]}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        );

      case 'attendance':
        return (
          <View key={index} style={[styles.card, styles.attendanceCard]}>
            <View style={styles.cardHeader}>
              <Ionicons name="checkmark-circle" size={18} color="#10b981" />
              <Text style={styles.cardTitle}>Attendance punch summary</Text>
            </View>
            <View style={styles.cardBody}>
              {Object.keys(value).map((key) => (
                <View key={key} style={styles.cardRow}>
                  <Text style={styles.cardRowLabel}>{key.toUpperCase()}</Text>
                  <Text style={styles.cardRowValue}>{value[key]}</Text>
                </View>
              ))}
            </View>
          </View>
        );

      case 'insight': {
        const theme = getInsightTheme(value.type, value.topic);
        const parsedStats = parseStatsString(value.stats);
        return (
          <View key={index} style={[styles.card, { borderColor: theme.borderColor, backgroundColor: theme.backgroundColor }]}>
            <View style={styles.cardHeader}>
              <Ionicons name={theme.iconName} size={18} color={theme.iconColor} />
              <View style={styles.cardTitleContainer}>
                <Text style={styles.cardTypeTag}>{value.type ? value.type.toUpperCase() : 'AI INSIGHT'}</Text>
                <Text style={styles.cardTitle}>{value.title || 'Assistant Recommendation'}</Text>
              </View>
              {value.topic && (
                <View style={[styles.topicBadge, { borderColor: theme.borderColor }]}>
                  <Text style={[styles.topicBadgeText, { color: theme.tagColor }]}>{value.topic}</Text>
                </View>
              )}
            </View>
            <Text style={styles.cardMessage}>{value.message}</Text>
            
            {parsedStats.length > 0 && (
              <View style={styles.statsContainer}>
                {parsedStats.map((s, i) => (
                  <View key={i} style={styles.statRow}>
                    <Text style={styles.statLabel}>{s.label.toUpperCase()}</Text>
                    <Text style={styles.statValue}>{s.value}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      }

      case 'error':
        return (
          <View key={index} style={[styles.card, styles.errorCard]}>
            <View style={styles.cardHeader}>
              <Ionicons name="alert-circle" size={18} color="#ef4444" />
              <Text style={styles.cardTitle}>{value.title || 'System Error'}</Text>
            </View>
            <Text style={styles.cardMessage}>{value.message}</Text>
          </View>
        );

      case 'balance': {
        const totalNum = typeof value.total === 'string' ? parseFloat(value.total) : (value.total || 0);
        const usedNum = typeof value.used === 'string' ? parseFloat(value.used) : (value.used || 0);
        const availableNum = typeof value.available === 'string' ? parseFloat(value.available) : (value.available || 0);
        const percentage = totalNum > 0 ? Math.min((usedNum / totalNum) * 100, 100) : 0;

        return (
          <View key={index} style={[styles.card, styles.balanceCard]}>
            <View style={styles.cardHeader}>
              <Ionicons name="calendar-outline" size={18} color="#3b82f6" />
              <View style={styles.cardTitleContainer}>
                <Text style={styles.cardTypeTag}>LEAVE ENTITLEMENT</Text>
                <Text style={styles.cardTitle}>{value.name || 'Unnamed Leave'}</Text>
              </View>
              <View style={styles.balanceRight}>
                <Text style={styles.balanceDaysText}>{availableNum}</Text>
                <Text style={styles.balanceDaysLabel}>Days Left</Text>
              </View>
            </View>

            <View style={styles.balanceStatsRow}>
              <View>
                <Text style={styles.balanceStatsLabel}>Consumed</Text>
                <Text style={styles.balanceStatsValue}>{usedNum} <Text style={styles.balanceStatsUnit}>Units</Text></Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.balanceStatsLabel}>Total Allotment</Text>
                <Text style={styles.balanceStatsValue}>{totalNum} <Text style={styles.balanceStatsUnit}>Units</Text></Text>
              </View>
            </View>

            <View style={styles.balanceProgressContainer}>
              <View style={[styles.balanceProgressBarFill, { width: `${percentage}%` }]} />
            </View>

            <View style={styles.balanceFooterNotice}>
              <Ionicons name="information-circle-outline" size={14} color="#3b82f6" />
              <Text style={styles.balanceFooterText}>
                You have used {percentage.toFixed(0)}% of your allocated leave.
              </Text>
            </View>
          </View>
        );
      }

      case 'leavetype': {
        return (
          <GenUIActionCard
            key={index}
            type="leave"
            title={value.name}
            description={value.description}
            actionText="Initialize Request"
            onAction={() => handleSendMessage(`I want to apply for ${value.name} (ID: ${value.id})`)}
          />
        );
      }

      case 'pendingleave': {
        const isCancelled = cancelledIds.has(value.id);
        
        const formatDate = (dateStr: string) => {
          if (!dateStr) return '';
          try {
            const d = new Date(dateStr);
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            return `${months[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}`;
          } catch {
            return dateStr;
          }
        };

        return (
          <GenUIActionCard
            key={index}
            type="leave"
            title={isCancelled ? "Request Voided" : `${value.type} Awaiting Review`}
            description={`Requested: ${formatDate(value.from)} to ${formatDate(value.to)} (${value.duration} Days)\nReason: ${value.reason || 'None'}`}
            actionText={isCancelled ? "Action Completed" : "Acknowledge"}
            cancelText={!isCancelled ? "Void Application" : undefined}
            onAction={() => {}}
            onCancel={!isCancelled ? () => handleVoidLeave(value.id) : undefined}
          />
        );
      }

      default:
        return (
          <View key={index} style={styles.card}>
            <Text style={styles.cardTitle}>{type.toUpperCase()} Card</Text>
            <Text style={styles.cardMessage}>{JSON.stringify(value)}</Text>
          </View>
        );
    }
  };

  const renderMessageContent = (content: string, isAssistant: boolean) => {
    const parts = parseMessage(content);
    return parts.map((part, index) => {
      if (part.type === 'text') {
        return (
          <Text key={index} style={[styles.messageText, { color: isAssistant ? colors.text : '#ffffff' }]}>
            {part.value.replace(/\[\/?(PAYROLL_CARD|ATTENDANCE_CARD|INSIGHT_CARD|ERROR_CARD)\]/g, '')}
          </Text>
        );
      }
      return renderCard(part, index);
    });
  };

  if (isHistoryLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={accentColors.primary} />
      </View>
    );
  }

  const filteredPrompts = selectedCategory === 'All'
    ? SUGGESTED_PROMPTS
    : SUGGESTED_PROMPTS.filter(p => p.category === selectedCategory);

  return (
    <SafeAreaView style={styles.safeContainer}>
      {/* Custom Accessible Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity 
            style={styles.backBtn}
            onPress={() => router.canGoBack() ? router.back() : router.push('/(tabs)')}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Back to Dashboard"
            accessibilityHint="Navigates back to the main dashboard screen"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>

          <View style={styles.titleContainer}>
            <Text style={styles.headerTitle}>AI Assistant</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {messages.length > 0 && (
            <TouchableOpacity
              onPress={handleClearHistory}
              style={styles.clearHeaderBtn}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Clear Conversation History"
              accessibilityHint="Erases current chat messages"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={19} color="#ef4444" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
        style={styles.keyboardContainer}
      >
        {/* Messages list with Scroll-to-bottom FAB */}
        <View style={{ flex: 1, position: 'relative' }}>
          <ScrollView
            ref={scrollViewRef}
            style={styles.messageList}
            contentContainerStyle={styles.messageListContent}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
          >
            {messages.length === 0 ? (
              <View style={styles.emptyContainer}>
                <View style={[styles.emptyIconBg, { backgroundColor: accentColors.light }]}>
                  <Image
                    source={require('../../../assets/images/assistant-mark.webp')}
                    style={{ width: 34, height: 34, resizeMode: 'contain' }}
                    fadeDuration={0}
                  />
                </View>
                <Text style={styles.emptyTitle}>AI Workplace Co-pilot</Text>
                <Text style={styles.emptySubtitle}>
                  Instant assistance for leave applications, attendance records, payroll insights, and company policies.
                </Text>

                {/* Filterable Category Tabs */}
                <View style={styles.starterSection}>
                  <Text style={[styles.starterSectionLabel, { color: colors.textMuted }]}>
                    Explore by Topic
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.categoryTabs}
                  >
                    {PROMPT_CATEGORIES.map((cat) => {
                      const isSelected = selectedCategory === cat;
                      return (
                        <TouchableOpacity
                          key={cat}
                          style={[
                            styles.categoryChip,
                            {
                              backgroundColor: isSelected ? accentColors.primary : colors.backgroundCard,
                              borderColor: isSelected ? accentColors.primary : colors.border,
                            },
                          ]}
                          onPress={() => setSelectedCategory(cat)}
                          accessible={true}
                          accessibilityRole="button"
                          accessibilityLabel={`Filter by ${cat}`}
                          accessibilityState={{ selected: isSelected }}
                        >
                          <Text
                            style={[
                              styles.categoryChipText,
                              { color: isSelected ? '#ffffff' : colors.text },
                            ]}
                          >
                            {cat}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  <View style={styles.starterGrid}>
                    {filteredPrompts.map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        style={[
                          styles.starterCard,
                          {
                            backgroundColor: colors.backgroundCard,
                            borderColor: colors.border,
                          },
                        ]}
                        activeOpacity={0.75}
                        onPress={() => handleSendMessage(item.prompt)}
                        accessible={true}
                        accessibilityRole="button"
                        accessibilityLabel={item.label}
                        accessibilityHint={`Sends prompt: ${item.prompt}`}
                      >
                        <View style={[styles.starterIconBg, { backgroundColor: accentColors.light }]}>
                          <Ionicons name={item.icon} size={18} color={accentColors.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={[styles.starterLabel, { color: colors.text }]}>{item.label}</Text>
                            <View style={[styles.starterTag, { backgroundColor: accentColors.light }]}>
                              <Text style={[styles.starterTagText, { color: accentColors.primary }]}>{item.category}</Text>
                            </View>
                          </View>
                          <Text style={[styles.starterPrompt, { color: colors.textSecondary }]} numberOfLines={1}>
                            {item.prompt}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            ) : (
              messages.map((msg, index) => {
                const isAssistant = msg.role === 'assistant';
                return (
                  <View
                    key={index}
                    style={[
                      styles.messageRow,
                      isAssistant ? styles.assistantRow : styles.userRow,
                    ]}
                  >
                    <View style={styles.avatarCol}>
                      {isAssistant ? (
                        <Image
                          source={require('../../../assets/images/assistant-mark.webp')}
                          style={{ width: 26, height: 26, borderRadius: 13, resizeMode: 'contain' }}
                          fadeDuration={0}
                        />
                      ) : (
                        <Ionicons name="person-circle" size={26} color={colors.textSecondary} />
                      )}
                    </View>
                    <View
                      style={[
                        styles.bubble,
                        isAssistant ? styles.assistantBubble : styles.userBubble,
                      ]}
                    >
                      {renderMessageContent(msg.content, isAssistant)}

                      {/* Bubble Footer with Timestamp and Accessible Share */}
                      <View style={styles.bubbleFooter}>
                        <Text
                          style={[
                            styles.bubbleTime,
                            { color: isAssistant ? colors.textMuted : 'rgba(255,255,255,0.7)' },
                          ]}
                        >
                          {formatMessageTime(msg.timestamp)}
                        </Text>
                        {isAssistant && (
                          <TouchableOpacity
                            style={styles.bubbleActionBtn}
                            onPress={() => handleShareMessage(msg.content)}
                            accessible={true}
                            accessibilityRole="button"
                            accessibilityLabel="Share or copy response"
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          >
                            <Ionicons name="share-outline" size={13} color={colors.textMuted} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })
            )}

            {isLoading && (
              <View
                style={[styles.messageRow, styles.assistantRow]}
                accessibilityLiveRegion="polite"
              >
                <Image
                  source={require('../../../assets/images/assistant-mark.webp')}
                  style={{ width: 26, height: 26, borderRadius: 13, resizeMode: 'contain' }}
                  fadeDuration={0}
                />
                <View style={[styles.bubble, styles.assistantBubble, styles.typingBubble]}>
                  <ActivityIndicator size="small" color={accentColors.primary} />
                </View>
              </View>
            )}
          </ScrollView>

          {/* Floating Scroll to Bottom Button */}
          {showScrollBottom && (
            <TouchableOpacity
              style={[
                styles.scrollToBottomBtn,
                {
                  backgroundColor: colors.backgroundCard,
                  borderColor: colors.border,
                },
              ]}
              onPress={scrollToBottom}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Scroll to newest messages"
              activeOpacity={0.8}
            >
              <Ionicons name="chevron-down" size={20} color={accentColors.primary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Horizontal Quick Suggestions Tray */}
        <View style={styles.quickPromptTray}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickPromptContent}
          >
            {SUGGESTED_PROMPTS.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.quickPromptChip,
                  {
                    backgroundColor: colors.backgroundCard,
                    borderColor: colors.border,
                  },
                ]}
                activeOpacity={0.7}
                onPress={() => handleSendMessage(item.prompt)}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                accessibilityHint={`Sends prompt: ${item.prompt}`}
              >
                <Ionicons name={item.icon} size={13} color={accentColors.primary} style={{ marginRight: 6 }} />
                <Text style={[styles.quickPromptText, { color: colors.text }]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Modern Ergonomic Pill Input area with Voice Support */}
        <View
          style={[
            styles.inputArea,
            {
              backgroundColor: colors.backgroundCard,
              borderColor: isVoiceRecording ? '#ef4444' : colors.border,
              marginBottom: Math.max(insets.bottom, 8),
            },
          ]}
        >
          {isVoiceRecording || isVoiceProcessing ? (
            <View style={styles.voiceActiveRow}>
              <VoiceWave
                isProcessing={isVoiceProcessing}
                durationSeconds={recordingSeconds}
              />
              <TouchableOpacity
                style={styles.cancelVoiceBtn}
                onPress={handleCancelVoice}
                disabled={isVoiceProcessing}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Cancel voice recording"
              >
                <Ionicons name="trash-outline" size={17} color="#ef4444" />
                <Text style={styles.cancelVoiceText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TextInput
              style={[styles.textInput, { color: colors.text }]}
              placeholder="Ask AI anything about work..."
              placeholderTextColor={colors.textMuted}
              value={inputMessage}
              onChangeText={setInputMessage}
              onSubmitEditing={() => handleSendMessage()}
              multiline
              maxLength={500}
              accessible={true}
              accessibilityLabel="Message input field"
              accessibilityHint="Type your question or request for the AI assistant"
            />
          )}

          {inputMessage.length > 0 && !isVoiceRecording && !isVoiceProcessing && (
            <TouchableOpacity
              style={styles.clearInputBtn}
              onPress={() => setInputMessage('')}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Clear message input"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}

          {/* Voice Mic Button */}
          <TouchableOpacity
            style={[
              styles.micBtn,
              isVoiceRecording && styles.micBtnRecording,
            ]}
            onPress={isVoiceRecording ? handleStopVoice : handleStartVoice}
            disabled={isLoading || isVoiceProcessing}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel={isVoiceRecording ? "Stop voice recording" : "Record voice question"}
          >
            {isVoiceProcessing ? (
              <ActivityIndicator size="small" color="#ef4444" />
            ) : (
              <Ionicons
                name={isVoiceRecording ? "stop" : "mic"}
                size={20}
                color={isVoiceRecording ? "#ffffff" : accentColors.primary}
              />
            )}
          </TouchableOpacity>

          {/* Send Button (when text typed) */}
          {!isVoiceRecording && !isVoiceProcessing && (
            <TouchableOpacity
              style={[
                styles.sendBtn,
                { backgroundColor: accentColors.primary },
                (!inputMessage.trim() || isLoading) && styles.sendBtnDisabled,
              ]}
              onPress={() => handleSendMessage()}
              disabled={!inputMessage.trim() || isLoading}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Send message"
              accessibilityState={{ disabled: !inputMessage.trim() || isLoading }}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Ionicons name="arrow-up" size={19} color="#ffffff" />
              )}
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
    </SafeAreaView>
  );
}

const getStyles = (colors: any, accentColors: any, isDark: boolean) => StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardContainer: {
    flex: 1,
    paddingBottom: Platform.OS === 'ios' ? 12 : 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 4 : 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backBtn: {
    padding: 6,
    borderRadius: 10,
  },
  menuBtn: {
    padding: 6,
    borderRadius: 10,
  },
  titleContainer: {
    marginLeft: 2,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
  },
  onlineText: {
    color: '#10b981',
    fontSize: 11,
    fontWeight: '700',
  },
  avatarBtn: {
    padding: 4,
  },
  clearHeaderBtn: {
    padding: 6,
    marginRight: 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  headerOptions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  historyHint: {
    color: colors.textMuted,
    fontSize: 12,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  clearText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    padding: 16,
    paddingBottom: 24,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    paddingHorizontal: 16,
  },
  emptyIconBg: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  emptySubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
    paddingHorizontal: 16,
  },
  starterSection: {
    width: '100%',
    marginTop: 24,
  },
  starterSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  categoryTabs: {
    flexDirection: 'row',
    paddingVertical: 4,
    gap: 8,
    marginBottom: 12,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  starterGrid: {
    gap: 8,
  },
  starterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  starterIconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  starterLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  starterTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  starterTagText: {
    fontSize: 10,
    fontWeight: '700',
  },
  starterPrompt: {
    fontSize: 12,
    marginTop: 2,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 18,
    width: '100%',
  },
  assistantRow: {
    justifyContent: 'flex-start',
  },
  userRow: {
    justifyContent: 'flex-start',
    flexDirection: 'row-reverse',
  },
  avatarCol: {
    width: 32,
    alignItems: 'center',
    marginTop: 4,
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxWidth: '82%',
    marginHorizontal: 8,
  },
  assistantBubble: {
    backgroundColor: colors.backgroundCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  userBubble: {
    backgroundColor: accentColors.primary,
  },
  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 4,
    gap: 8,
  },
  bubbleTime: {
    fontSize: 10,
    fontWeight: '500',
  },
  bubbleActionBtn: {
    padding: 2,
    borderRadius: 4,
  },
  scrollToBottomBtn: {
    position: 'absolute',
    right: 18,
    bottom: 12,
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 30,
    borderWidth: 1,
  },
  typingBubble: {
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'center',
    width: 56,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  quickPromptTray: {
    paddingVertical: 6,
  },
  quickPromptContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  quickPromptChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
  },
  quickPromptText: {
    fontSize: 12,
    fontWeight: '600',
  },
  inputArea: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 26,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 3,
  },
  textInput: {
    flex: 1,
    paddingVertical: 6,
    fontSize: 15,
    maxHeight: 100,
  },
  clearInputBtn: {
    padding: 4,
    marginRight: 4,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
  },
  sendBtnDisabled: {
    opacity: 0.35,
  },
  voiceActiveRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
    paddingRight: 4,
  },
  cancelVoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  cancelVoiceText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ef4444',
  },
  micBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  micBtnRecording: {
    backgroundColor: '#ef4444',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  /* Custom UI Cards Styling */
  card: {
    borderRadius: 12,
    padding: 12,
    marginVertical: 8,
    borderWidth: 1,
    alignSelf: 'stretch',
    minWidth: 260,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 6,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: 'bold',
    marginLeft: 6,
  },
  cardBody: {
    marginTop: 4,
  },
  payrollCard: {
    backgroundColor: colors.cardElement,
    borderColor: accentColors.primary + '40',
  },
  payrollHighlight: {
    backgroundColor: accentColors.light,
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  payrollHighlightLabel: {
    color: colors.textSecondary,
    fontSize: 10,
  },
  payrollHighlightValue: {
    color: accentColors.primary,
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 2,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  cardRowLabel: {
    color: colors.textMuted,
    fontSize: 10,
  },
  cardRowValue: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  attendanceCard: {
    backgroundColor: '#065f4615',
    borderColor: '#10b98140',
  },
  insightCard: {
    backgroundColor: '#78350f15',
    borderColor: '#eab30840',
  },
  errorCard: {
    backgroundColor: '#7f1d1d15',
    borderColor: '#ef444440',
  },
  cardMessage: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  cardTitleContainer: {
    flex: 1,
    marginLeft: 8,
  },
  cardTypeTag: {
    color: colors.textMuted,
    fontSize: 8,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: 2,
  },
  topicBadge: {
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: colors.borderLight,
    borderColor: colors.border,
  },
  topicBadgeText: {
    fontSize: 8,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  statsContainer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 10,
    paddingTop: 8,
    gap: 6,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  statValue: {
    color: colors.text,
    fontSize: 11,
    fontWeight: 'bold',
  },
  /* Balance Card Styles */
  balanceCard: {
    backgroundColor: accentColors.light,
    borderColor: accentColors.primary + '40',
  },
  balanceRight: {
    alignItems: 'flex-end',
  },
  balanceDaysText: {
    color: accentColors.primary,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 24,
  },
  balanceDaysLabel: {
    color: colors.textMuted,
    fontSize: 8,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  balanceStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 12,
  },
  balanceStatsLabel: {
    color: colors.textMuted,
    fontSize: 8,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  balanceStatsValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: 'bold',
  },
  balanceStatsUnit: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: 'normal',
  },
  balanceProgressContainer: {
    height: 10,
    backgroundColor: colors.borderLight,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.border,
    width: '100%',
    overflow: 'hidden',
    marginBottom: 10,
  },
  balanceProgressBarFill: {
    height: '100%',
    backgroundColor: accentColors.primary,
    borderRadius: 5,
  },
  balanceFooterNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  balanceFooterText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  /* Leave Type Card Styles */
  leaveTypeCard: {
    backgroundColor: accentColors.light,
    borderColor: accentColors.primary + '30',
  },
  availBadge: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  availBadgeRecommended: {
    backgroundColor: '#10b98115',
    borderColor: '#10b98140',
  },
  availBadgeDefault: {
    backgroundColor: colors.borderLight,
    borderColor: colors.border,
  },
  availBadgeText: {
    fontSize: 8,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  availBadgeRecommendedText: {
    color: '#10b981',
  },
  availBadgeDefaultText: {
    color: colors.textSecondary,
  },
  leaveTypeDesc: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
    fontWeight: '500',
    marginBottom: 8,
  },
  leaveTypeBtn: {
    backgroundColor: accentColors.primary,
    borderRadius: 12,
    height: 42,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    width: '100%',
  },
  leaveTypeBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  /* Pending Leave Card Styles */
  pendingLeaveCard: {
    backgroundColor: colors.backgroundCard,
    borderColor: colors.border,
  },
  pendingLeaveCancelled: {
    opacity: 0.5,
  },
  pendingStatusBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    borderWidth: 1,
    borderTopWidth: 0,
    borderRightWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderBottomLeftRadius: 10,
    zIndex: 10,
  },
  pendingStatusBadgeAwaiting: {
    backgroundColor: '#f59e0b15',
    borderColor: '#f59e0b30',
  },
  pendingStatusBadgeCancelled: {
    backgroundColor: '#ef444415',
    borderColor: '#ef444430',
  },
  pendingStatusBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pendingStatusBadgeAwaitingText: {
    color: '#f59e0b',
  },
  pendingStatusBadgeCancelledText: {
    color: '#ef4444',
  },
  pendingDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.borderLight,
    paddingVertical: 10,
  },
  pendingDetailsLabel: {
    color: colors.textMuted,
    fontSize: 8,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  pendingDateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pendingDateText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  pendingYearText: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: 'bold',
    marginTop: 2,
  },
  pendingDurationText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  pendingReasonContainer: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: colors.borderLight,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  pendingReasonText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontStyle: 'italic',
    lineHeight: 16,
    fontWeight: '500',
  },
  pendingVoidBtn: {
    backgroundColor: '#ef444410',
    borderWidth: 1,
    borderColor: '#ef444430',
    borderRadius: 12,
    height: 42,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    width: '100%',
  },
  pendingVoidBtnText: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  pendingActionCompleted: {
    backgroundColor: colors.borderLight,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    height: 42,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    width: '100%',
  },
  pendingActionCompletedText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
