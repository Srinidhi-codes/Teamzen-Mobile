import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MOCK_LOCATION_KEY = 'payroll_mock_location';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface GeofenceStatus {
  isWithin: boolean;
  distance: number; // in meters
}

export const LocationService = {
  /**
   * Request foreground location permission
   */
  async requestPermission(): Promise<boolean> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  },

  /**
   * Check if location permission is granted
   */
  async hasPermission(): Promise<boolean> {
    const { status } = await Location.getForegroundPermissionsAsync();
    return status === 'granted';
  },

  /**
   * Get current location with detailed status diagnostics
   */
  async getCurrentLocationDetailed(): Promise<{ coords: Coordinates | null; error?: 'PERMISSION_DENIED' | 'SERVICES_DISABLED' | 'GPS_TIMEOUT' | 'UNKNOWN_ERROR' }> {
    // Check if a mock location is saved
    const mock = await AsyncStorage.getItem(MOCK_LOCATION_KEY);
    if (mock) {
      try {
        const parsed = JSON.parse(mock);
        if (parsed && (typeof parsed.latitude === 'number' || typeof parsed.latitude === 'string') && (typeof parsed.longitude === 'number' || typeof parsed.longitude === 'string')) {
          return {
            coords: {
              latitude: typeof parsed.latitude === 'string' ? parseFloat(parsed.latitude) : parsed.latitude,
              longitude: typeof parsed.longitude === 'string' ? parseFloat(parsed.longitude) : parsed.longitude,
            }
          };
        }
      } catch {
        // Fallback to real GPS if mock parsing fails
      }
    }

    const permission = await this.hasPermission();
    if (!permission) {
      const granted = await this.requestPermission();
      if (!granted) {
        console.warn('Location permission was denied by the user.');
        return { coords: null, error: 'PERMISSION_DENIED' };
      }
    }

    // Check if device-wide location services are enabled
    try {
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        console.warn('Location services are disabled on the device.');
        return { coords: null, error: 'SERVICES_DISABLED' };
      }
    } catch (e) {
      console.warn('Error checking location services status:', e);
    }

    try {
      const getPositionPromise = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const timeoutPromise = new Promise<any>((_, reject) =>
        setTimeout(() => reject(new Error('GPS_TIMEOUT')), 6000)
      );
      const location = await Promise.race([getPositionPromise, timeoutPromise]);
      return {
        coords: {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        }
      };
    } catch (error: any) {
      console.error('Error getting real-time GPS location:', error);
      
      // Try last known position first as a fast fallback
      try {
        const lastKnown = await Location.getLastKnownPositionAsync({});
        if (lastKnown) {
          return {
            coords: {
              latitude: lastKnown.coords.latitude,
              longitude: lastKnown.coords.longitude,
            }
          };
        }
      } catch (e) {
        console.warn('Failed to get last known position:', e);
      }

      return {
        coords: null,
        error: error.message === 'GPS_TIMEOUT' ? 'GPS_TIMEOUT' : 'UNKNOWN_ERROR',
      };
    }
  },

  /**
   * Get current location, respecting developer mock overrides
   */
  async getCurrentLocation(): Promise<Coordinates | null> {
    const result = await this.getCurrentLocationDetailed();
    return result.coords;
  },

  /**
   * Save developer mock coordinates
   */
  async setMockLocation(lat: number, lon: number): Promise<void> {
    await AsyncStorage.setItem(MOCK_LOCATION_KEY, JSON.stringify({ latitude: lat, longitude: lon }));
  },

  /**
   * Clear developer mock coordinates
   */
  async clearMockLocation(): Promise<void> {
    await AsyncStorage.removeItem(MOCK_LOCATION_KEY);
  },

  /**
   * Check if a mock location is active
   */
  async isMockLocationActive(): Promise<boolean> {
    const mock = await AsyncStorage.getItem(MOCK_LOCATION_KEY);
    return mock !== null;
  },

  /**
   * Calculate distance in meters using Haversine formula (matching backend)
   */
  calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  },

  /**
   * Verify if user is within the geofenced area of a specific office
   */
  checkGeofence(
    userLat: number,
    userLon: number,
    officeLat: any,
    officeLon: any,
    radiusMeters: number
  ): GeofenceStatus {
    const lat = typeof officeLat === 'string' ? parseFloat(officeLat) : officeLat;
    const lon = typeof officeLon === 'string' ? parseFloat(officeLon) : officeLon;
    const distance = this.calculateDistance(userLat, userLon, lat, lon);
    return {
      isWithin: distance <= radiusMeters,
      distance,
    };
  },
};
