import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';

const ACCESS_TOKEN_KEY = 'payroll_access_token';
const REFRESH_TOKEN_KEY = 'payroll_refresh_token';
const BIOMETRICS_ENABLED_KEY = 'payroll_biometrics_enabled';
const STORED_EMAIL_KEY = 'payroll_stored_email';
const BIOMETRIC_REFRESH_KEY = 'payroll_bio_refresh_token';

export interface BiometricStatus {
  hasHardware: boolean;
  isEnrolled: boolean;
  supportedTypes: LocalAuthentication.AuthenticationType[];
  isFaceId: boolean;
}

export const AuthService = {
  /**
   * Save JWT tokens securely
   */
  async saveTokens(access: string, refresh: string): Promise<void> {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, access);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refresh);
  },

  /**
   * Get the stored access token
   */
  async getAccessToken(): Promise<string | null> {
    return await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  },

  /**
   * Get the stored refresh token
   */
  async getRefreshToken(): Promise<string | null> {
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  },

  /**
   * Clear JWT tokens on logout (leaves biometric enrollment intact for fast re-login)
   */
  async clearTokens(): Promise<void> {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  },

  /**
   * Check biometric hardware and configuration status
   */
  async getBiometricStatus(): Promise<BiometricStatus> {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
    const isFaceId = supportedTypes.includes(
      LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION
    );

    return {
      hasHardware,
      isEnrolled,
      supportedTypes,
      isFaceId,
    };
  },

  /**
   * Run biometric authentication
   */
  async authenticateBiometrics(promptMessage: string = 'Verify Face ID or fingerprint to sign in'): Promise<boolean> {
    const status = await this.getBiometricStatus();
    if (!status.hasHardware || !status.isEnrolled) {
      return false;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      fallbackLabel: 'Use Device Passcode',
      disableDeviceFallback: false,
    });

    return result.success;
  },

  /**
   * Store email and enable biometrics with refresh token for instant 1-tap re-login
   */
  async enableBiometrics(email: string, refresh?: string): Promise<void> {
    await SecureStore.setItemAsync(BIOMETRICS_ENABLED_KEY, 'true');
    await SecureStore.setItemAsync(STORED_EMAIL_KEY, email);
    if (refresh) {
      await SecureStore.setItemAsync(BIOMETRIC_REFRESH_KEY, refresh);
    }
  },

  /**
   * Get biometric refresh token for 1-tap Face ID / Biometric login
   */
  async getBiometricRefreshToken(): Promise<string | null> {
    return await SecureStore.getItemAsync(BIOMETRIC_REFRESH_KEY);
  },

  /**
   * Completely disable and clear biometrics
   */
  async disableBiometrics(): Promise<void> {
    await SecureStore.deleteItemAsync(BIOMETRICS_ENABLED_KEY);
    await SecureStore.deleteItemAsync(BIOMETRIC_REFRESH_KEY);
  },

  /**
   * Check if biometrics are enabled by the user
   */
  async areBiometricsEnabled(): Promise<boolean> {
    const enabled = await SecureStore.getItemAsync(BIOMETRICS_ENABLED_KEY);
    return enabled === 'true';
  },

  /**
   * Get last stored email
   */
  async getStoredEmail(): Promise<string | null> {
    return await SecureStore.getItemAsync(STORED_EMAIL_KEY);
  },
};
