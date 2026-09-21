import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAppTheme } from '../context/ThemeContext';
import { authenticatedFetch, API_URL } from '../services/api';
import ScreenHeader from '../components/ScreenHeader';
import * as WebBrowser from 'expo-web-browser';

interface Policy {
  id: string | number;
  title: string;
  description?: string;
  created_at: string;
  file_size?: number;
  is_processed?: boolean;
  file_url?: string;
  file?: string;
}

export default function PoliciesScreen() {
  const router = useRouter();
  const { colors, accentColors, isDark } = useAppTheme();
  
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPolicies = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);
    try {
      const response = await authenticatedFetch(`${API_URL}/api/ai/policies/`);
      if (!response.ok) {
        throw new Error('Failed to fetch policies');
      }
      const data = await response.json();
      setPolicies(data);
    } catch (err: any) {
      console.error('Error fetching policies:', err);
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
      if (isRefresh) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPolicies(true);
  };

  const handleOpenPolicy = async (policy: Policy) => {
    const fileUrl = policy.file_url || policy.file;
    if (!fileUrl) {
      Alert.alert('Notice', 'No file available for this policy.');
      return;
    }
    
    let absoluteUrl = fileUrl;
    if (!fileUrl.startsWith('http')) {
      absoluteUrl = `${API_URL}${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`;
    }

    try {
      await WebBrowser.openBrowserAsync(absoluteUrl);
    } catch (e) {
      Linking.openURL(absoluteUrl);
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
        title="Policies & Handbook"
        subtitle="Company policies and reference documents"
        showBack={true}
        showMenu={false}
        showNotifications={true}
      />

      {loading && !refreshing ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={accentColors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading policies...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle-outline" size={48} color="#ef4444" />
          <Text style={[styles.errorText, { color: colors.text }]}>{error}</Text>
          <TouchableOpacity 
            style={[styles.retryBtn, { backgroundColor: accentColors.primary }]}
            onPress={() => fetchPolicies()}
          >
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accentColors.primary} />
          }
        >
          {policies.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="document-text-outline" size={64} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                No policies uploaded yet.
              </Text>
            </View>
          ) : (
            <View style={styles.policiesList}>
              {policies.map((policy) => (
                <TouchableOpacity
                  key={policy.id}
                  style={[styles.policyCard, { 
                    backgroundColor: isDark ? '#1e2436' : '#fff',
                    borderColor: colors.border
                  }]}
                  onPress={() => handleOpenPolicy(policy)}
                  activeOpacity={0.7}
                >
                  <View style={styles.cardHeader}>
                    <View style={[styles.iconContainer, { backgroundColor: accentColors.primary + '15' }]}>
                      <Ionicons name="book-outline" size={24} color={accentColors.primary} />
                    </View>
                    <View style={styles.cardHeaderRight}>
                      {policy.is_processed !== undefined && (
                        <View style={[
                          styles.statusBadge, 
                          { backgroundColor: policy.is_processed ? '#10b98115' : '#f59e0b15' }
                        ]}>
                          <Text style={[
                            styles.statusText,
                            { color: policy.is_processed ? '#10b981' : '#f59e0b' }
                          ]}>
                            {policy.is_processed ? 'Ready' : 'Processing'}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                  
                  <Text style={[styles.policyTitle, { color: colors.text }]} numberOfLines={2}>
                    {policy.title}
                  </Text>
                  
                  {policy.description ? (
                    <Text style={[styles.policyDesc, { color: colors.textSecondary }]} numberOfLines={2}>
                      {policy.description}
                    </Text>
                  ) : null}
                  
                  <View style={[styles.cardFooter, { borderTopColor: colors.border }]}>
                    <View style={styles.footerInfo}>
                      <Ionicons name="calendar-outline" size={14} color={colors.textSecondary} />
                      <Text style={[styles.footerText, { color: colors.textSecondary }]}>
                        {formatDate(policy.created_at)}
                      </Text>
                    </View>
                    
                    {policy.file_size ? (
                      <View style={styles.footerInfo}>
                        <Ionicons name="document-outline" size={14} color={colors.textSecondary} />
                        <Text style={[styles.footerText, { color: colors.textSecondary }]}>
                          {(policy.file_size / 1024 / 1024).toFixed(2)} MB
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
  errorText: {
    marginTop: 12,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
  },
  policiesList: {
    gap: 16,
  },
  policyCard: {
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
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
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
  policyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    lineHeight: 24,
  },
  policyDesc: {
    fontSize: 14,
    marginBottom: 16,
    lineHeight: 20,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    borderTopWidth: 1,
  },
  footerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerText: {
    fontSize: 13,
  },
});
