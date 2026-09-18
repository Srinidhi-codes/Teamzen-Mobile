import { graphqlRequest } from './api';

export interface NotificationActor {
  id: string;
  firstName?: string;
  lastName?: string;
}

export interface NotificationItem {
  id: string;
  verb: string;
  message: string;
  targetType?: string;
  targetId?: string;
  imageUrl?: string;
  isRead: boolean;
  createdAt: string;
  actor?: NotificationActor;
}

export interface PaginatedNotifications {
  results: NotificationItem[];
  total: number;
  page: number;
  pageSize: number;
}

const GET_MY_NOTIFICATIONS = `
  query GetMyNotifications($level: String, $isRead: Boolean, $page: Int, $pageSize: Int) {
    myNotifications(level: $level, isRead: $isRead, page: $page, pageSize: $pageSize) {
      results {
        id
        verb
        message
        targetType
        targetId
        imageUrl
        isRead
        createdAt
        actor {
          id
          firstName
          lastName
        }
      }
      total
      page
      pageSize
    }
  }
`;

const GET_UNREAD_COUNT = `
  query GetUnreadCount($level: String) {
    unreadNotificationCount(level: $level)
  }
`;

const MARK_NOTIFICATION_READ = `
  mutation MarkNotificationRead($id: ID!) {
    markNotificationAsRead(id: $id)
  }
`;

const MARK_ALL_READ = `
  mutation MarkAllRead {
    markAllNotificationsAsRead
  }
`;

const DELETE_NOTIFICATION = `
  mutation DeleteNotification($id: ID!) {
    deleteNotification(id: $id)
  }
`;

const DELETE_ALL_READ_NOTIFICATIONS = `
  mutation DeleteAllReadNotifications {
    deleteAllReadNotifications
  }
`;

// In-memory cache for unread count to allow instant badge display across headers
let cachedUnreadCount = 0;
let countListeners: ((count: number) => void)[] = [];

export function getCachedUnreadCount(): number {
  return cachedUnreadCount;
}

export function subscribeUnreadCount(cb: (count: number) => void): () => void {
  countListeners.push(cb);
  cb(cachedUnreadCount);
  return () => {
    countListeners = countListeners.filter(l => l !== cb);
  };
}

export function updateCachedUnreadCount(count: number) {
  cachedUnreadCount = count;
  countListeners.forEach(cb => {
    try { cb(count); } catch (e) {}
  });
}

export function incrementCachedUnreadCount() {
  updateCachedUnreadCount(cachedUnreadCount + 1);
}

export const NotificationService = {
  async fetchNotifications(params: {
    level?: string;
    isRead?: boolean;
    page?: number;
    pageSize?: number;
  } = {}): Promise<PaginatedNotifications> {
    const data = await graphqlRequest<{ myNotifications: PaginatedNotifications }>(
      GET_MY_NOTIFICATIONS,
      {
        level: params.level ?? 'personal',
        isRead: params.isRead,
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 15,
      }
    );
    return data.myNotifications;
  },

  async fetchUnreadCount(level = 'personal'): Promise<number> {
    try {
      const data = await graphqlRequest<{ unreadNotificationCount: number }>(
        GET_UNREAD_COUNT,
        { level }
      );
      const count = data.unreadNotificationCount || 0;
      updateCachedUnreadCount(count);
      return count;
    } catch (e) {
      console.warn('Failed to fetch unread notification count:', e);
      return cachedUnreadCount;
    }
  },

  async markAsRead(id: string): Promise<boolean> {
    try {
      await graphqlRequest<{ markNotificationAsRead: boolean }>(
        MARK_NOTIFICATION_READ,
        { id }
      );
      if (cachedUnreadCount > 0) {
        updateCachedUnreadCount(cachedUnreadCount - 1);
      }
      return true;
    } catch (e) {
      console.error('Failed to mark notification as read:', e);
      return false;
    }
  },

  async markAllAsRead(): Promise<boolean> {
    try {
      await graphqlRequest<{ markAllNotificationsAsRead: boolean }>(MARK_ALL_READ);
      updateCachedUnreadCount(0);
      return true;
    } catch (e) {
      console.error('Failed to mark all notifications as read:', e);
      return false;
    }
  },

  async deleteNotification(id: string): Promise<boolean> {
    try {
      await graphqlRequest<{ deleteNotification: boolean }>(
        DELETE_NOTIFICATION,
        { id }
      );
      return true;
    } catch (e) {
      console.error('Failed to delete notification:', e);
      return false;
    }
  },

  async deleteAllRead(): Promise<boolean> {
    try {
      await graphqlRequest<{ deleteAllReadNotifications: boolean }>(
        DELETE_ALL_READ_NOTIFICATIONS
      );
      return true;
    } catch (e) {
      console.error('Failed to delete all read notifications:', e);
      return false;
    }
  },
};
