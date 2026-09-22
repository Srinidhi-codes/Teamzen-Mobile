import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { InAppToast, ToastData } from '../components/InAppToast';
import {
  AnnouncementModal,
  AnnouncementData,
} from '../components/AnnouncementModal';
import { ImageViewerModal } from '../components/ImageViewerModal';
import {
  WebSocketService,
  NotificationWsMessage,
} from '../services/websocket';
import { useAuth } from './AuthContext';
import {
  NotificationService,
  NotificationItem,
  incrementCachedUnreadCount,
} from '../services/notifications';

export interface ToastContextType {
  showToast: (data: Omit<ToastData, 'id'>) => void;
  showAnnouncement: (announcement: AnnouncementData) => void;
  showImagePreview: (imageUrl: string, title?: string) => void;
}

const ToastContext = createContext<ToastContextType>({
  showToast: () => {},
  showAnnouncement: () => {},
  showImagePreview: () => {},
});

export const useToast = () => useContext(ToastContext);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { accessToken } = useAuth();

  const [activeToast, setActiveToast] = useState<ToastData | null>(null);
  const [activeAnnouncement, setActiveAnnouncement] =
    useState<AnnouncementData | null>(null);
  const [imagePreview, setImagePreview] = useState<{
    url: string | null;
    title?: string;
  }>({ url: null });

  // Connect WebSocket when accessToken is present
  useEffect(() => {
    if (accessToken) {
      WebSocketService.connect(accessToken);
    } else {
      WebSocketService.disconnect();
    }

    return () => {
      // Don't disconnect on minor re-renders, manager handles stability
    };
  }, [accessToken]);

  // Initial check for recent unread announcement
  const checkRecentAnnouncement = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await NotificationService.fetchNotifications({
        level: 'personal',
        isRead: false,
        page: 1,
        pageSize: 5,
      });

      const announcements = (res?.results || []).filter(
        (n: NotificationItem) => n.verb === 'announcement'
      );
      if (announcements.length > 0) {
        const latest = announcements[0];
        const seen = await AsyncStorage.getItem(
          `seen_announcement_${latest.id}`
        );
        if (!seen) {
          setActiveAnnouncement({
            id: latest.id,
            message: latest.message,
            imageUrl: latest.imageUrl,
            createdAt: latest.createdAt,
            actor: latest.actor,
          });
        }
      }
    } catch {
      // ignore
    }
  }, [accessToken]);

  useEffect(() => {
    const timer = setTimeout(() => {
      checkRecentAnnouncement();
    }, 1500);
    return () => clearTimeout(timer);
  }, [checkRecentAnnouncement]);

  const showImagePreview = useCallback((url: string, title?: string) => {
    setImagePreview({ url, title });
  }, []);

  const showAnnouncement = useCallback((announcement: AnnouncementData) => {
    setActiveAnnouncement(announcement);
  }, []);

  const showToast = useCallback(
    (data: Omit<ToastData, 'id'>) => {
      const id = Math.random().toString(36).substring(2, 9);
      setActiveToast({
        ...data,
        id,
        onImagePress: data.imageUrl
          ? (imgUrl) => showImagePreview(imgUrl, data.title)
          : undefined,
      });
    },
    [showImagePreview]
  );

  // Handle incoming real-time WebSocket notifications
  useEffect(() => {
    const unsubscribe = WebSocketService.addMessageListener(
      (msg: NotificationWsMessage) => {
        // 1. Immediately bump unread count badge
        incrementCachedUnreadCount();

        // 2. Determine action and route
        const handleTap = () => {
          if (msg.verb === 'announcement') {
            setActiveAnnouncement({
              id: msg.id,
              message: msg.message,
              imageUrl: msg.imageUrl,
              createdAt: msg.createdAt,
              actor: msg.actor,
            });
            return;
          }

          if (msg.target_type === 'Attendance Correction') {
            router.push('/attendance-requests' as any);
          } else if (msg.target_type === 'Leave Request') {
            router.push('/leave' as any);
          } else if (msg.target_type === 'Payroll') {
            router.push('/payroll' as any);
          } else {
            router.push('/notifications' as any);
          }
        };

        const title = msg.verb === 'announcement'
          ? 'Company Announcement'
          : msg.verb?.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || 'Notification';

        // 3. Trigger In-App Toast
        showToast({
          title,
          message: msg.message,
          verb: msg.verb,
          imageUrl: msg.imageUrl,
          targetType: msg.target_type,
          targetId: msg.target_id,
          onPress: handleTap,
        });

        // 4. If announcement, also pop up the rich modal directly!
        if (msg.verb === 'announcement') {
          setActiveAnnouncement({
            id: msg.id,
            message: msg.message,
            imageUrl: msg.imageUrl,
            createdAt: msg.createdAt,
            actor: msg.actor,
          });
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [showToast]);

  return (
    <ToastContext.Provider
      value={{
        showToast,
        showAnnouncement,
        showImagePreview,
      }}
    >
      {children}

      {/* Floating In-App Toast */}
      <InAppToast
        toast={activeToast}
        onDismiss={() => setActiveToast(null)}
      />

      {/* Reusable Announcement Modal */}
      <AnnouncementModal
        visible={!!activeAnnouncement}
        announcement={activeAnnouncement}
        onClose={() => setActiveAnnouncement(null)}
        onNavigateNotifications={() => router.push('/notifications' as any)}
      />

      {/* Reusable Full-Screen Image Lightbox */}
      <ImageViewerModal
        visible={!!imagePreview.url}
        imageUrl={imagePreview.url}
        title={imagePreview.title}
        onClose={() => setImagePreview({ url: null })}
      />
    </ToastContext.Provider>
  );
};
