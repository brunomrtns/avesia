import { create } from 'zustand';

import type { PendingTermsVersion, User } from '@avesia/types';

import {
  api,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from '@/lib/api-client';

interface AuthState {
  readonly user: User | null;
  readonly orgSlug: string | null;
  readonly orgName: string | null;
  readonly isLoading: boolean;
  readonly isAuthenticated: boolean;
  readonly pendingTerms: readonly PendingTermsVersion[];

  // Actions
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  updateOrgSlug: (slug: string, name?: string) => void;
  clearPendingTerms: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  orgSlug: null,
  orgName: null,
  isLoading: true,
  isAuthenticated: false,
  pendingTerms: [],

  init: async () => {
    const token = getRefreshToken();
    if (!token) {
      set({ isLoading: false });
      return;
    }

    try {
      const refreshRes = await api.auth.refresh();
      setAccessToken(refreshRes.tokens.accessToken);
      setRefreshToken(refreshRes.tokens.refreshToken);
      const meRes = await api.auth.me();
      set({
        user: meRes.user,
        orgSlug: meRes.organization?.slug ?? null,
        orgName: meRes.organization?.name ?? null,
        isAuthenticated: meRes.user !== null,
        isLoading: false,
      });
    } catch {
      setAccessToken(null);
      setRefreshToken(null);
      set({ user: null, orgSlug: null, orgName: null, isAuthenticated: false, isLoading: false });
    }
  },

  login: async (email, password) => {
    const res = await api.auth.login({ email: email as never, password });
    setAccessToken(res.tokens.accessToken);
    setRefreshToken(res.tokens.refreshToken);
    set({
      user: res.user,
      orgSlug: res.organization?.slug ?? null,
      orgName: res.organization?.name ?? null,
      isAuthenticated: res.user !== null,
      pendingTerms: res.pendingTerms ?? [],
    });
  },

  logout: () => {
    setAccessToken(null);
    setRefreshToken(null);
    set({
      user: null,
      orgSlug: null,
      orgName: null,
      isAuthenticated: false,
      pendingTerms: [],
    });
  },

  updateOrgSlug: (slug, name) => {
    set((state) => ({ orgSlug: slug, orgName: name !== undefined ? name : state.orgName }));
  },

  clearPendingTerms: () => set({ pendingTerms: [] }),
}));
