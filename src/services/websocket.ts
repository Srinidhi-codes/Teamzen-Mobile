import { API_URL } from './api';

export interface NotificationWsMessage {
  id: string;
  verb: string;
  message: string;
  level?: string;
  createdAt?: string;
  isRead?: boolean;
  target_type?: string;
  target_id?: string;
  imageUrl?: string;
  actor?: {
    id?: string;
    firstName?: string;
    lastName?: string;
  };
}

type MessageListener = (msg: NotificationWsMessage) => void;
type StatusListener = (connected: boolean) => void;

class WebSocketManager {
  private socket: WebSocket | null = null;
  private token: string | null = null;
  private isExplicitlyClosed = false;
  private reconnectAttempts = 0;
  private reconnectTimer: any = null;
  private heartbeatTimer: any = null;
  private messageListeners = new Set<MessageListener>();
  private statusListeners = new Set<StatusListener>();

  public isConnected = false;

  private getSocketUrl(token: string): string {
    const wsBase = API_URL.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
    return `${wsBase}/ws/notifications/?token=${encodeURIComponent(token)}`;
  }

  public connect(token: string) {
    if (!token) return;
    if (this.socket && this.token === token && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.disconnect();
    this.token = token;
    this.isExplicitlyClosed = false;
    this.initSocket();
  }

  private initSocket() {
    if (!this.token || this.isExplicitlyClosed) return;

    try {
      const url = this.getSocketUrl(this.token);
      this.socket = new WebSocket(url);

      this.socket.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.notifyStatus(true);
        this.startHeartbeat();
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && typeof data === 'object') {
            this.notifyMessage(data as NotificationWsMessage);
          }
        } catch {
          // ignore non-JSON messages (e.g. pong heartbeat)
        }
      };

      this.socket.onerror = (err) => {
        // Log in dev only, avoid crashing
        if (__DEV__) {
          console.log('[WebSocket] Notification connection error:', err);
        }
      };

      this.socket.onclose = (event) => {
        this.isConnected = false;
        this.notifyStatus(false);
        this.stopHeartbeat();
        this.socket = null;

        if (!this.isExplicitlyClosed) {
          this.scheduleReconnect();
        }
      };
    } catch (e) {
      this.isConnected = false;
      this.notifyStatus(false);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.isExplicitlyClosed || !this.token) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    // Exponential backoff with jitter (2s, 4s, 8s, up to 16s)
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts) + Math.random() * 1000, 16000);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.initSocket();
    }, delay);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        try {
          this.socket.send(JSON.stringify({ type: 'ping' }));
        } catch {
          // ignore
        }
      }
    }, 30000);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  public disconnect() {
    this.isExplicitlyClosed = true;
    this.token = null;
    this.isConnected = false;
    this.stopHeartbeat();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // ignore
      }
      this.socket = null;
    }

    this.notifyStatus(false);
  }

  public addMessageListener(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => {
      this.messageListeners.delete(listener);
    };
  }

  public addStatusListener(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.isConnected);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private notifyMessage(msg: NotificationWsMessage) {
    this.messageListeners.forEach((listener) => {
      try {
        listener(msg);
      } catch (e) {
        console.error('[WebSocket] Error in message listener:', e);
      }
    });
  }

  private notifyStatus(status: boolean) {
    this.statusListeners.forEach((listener) => {
      try {
        listener(status);
      } catch (e) {
        console.error('[WebSocket] Error in status listener:', e);
      }
    });
  }
}

export const WebSocketService = new WebSocketManager();
