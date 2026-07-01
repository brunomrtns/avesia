import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { User } from '@avesia/types';

import {
  api,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from './api-client';

interface AuthState {
  readonly user: User | null;
  readonly isLoading: boolean;
  readonly isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  readonly login: (email: string, password: string) => Promise<void>;
  readonly logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { readonly children: ReactNode }): ReactNode {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = getRefreshToken();
    if (!token) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const refreshRes = await api.auth.refresh();
        setAccessToken(refreshRes.tokens.accessToken);
        setRefreshToken(refreshRes.tokens.refreshToken);
        const meRes = await api.auth.me();
        if (!cancelled) {
          setUser(meRes.user);
        }
      } catch {
        setAccessToken(null);
        setRefreshToken(null);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    const res = await api.auth.login({ email: email as never, password });
    setAccessToken(res.tokens.accessToken);
    setRefreshToken(res.tokens.refreshToken);
    setUser(res.user);
  }, []);

  const logout = useCallback((): void => {
    setAccessToken(null);
    setRefreshToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: user !== null,
      login,
      logout,
    }),
    [user, isLoading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export { AuthContext };
