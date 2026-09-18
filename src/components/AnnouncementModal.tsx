import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../context/ThemeContext';
import { ImageViewerModal } from './ImageViewerModal';
import { NotificationService } from '../services/notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AnnouncementData {
  id: string;
  message: string;
  imageUrl?: string | null;
  createdAt?: string;
  actor?: {
    firstName?: string;
    lastName?: string;
  };
}

interface AnnouncementModalProps {
  visible: boolean;
  announcement: AnnouncementData | null;
  onClose: () => void;
  onNavigateNotifications?: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const AnnouncementModal: React.FC<AnnouncementModalProps> = ({
  visible,
  announcement,
  onClose,
  onNavigateNotifications,
}) => {
  const { isDark, colors, accentColors } = useAppTheme();
  const [imageViewerOpen, setImageViewerOpen] = useState(false);

  if (!visible || !announcement) return null;

  const actorName =
    announcement.actor?.firstName
      ? `${announcement.actor.firstName} ${announcement.actor.lastName || ''}`.trim()
      : 'Company Admin';

  const handleAcknowledge = async () => {
    try {
      if (announcement.id) {
        await AsyncStorage.setItem(`seen_announcement_${announcement.id}`, 'true');
        await NotificationService.markAsRead(announcement.id);
      }
    } catch {
      // ignore
    }
    onClose();
  };

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={onClose}
      >
        <View style={styles.backdrop}>
          <View
            style={[
              styles.dialog,
              {
                backgroundColor: isDark ? '#111726' : '#FFFFFF',
                borderColor: isDark ? '#26334D' : '#E2E8F0',
              },
            ]}
          >
            {/* Top decorative header */}
            <View
              style={[
                styles.headerBanner,
                {
                  backgroundColor: isDark
                    ? 'rgba(79, 70, 229, 0.15)'
                    : 'rgba(79, 70, 229, 0.08)',
                },
              ]}
            >
              <View style={styles.badgeRow}>
                <View
                  style={[
                    styles.megaphoneIconCircle,
                    { backgroundColor: accentColors.primary },
                  ]}
                >
                  <Ionicons name="megaphone" size={18} color="#FFFFFF" />
                </View>
                <View style={styles.headerTextCol}>
                  <Text
                    style={[
                      styles.announcementPill,
                      { color: isDark ? '#A5B4FC' : '#4F46E5' },
                    ]}
                  >
                    COMPANY ANNOUNCEMENT
                  </Text>
                  <Text
                    style={[
                      styles.headerDate,
                      { color: isDark ? '#94A3B8' : '#64748B' },
                    ]}
                  >
                    Official broadcast from {actorName}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.closeBtn}
                onPress={onClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name="close"
                  size={20}
                  color={isDark ? '#94A3B8' : '#64748B'}
                />
              </TouchableOpacity>
            </View>

            {/* Content area */}
            <ScrollView
              style={styles.bodyScroll}
              contentContainerStyle={styles.bodyContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Optional Announcement Image */}
              {announcement.imageUrl ? (
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => setImageViewerOpen(true)}
                  style={styles.imageWrapper}
                >
                  <Image
                    source={{ uri: announcement.imageUrl }}
                    style={styles.announcementImage}
                    resizeMode="cover"
                  />
                  <View style={styles.expandHint}>
                    <Ionicons name="expand-outline" size={12} color="#FFFFFF" />
                    <Text style={styles.expandText}>Tap to enlarge</Text>
                  </View>
                </TouchableOpacity>
              ) : null}

              {/* Message text */}
              <View style={styles.messageBox}>
                <Text
                  style={[
                    styles.messageText,
                    { color: isDark ? '#F1F5F9' : '#1E293B' },
                  ]}
                >
                  {announcement.message}
                </Text>
              </View>

              {/* Author and Date Footer */}
              <View
                style={[
                  styles.metaFooter,
                  {
                    borderTopColor: isDark ? '#1E293B' : '#F1F5F9',
                  },
                ]}
              >
                <View style={styles.metaAuthor}>
                  <View
                    style={[
                      styles.avatarCircle,
                      { backgroundColor: isDark ? '#1E293B' : '#EEF2FF' },
                    ]}
                  >
                    <Ionicons
                      name="person"
                      size={14}
                      color={accentColors.primary}
                    />
                  </View>
                  <Text
                    style={[
                      styles.metaAuthorText,
                      { color: isDark ? '#94A3B8' : '#64748B' },
                    ]}
                  >
                    Posted by{' '}
                    <Text
                      style={{
                        color: isDark ? '#F8FAFC' : '#0F172A',
                        fontWeight: '600',
                      }}
                    >
                      {actorName}
                    </Text>
                  </Text>
                </View>
              </View>
            </ScrollView>

            {/* Bottom Actions */}
            <View
              style={[
                styles.actionFooter,
                {
                  borderTopColor: isDark ? '#1E293B' : '#F1F5F9',
                },
              ]}
            >
              {onNavigateNotifications && (
                <TouchableOpacity
                  style={styles.secondaryActionBtn}
                  onPress={() => {
                    onClose();
                    onNavigateNotifications();
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.secondaryActionText,
                      { color: isDark ? '#94A3B8' : '#64748B' },
                    ]}
                  >
                    All Notifications
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[
                  styles.acknowledgeBtn,
                  { backgroundColor: accentColors.primary },
                ]}
                onPress={handleAcknowledge}
                activeOpacity={0.85}
              >
                <Ionicons
                  name="checkmark-done"
                  size={16}
                  color="#FFFFFF"
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.acknowledgeBtnText}>Acknowledge</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Full screen lightbox when tapped */}
      <ImageViewerModal
        visible={imageViewerOpen}
        imageUrl={announcement.imageUrl}
        title="Announcement Image"
        onClose={() => setImageViewerOpen(false)}
      />
    </>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialog: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '85%',
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 20,
  },
  headerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  megaphoneIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  headerTextCol: {
    flex: 1,
  },
  announcementPill: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  headerDate: {
    fontSize: 11,
    marginTop: 1,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 12,
  },
  bodyScroll: {
    flexGrow: 0,
  },
  bodyContent: {
    padding: 18,
  },
  imageWrapper: {
    width: '100%',
    height: 180,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 16,
    position: 'relative',
    backgroundColor: '#00000020',
  },
  announcementImage: {
    width: '100%',
    height: '100%',
  },
  expandHint: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  expandText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 4,
  },
  messageBox: {
    marginBottom: 16,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 23,
    letterSpacing: 0.1,
  },
  metaFooter: {
    borderTopWidth: 1,
    paddingTop: 12,
  },
  metaAuthor: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  metaAuthorText: {
    fontSize: 12,
  },
  actionFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopWidth: 1,
    gap: 10,
  },
  secondaryActionBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  secondaryActionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  acknowledgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  acknowledgeBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
