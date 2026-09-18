import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AuthService } from '../services/auth';
import { setAuthFailureCallback, setTokenRefreshedCallback } from '../services/api';

interface AuthContextType {
  accessToken: string | null;
  isLoading: boolean;
  signIn: (access: string, refresh: string, email: string) => Promise<void>;
  signOut: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const signOut = useCallback(async () => {
    try {
      await AuthService.clearTokens();
    } catch (e) {
      console.error('Failed to clear tokens on signout:', e);
    }
    setAccessToken(null);
  }, []);

  const checkAuth = async () => {
    try {
      const token = await AuthService.getAccessToken();
      setAccessToken(token);
    } catch (e) {
      console.error('Failed to load access token:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setAuthFailureCallback(() => {
      signOut();
    });
    setTokenRefreshedCallback((newToken: string) => {
      setAccessToken(newToken);
    });
    checkAuth();
  }, [signOut]);

  const signIn = async (access: string, refresh: string, email: string) => {
    await AuthService.saveTokens(access, refresh);
    await AuthService.enableBiometrics(email, refresh);
    setAccessToken(access);
  };

  return (
    <AuthContext.Provider value={{ accessToken, isLoading, signIn, signOut, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
