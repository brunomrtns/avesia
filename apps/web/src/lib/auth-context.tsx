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
  readonly orgSlug: string | null;
  readonly orgName: string | null;
  readonly isLoading: boolean;
  readonly isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  readonly login: (email: string, password: string) => Promise<void>;
  readonly logout: () => void;
  readonly updateOrgSlug: (slug: string, name?: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { readonly children: ReactNode }): ReactNode {
  const [user, setUser] = useState<User | null>(null);
  const [orgSlug, setOrgSlug] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
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
          setOrgSlug(meRes.organization?.slug ?? null);
          setOrgName(meRes.organization?.name ?? null);
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
    setOrgSlug(res.organization?.slug ?? null);
    setOrgName(res.organization?.name ?? null);
  }, []);

  const logout = useCallback((): void => {
    setAccessToken(null);
    setRefreshToken(null);
    setUser(null);
    setOrgSlug(null);
    setOrgName(null);
  }, []);

  const updateOrgSlug = useCallback((slug: string, name?: string): void => {
    setOrgSlug(slug);
    if (name !== undefined) setOrgName(name);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      orgSlug,
      orgName,
      isLoading,
      isAuthenticated: user !== null,
      login,
      logout,
      updateOrgSlug,
    }),
    [user, orgSlug, orgName, isLoading, login, logout, updateOrgSlug],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export { AuthContext };
