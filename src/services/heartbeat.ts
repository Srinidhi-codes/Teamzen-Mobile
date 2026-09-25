import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { restRequest } from './api';
import { LocationService } from './location';

export const ATTENDANCE_HEARTBEAT_TASK = 'ATTENDANCE_HEARTBEAT_TASK';
const LAST_HEARTBEAT_KEY = 'attendance_last_heartbeat';

export interface HeartbeatResponse {
  status: string;
  heartbeat_id?: number;
  is_within_geofence?: boolean;
  distance_meters?: number;
  should_stop?: boolean;
  roaming_flag?: boolean;
  message?: string;
}

// 1. Define the background task at top-level module scope
if (!TaskManager.isTaskDefined(ATTENDANCE_HEARTBEAT_TASK)) {
  TaskManager.defineTask(ATTENDANCE_HEARTBEAT_TASK, async ({ data, error }) => {
    if (error) {
      console.warn('[Heartbeat] Background location error:', error);
      return;
    }

    if (data) {
      const { locations } = data as { locations: Location.LocationObject[] };
      const latest = locations && locations.length > 0 ? locations[locations.length - 1] : null;

      if (latest) {
        try {
          const isMocked = (latest as any).mocked === true || (await LocationService.isMockLocationActive());
          const coords = latest.coords;

          const response = await restRequest<HeartbeatResponse>('/attendance/heartbeat/', {
            method: 'POST',
            body: JSON.stringify({
              latitude: coords.latitude,
              longitude: coords.longitude,
              accuracy: coords.accuracy,
              is_mocked: isMocked,
            }),
          });

          await AsyncStorage.setItem(
            LAST_HEARTBEAT_KEY,
            JSON.stringify({
              timestamp: Date.now(),
              coords: { latitude: coords.latitude, longitude: coords.longitude },
              response,
            })
          );

          // If the backend reports shift ended or no active check-in, stop background task automatically
          if (response?.should_stop) {
            console.log('[Heartbeat] Shift inactive on backend. Stopping background tracking.');
            await stopHeartbeatTracking();
          }
        } catch (err: any) {
          console.warn('[Heartbeat] Failed to post heartbeat:', err?.message || err);
        }
      }
    }
  });
}

/**
 * Start background location heartbeat for the active shift
 */
export async function startHeartbeatTracking(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false;
  }

  try {
    const isStarted = await Location.hasStartedLocationUpdatesAsync(ATTENDANCE_HEARTBEAT_TASK);
    if (isStarted) {
      console.log('[Heartbeat] Background task is already active.');
      return true;
    }

    // 1. Ensure Foreground permission
    const fg = await Location.getForegroundPermissionsAsync();
    if (fg.status !== 'granted') {
      const reqFg = await Location.requestForegroundPermissionsAsync();
      if (reqFg.status !== 'granted') {
        console.warn('[Heartbeat] Foreground permission not granted.');
        return false;
      }
    }

    // 2. Request Background permission
    const bg = await Location.getBackgroundPermissionsAsync();
    if (bg.status !== 'granted') {
      const reqBg = await Location.requestBackgroundPermissionsAsync();
      if (reqBg.status !== 'granted') {
        console.warn('[Heartbeat] Background location permission denied.');
        return false;
      }
    }

    // 3. Start battery-efficient location updates (20 minutes interval)
    await Location.startLocationUpdatesAsync(ATTENDANCE_HEARTBEAT_TASK, {
      accuracy: Location.Accuracy.Balanced, // ~100m, battery-friendly
      timeInterval: 20 * 60 * 1000,         // 20 minutes
      distanceInterval: 100,                // 100 meters
      deferredUpdatesInterval: 20 * 60 * 1000,
      pausesUpdatesAutomatically: true,
      showsBackgroundLocationIndicator: false,
      foregroundService: {
        notificationTitle: 'Teamzen Shift Active',
        notificationBody: 'Periodic presence verification in progress',
        notificationColor: '#4f46e5',
      },
    });

    console.log('[Heartbeat] Background heartbeat updates started.');
    return true;
  } catch (err) {
    console.error('[Heartbeat] Error starting background tracking:', err);
    return false;
  }
}

/**
 * Stop background location heartbeat upon checkout
 */
export async function stopHeartbeatTracking(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const isStarted = await Location.hasStartedLocationUpdatesAsync(ATTENDANCE_HEARTBEAT_TASK);
    if (isStarted) {
      await Location.stopLocationUpdatesAsync(ATTENDANCE_HEARTBEAT_TASK);
      console.log('[Heartbeat] Background heartbeat task stopped.');
    }
  } catch (err) {
    console.warn('[Heartbeat] Error stopping background tracking:', err);
  }
}

/**
 * Check if heartbeat task is currently active
 */
export async function isHeartbeatTrackingActive(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return await Location.hasStartedLocationUpdatesAsync(ATTENDANCE_HEARTBEAT_TASK);
  } catch {
    return false;
  }
}

/**
 * Send an immediate heartbeat ping (e.g. right after check-in)
 */
export async function sendImmediateHeartbeat(coords: { latitude: number; longitude: number }): Promise<HeartbeatResponse | null> {
  try {
    const isMocked = await LocationService.isMockLocationActive();
    return await restRequest<HeartbeatResponse>('/attendance/heartbeat/', {
      method: 'POST',
      body: JSON.stringify({
        latitude: coords.latitude,
        longitude: coords.longitude,
        is_mocked: isMocked,
      }),
    });
  } catch (e: any) {
    console.warn('[Heartbeat] Immediate heartbeat error:', e?.message || e);
    return null;
  }
}
