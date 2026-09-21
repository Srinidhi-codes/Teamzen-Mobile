import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  ImageBackground,
  View,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { AuthService } from '../services/auth';
import { API_URL, graphqlRequest, restRequest } from '../services/api';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import BrandLogo from '../components/BrandLogo';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { decode as atob } from 'base-64';
import { OnboardingStorage } from '../utils/onboardingStorage';
import { useAppTheme } from '../context/ThemeContext';
import { ErrorModal } from '../components/ErrorModal';

WebBrowser.maybeCompleteAuthSession();

const LOGIN_MUTATION = `
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      access
      refresh
      totpRequired
      tempToken
    }
  }
`;

// ─── Google OAuth constants (module-level to avoid re-init on every render) ──
const GOOGLE_CLIENT_ID = '166003082913-h3h31hscrila0bojqkphetl2u1gf065m.apps.googleusercontent.com';
const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};
const GOOGLE_REDIRECT_URI = AuthSession.makeRedirectUri({ useProxy: true } as any);

export default function LoginScreen() {
  const { signIn } = useAuth();
  const router = useRouter();
  const { setOrgAccent } = useAppTheme();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mobileOrEmail, setMobileOrEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);
  const [isFaceId, setIsFaceId] = useState(false);
  const [savedEmail, setSavedEmail] = useState<string | null>(null);

  // New States
  const [authType, setAuthType] = useState<'password' | 'otp'>('password');
  const [step, setStep] = useState<'login' | 'otp_code' | 'totp'>('login');
  const [otpCode, setOtpCode] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [countdown, setCountdown] = useState(0);

  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const [errorModal, setErrorModal] = useState({ visible: false, title: '', message: '' });

  const showError = (title: string, message: string) => {
    setErrorModal({ visible: true, title, message });
  };

  // Generic AuthSession with Expo proxy — works on all platforms without platform client IDs
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: GOOGLE_CLIENT_ID,
      redirectUri: GOOGLE_REDIRECT_URI,
      scopes: ['openid', 'email', 'profile'],
      responseType: AuthSession.ResponseType.Token,
      usePKCE: false,
      extraParams: { access_type: 'online' },
    },
    GOOGLE_DISCOVERY
  );

  useEffect(() => {
    if (!response) return;
    if (response.type === 'success') {
      // Prefer id_token from the token params, fall back to access_token
      const respAny = response as any;
      const idToken = respAny.params?.id_token as string | undefined;
      const accessToken = respAny.authentication?.accessToken ?? (respAny.params?.access_token as string | undefined);
      const token = idToken || accessToken;
      if (token) handleGoogleAuthToken(token);
    } else if (response.type === 'error') {
      const respAny = response as any;
      showError('Google Sign-In Failed', respAny.error?.message || respAny.errorCode || 'Sign-in was unsuccessful.');
    }
  }, [response]);

  useEffect(() => {
    checkBiometrics();
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const handlePostLoginSuccess = async (access: string, refresh: string, userEmail: string) => {
    await signIn(access, refresh, userEmail);
    try {
      const res = await graphqlRequest<{ me?: { organization?: { accent?: string } } }>(
        `query GetOrgAccent { me { organization { accent } } }`
      );
      if (res?.me?.organization?.accent) {
        setOrgAccent(res.me.organization.accent);
      }
    } catch (e) {}

    const seen = await OnboardingStorage.hasSeenOnboarding();
    if (!seen) {
      router.replace('/onboarding');
    } else {
      router.replace('/(tabs)');
    }
  };

  const checkBiometrics = async () => {
    try {
      const bioStatus = await AuthService.getBiometricStatus();
      if (bioStatus.hasHardware) {
        setIsBiometricAvailable(true);
        setIsFaceId(bioStatus.isFaceId);
      }
      const emailStored = await AuthService.getStoredEmail();
      if (emailStored) {
        setSavedEmail(emailStored);
        setEmail(emailStored);
      }
    } catch (e) {
      console.log('Error checking biometrics:', e);
    }
  };

  const handleBiometricLogin = async () => {
    setIsLoading(true);
    try {
      const bioStatus = await AuthService.getBiometricStatus();
      if (!bioStatus.hasHardware) {
        showError('Not Available', 'Biometric / Face authentication is not supported on this device.');
        return;
      }
      if (!bioStatus.isEnrolled) {
        showError(
          'Biometrics Not Enrolled',
          'Please enroll Face ID or Fingerprint in your phone settings to use fast login.'
        );
        return;
      }

      const promptLabel = bioStatus.isFaceId
        ? 'Scan Face ID to sign in to Teamzen'
        : 'Verify Face ID or fingerprint to sign in to Teamzen';

      const success = await AuthService.authenticateBiometrics(promptLabel);
      if (!success) {
        return;
      }

      const storedEmail = await AuthService.getStoredEmail();
      const bioRefresh = await AuthService.getBiometricRefreshToken();

      if (bioRefresh && storedEmail) {
        // Exchange refresh token for fresh access token with backend
        try {
          const res = await fetch(`${API_URL}/api/auth/refresh/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh: bioRefresh }),
          });
          if (res.ok) {
            const data = await res.json();
            const newAccess = data.access;
            const newRefresh = data.refresh || bioRefresh;
            await handlePostLoginSuccess(newAccess, newRefresh, storedEmail);
            return;
          }
        } catch (refreshErr) {
          console.log('Biometric refresh request error:', refreshErr);
        }
      }

      // If no valid session was linked yet on this phone
      showError(
        'One-Time Setup Required',
        'Please sign in with your Password once. Face ID will then be linked automatically for instant 1-tap login next time!'
      );
    } catch (error: any) {
      console.error('Biometric authentication error:', error);
      showError('Authentication Error', error.message || 'Face ID authentication could not be completed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordLogin = async () => {
    const userIdentifier = (email || savedEmail || '').trim();
    if (!userIdentifier || !password) {
      showError('Error', 'Please enter both email/username and password.');
      return;
    }

    setIsLoading(true);
    try {
      const result = await graphqlRequest<{ 
        login: { access: string | null; refresh: string | null; totpRequired: boolean; tempToken: string | null } 
      }>(
        LOGIN_MUTATION,
        { email: userIdentifier, password }
      );

      if (result && result.login) {
        if (result.login.totpRequired && result.login.tempToken) {
          setTempToken(result.login.tempToken);
          setStep('totp');
        } else if (result.login.access && result.login.refresh) {
          await handlePostLoginSuccess(result.login.access, result.login.refresh, userIdentifier);
        } else {
          throw new Error('Authentication payload missing');
        }
      } else {
        throw new Error('Authentication failed');
      }
    } catch (error: any) {
      showError('Login Failed', error.message || 'Invalid email or password.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendOtp = async () => {
    const target = (mobileOrEmail || email).trim();
    if (!target) {
      showError('Error', 'Please enter your email address.');
      return;
    }
    setIsLoading(true);
    try {
      const res = await restRequest<{ success: boolean; message: string; dev_otp?: string }>(
        '/users/auth/otp/send/',
        {
          method: 'POST',
          body: JSON.stringify({ identifier: target }),
        }
      );
      setStep('otp_code');
      setCountdown(60);
      if (res.dev_otp) {
        Alert.alert('Verification Code Sent', `${res.message}\n\n[Dev Code: ${res.dev_otp}]`);
      } else {
        Alert.alert('Verification Code Sent', res.message || 'Verification code has been sent to your registered contact.');
      }
    } catch (error: any) {
      showError('Error', error.message || 'Failed to send verification code.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpCode) {
      showError('Error', 'Please enter the 6-digit verification code.');
      return;
    }
    const target = (mobileOrEmail || email).trim();
    setIsLoading(true);
    try {
      const res = await restRequest<{ 
        user: any; 
        access?: string; 
        refresh?: string; 
        totp_required?: boolean; 
        temp_token?: string 
      }>('/users/auth/otp/verify/', {
        method: 'POST',
        body: JSON.stringify({ identifier: target, otp: otpCode }),
      });

      if (res.totp_required && res.temp_token) {
        setTempToken(res.temp_token);
        setStep('totp');
      } else if (res.access && res.refresh) {
        await handlePostLoginSuccess(res.access, res.refresh, res.user?.email || target);
      }
    } catch (error: any) {
      showError('Verification Failed', error.message || 'Invalid or expired verification code.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyTotp = async () => {
    if (!totpCode) {
      showError('Error', 'Please enter the authenticator code.');
      return;
    }
    setIsLoading(true);
    try {
      const res = await restRequest<{ 
        user: any; 
        access: string; 
        refresh: string 
      }>('/users/auth/totp/verify/', {
        method: 'POST',
        body: JSON.stringify({ temp_token: tempToken, code: totpCode }),
      });

      if (res.access && res.refresh) {
        await handlePostLoginSuccess(res.access, res.refresh, email.trim() || savedEmail || '');
      }
    } catch (error: any) {
      showError('Invalid Code', error.message || 'Incorrect verification code. Try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleAuthToken = async (idToken: string) => {
    setIsGoogleLoading(true);
    try {
      // Decode email from JWT payload (ID tokens are JWTs)
      let googleEmail = '';
      try {
        const parts = idToken.split('.');
        if (parts.length === 3) {
          const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          const padded = payload + '=='.slice(0, (4 - (payload.length % 4)) % 4);
          const decoded = JSON.parse(atob(padded));
          googleEmail = decoded.email || '';
        }
      } catch {
        // If decoding fails, continue without email
      }

      // Send the ID token to our backend for verification
      const res = await restRequest<{
        access?: string;
        refresh?: string;
        totp_required?: boolean;
        temp_token?: string;
        error?: string;
      }>('/users/auth/google/', {
        method: 'POST',
        body: JSON.stringify({ id_token: idToken }),
      });

      if (res.totp_required && res.temp_token) {
        setTempToken(res.temp_token);
        setStep('totp');
      } else if (res.access && res.refresh) {
        await handlePostLoginSuccess(res.access, res.refresh, googleEmail);
      } else {
        throw new Error(res.error || 'Unexpected response from server.');
      }
    } catch (error: any) {
      showError(
        'Google Sign-In Failed',
        error.message || 'Your Google account may not be registered in the system. Please contact HR.'
      );
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    if (!isGoogleLoading) promptAsync();
  };

  return (
    <ImageBackground
      source={require('../../assets/images/login-employee.webp')}
      style={styles.backgroundImage}
      resizeMode="cover"
    >
      <View style={styles.backgroundOverlay} />
      <SafeAreaView style={styles.safeContainer}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.container}
        >
          <View style={styles.content}>
            {/* Logo & Header */}
            <View style={styles.logoSection}>
              <BrandLogo size={52} subtitle="HR Portal & Payroll Assistant" />
            </View>

          {/* Form Content Switcher */}
          {step === 'totp' ? (
            /* ================== TOTP Verification Screen ================== */
            <View style={styles.formCard}>
              <View style={styles.totpHeader}>
                <Ionicons name="key" size={32} color="#8b5cf6" />
                <Text style={styles.totpTitle}>2-Factor Verification</Text>
                <Text style={styles.totpSubtitle}>
                  Enter the 6-digit verification code from Google Authenticator.
                </Text>
              </View>

              <View style={styles.inputContainer}>
                <Ionicons name="shield-checkmark-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, styles.totpInput]}
                  placeholder="000000"
                  placeholderTextColor="#64748b"
                  keyboardType="number-pad"
                  maxLength={6}
                  value={totpCode}
                  onChangeText={(text) => setTotpCode(text.replace(/\D/g, ''))}
                />
              </View>

              <TouchableOpacity
                style={[styles.loginButton, { backgroundColor: '#8b5cf6' }]}
                onPress={handleVerifyTotp}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.loginButtonText}>Verify & Sign In</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelLink}
                onPress={() => { setStep('login'); setTotpCode(''); }}
              >
                <Text style={styles.cancelText}>Cancel and return</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* ================== Normal Login Screens ================== */
            <>
              {/* Tab Selector */}
              {step === 'login' && (
                <View style={styles.tabContainer}>
                  <TouchableOpacity
                    style={[styles.tab, authType === 'password' && styles.tabActive]}
                    onPress={() => setAuthType('password')}
                  >
                    <Ionicons
                      name="key-outline"
                      size={15}
                      color={authType === 'password' ? '#ffffff' : '#94a3b8'}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={[styles.tabText, authType === 'password' && styles.tabTextActive]}>Password</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.tab, authType === 'otp' && styles.tabActive]}
                    onPress={() => setAuthType('otp')}
                  >
                    <Ionicons
                      name="call-outline"
                      size={15}
                      color={authType === 'otp' ? '#ffffff' : '#94a3b8'}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={[styles.tabText, authType === 'otp' && styles.tabTextActive]}>Email OTP</Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.formCard}>
                {step === 'login' ? (
                  /* Screen 1: Request Credentials/Email */
                  <View>
                    {authType === 'password' ? (
                      <>
                        <View style={styles.inputContainer}>
                          <Ionicons name="mail-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
                          <TextInput
                            style={styles.input}
                            placeholder="Email Address or Username"
                            placeholderTextColor="#64748b"
                            autoCapitalize="none"
                            autoCorrect={false}
                            value={email}
                            onChangeText={setEmail}
                          />
                        </View>

                        <View style={styles.inputContainer}>
                          <Ionicons name="lock-closed-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
                          <TextInput
                            style={styles.input}
                            placeholder="Password"
                            placeholderTextColor="#64748b"
                            secureTextEntry
                            autoCapitalize="none"
                            autoCorrect={false}
                            value={password}
                            onChangeText={setPassword}
                          />
                        </View>
                      </>
                    ) : (
                      <>
                        <View style={styles.inputContainer}>
                          <Ionicons name="call-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
                          <TextInput
                            style={styles.input}
                            placeholder="Email ID"
                            placeholderTextColor="#64748b"
                            keyboardType="email-address"
                            autoCapitalize="none"
                            autoCorrect={false}
                            value={mobileOrEmail}
                            onChangeText={setMobileOrEmail}
                          />
                        </View>
                        <Text style={styles.mobileHelperText}>
                          Enter your registered work email to receive a 6-digit login code.
                        </Text>
                      </>
                    )}

                    <TouchableOpacity
                      style={styles.loginButton}
                      onPress={authType === 'password' ? handlePasswordLogin : handleSendOtp}
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <ActivityIndicator color="#ffffff" />
                      ) : (
                        <Text style={styles.loginButtonText}>
                          {authType === 'password' ? 'Sign In' : 'Send Verification Code'}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : (
                  /* Screen 2: OTP Verification */
                  <View>
                    <View style={styles.totpHeader}>
                      <Text style={styles.totpTitle}>Verification Code</Text>
                      <Text style={styles.totpSubtitle}>
                        A 6-digit code was sent to {mobileOrEmail || email}
                      </Text>
                    </View>

                    <View style={styles.inputContainer}>
                      <Ionicons name="key-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
                      <TextInput
                        style={[styles.input, styles.totpInput]}
                        placeholder="000000"
                        placeholderTextColor="#64748b"
                        keyboardType="number-pad"
                        maxLength={6}
                        value={otpCode}
                        onChangeText={(text) => setOtpCode(text.replace(/\D/g, ''))}
                      />
                    </View>

                    <TouchableOpacity
                      style={styles.loginButton}
                      onPress={handleVerifyOtp}
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <ActivityIndicator color="#ffffff" />
                      ) : (
                        <Text style={styles.loginButtonText}>Verify & Sign In</Text>
                      )}
                    </TouchableOpacity>

                    <View style={styles.resendContainer}>
                      {countdown > 0 ? (
                        <Text style={styles.resendCooldown}>Resend code in {countdown}s</Text>
                      ) : (
                        <TouchableOpacity onPress={handleSendOtp}>
                          <Text style={styles.resendLink}>Resend Code</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    <TouchableOpacity
                      style={styles.cancelLink}
                      onPress={() => { setStep('login'); setOtpCode(''); }}
                    >
                      <Text style={styles.cancelText}>Change Phone or Email</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Social Logins */}
              {step === 'login' && (
                <View style={styles.socialContainer}>
                  {/* Divider */}
                  <View style={styles.dividerRow}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>or continue with</Text>
                    <View style={styles.dividerLine} />
                  </View>

                  <TouchableOpacity
                    style={[styles.googleButton, (isGoogleLoading || !request) && styles.googleButtonDisabled]}
                    onPress={handleGoogleLogin}
                    disabled={isGoogleLoading || !request}
                    activeOpacity={0.8}
                  >
                    {isGoogleLoading ? (
                      <ActivityIndicator color="#ffffff" size="small" />
                    ) : (
                      <>
                        <View style={styles.googleIconContainer}>
                          <Text style={styles.googleIconText}>G</Text>
                        </View>
                        <Text style={styles.googleButtonText}>Continue with Google</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}

          {/* Face ID / Mobile Biometrics Option */}
          {step === 'login' && isBiometricAvailable && (
            <TouchableOpacity
              style={styles.biometricButton}
              onPress={handleBiometricLogin}
              activeOpacity={0.8}
              disabled={isLoading}
            >
              <View style={styles.biometricIconCircle}>
                <Ionicons
                  name={isFaceId ? 'scan-outline' : 'finger-print-outline'}
                  size={22}
                  color="#8b5cf6"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.biometricTitle}>
                  {isFaceId ? 'Sign In with Face ID' : 'Sign In with Mobile Biometrics'}
                </Text>
                <Text style={styles.biometricSubtitle}>
                  {savedEmail ? `1-tap instant sign in as ${savedEmail}` : 'Fast face or fingerprint authentication'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#64748b" />
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
      <ErrorModal
        visible={errorModal.visible}
        title={errorModal.title}
        message={errorModal.message}
        onClose={() => setErrorModal({ ...errorModal, visible: false })}
      />
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  backgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 15, 29, 0.75)', // Dark overlay for contrast
  },
  safeContainer: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoBadge: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 2,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#111827',
    padding: 4,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: '#1e293b',
  },
  tabText: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '700',
  },
  tabTextActive: {
    color: '#ffffff',
  },
  formCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 16,
    paddingHorizontal: 16,
    height: 56,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: '#ffffff',
    fontSize: 15,
  },
  loginButton: {
    backgroundColor: '#2563eb',
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  loginButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  mobileHelperText: {
    color: '#64748b',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 14,
    marginTop: -4,
    paddingHorizontal: 4,
  },
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#11192e',
    borderWidth: 1,
    borderColor: '#263352',
    borderRadius: 14,
    padding: 14,
    marginTop: 18,
    gap: 12,
  },
  biometricIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  biometricTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  biometricSubtitle: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
  },
  totpHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  totpTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    marginTop: 8,
  },
  totpSubtitle: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },
  totpInput: {
    textAlign: 'center',
    fontSize: 18,
    letterSpacing: 4,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  cancelLink: {
    alignItems: 'center',
    marginTop: 16,
  },
  cancelText: {
    color: '#64748b',
    fontSize: 13,
  },
  resendContainer: {
    alignItems: 'center',
    marginTop: 12,
  },
  resendCooldown: {
    color: '#64748b',
    fontSize: 12,
  },
  resendLink: {
    color: '#3b82f6',
    fontSize: 13,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  socialContainer: {
    marginTop: 16,
  },
  googleButton: {
    flexDirection: 'row',
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#2d3748',
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  googleButtonDisabled: {
    opacity: 0.55,
  },
  googleButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  googleIconContainer: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  googleIconText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#4285F4',
    lineHeight: 15,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#1f2937',
  },
  dividerText: {
    color: '#475569',
    fontSize: 12,
    marginHorizontal: 12,
    fontWeight: '500',
  },
});
