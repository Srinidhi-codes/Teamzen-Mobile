import { Platform } from 'react-native';
import { AuthService } from './auth';

const RENDER_BACKEND_URL = 'https://api.teamzen.online';

const getBaseUrl = (): string => {
  return RENDER_BACKEND_URL;
};

export const API_URL = getBaseUrl();
export const GRAPHQL_URL = `${API_URL}/graphql/`;
export const REFRESH_URL = `${API_URL}/api/auth/refresh/`;

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: string[];
  }>;
}

let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];
let authFailureCallback: (() => void) | null = null;
let tokenRefreshedCallback: ((token: string) => void) | null = null;

export function setAuthFailureCallback(callback: () => void) {
  authFailureCallback = callback;
}

export function setTokenRefreshedCallback(callback: (token: string) => void) {
  tokenRefreshedCallback = callback;
}

function notifyAuthFailure() {
  if (authFailureCallback) {
    authFailureCallback();
  }
}

function subscribeTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

function onRefreshed(token: string) {
  if (tokenRefreshedCallback) {
    try {
      tokenRefreshedCallback(token);
    } catch (e) {
      console.error('Error in tokenRefreshedCallback:', e);
    }
  }
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

/**
 * Handle refreshing JWT tokens
 */
export async function refreshAccessToken(): Promise<string | null> {
  if (isRefreshing) {
    return new Promise((resolve) => {
      subscribeTokenRefresh((token) => {
        resolve(token);
      });
    });
  }

  isRefreshing = true;

  try {
    const refreshToken = await AuthService.getRefreshToken();
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await fetch(REFRESH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh: refreshToken }),
    });

    if (!response.ok) {
      throw new Error('Failed to refresh token');
    }

    const data = await response.json();
    const newAccess = data.access;
    const newRefresh = data.refresh || refreshToken;

    await AuthService.saveTokens(newAccess, newRefresh);
    onRefreshed(newAccess);
    return newAccess;
  } catch (error) {
    console.error('Token refresh error:', error);
    await AuthService.clearTokens();
    return null;
  } finally {
    isRefreshing = false;
  }
}

/**
 * Perform a GraphQL Request
 */
export async function graphqlRequest<T>(
  query: string,
  variables: Record<string, any> = {},
  retryWithRefresh = true
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const accessToken = await AuthService.getAccessToken();
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  try {
    const response = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    });

    // Check if unauthorized or token expired
    if (response.status === 401) {
      if (retryWithRefresh) {
        const newAccessToken = await refreshAccessToken();
        if (newAccessToken) {
          return graphqlRequest<T>(query, variables, false);
        }
      }
      notifyAuthFailure();
      throw new Error('Session expired. Please log in again.');
    }

    const rawText = await response.text();
    let json: GraphQLResponse<T>;
    try {
      json = JSON.parse(rawText) as GraphQLResponse<T>;
    } catch {
      console.error(`GraphQL endpoint returned non-JSON (${response.status}):`, rawText.slice(0, 300));
      throw new Error(`Server returned unexpected response (${response.status}). Please ensure backend is running.`);
    }

    if (json.errors && json.errors.length > 0) {
      const isAuthError = json.errors.some(
        (err) =>
          err.message.toLowerCase().includes('signature has expired') ||
          err.message.toLowerCase().includes('not authenticated') ||
          err.message.toLowerCase().includes('unauthorized') ||
          err.message.toLowerCase().includes('permission denied') ||
          err.message.toLowerCase().includes('token')
      );

      if (isAuthError) {
        if (retryWithRefresh) {
          const newAccessToken = await refreshAccessToken();
          if (newAccessToken) {
            return graphqlRequest<T>(query, variables, false);
          }
        }
        notifyAuthFailure();
        throw new Error('Session expired. Please log in again.');
      }
      throw new Error(json.errors[0].message);
    }

    if (!json.data) {
      throw new Error('Empty GraphQL response data');
    }

    return json.data;
  } catch (error) {
    console.error('GraphQL request error:', error);
    throw error;
  }
}

/**
 * REST API client request wrapper
 */
export async function restRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  retryWithRefresh = true
): Promise<T> {
  const url = `${API_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  const accessToken = await AuthService.getAccessToken();
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 401 && retryWithRefresh) {
      const newAccessToken = await refreshAccessToken();
      if (newAccessToken) {
        return restRequest<T>(endpoint, options, false);
      } else {
        throw new Error('Session expired. Please log in again.');
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = 'Network response was not ok';
      try {
        const parsed = JSON.parse(errorText);
        errorMessage = parsed.detail || parsed.error || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    return (await response.json()) as T;
  } catch (error) {
    console.error(`REST request error on ${endpoint}:`, error);
    throw error;
  }
}

/**
 * Get current valid access token from SecureStore, refreshing if necessary
 */
export async function getValidAccessToken(): Promise<string | null> {
  let token = await AuthService.getAccessToken();
  if (!token) {
    token = await refreshAccessToken();
  }
  return token;
}

/**
 * Authenticated fetch helper that injects Bearer token and retries on 401 with refreshed token
 */
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {},
  retryWithRefresh = true
): Promise<Response> {
  let accessToken = await AuthService.getAccessToken();
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  let response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401 && retryWithRefresh) {
    const newAccessToken = await refreshAccessToken();
    if (newAccessToken) {
      headers['Authorization'] = `Bearer ${newAccessToken}`;
      response = await fetch(url, {
        ...options,
        headers,
      });
    } else {
      notifyAuthFailure();
    }
  }

  return response;
}

export const getAbsoluteUrl = (url?: string | null): string | null => {
  if (!url) return null;
  if (
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('data:') ||
    url.startsWith('file:') ||
    url.startsWith('blob:')
  ) {
    return url;
  }
  return `${API_URL}${url.startsWith('/') ? '' : '/'}${url}`;
};
