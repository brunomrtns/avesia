import { create } from 'zustand';

import type { PendingTermsVersion, User } from '@avesia/types';

import { api, SSO_LOGIN_URL } from '@/lib/api-client';

interface AuthState {
  readonly user: User | null;
  readonly orgSlug: string | null;
  readonly orgName: string | null;
  readonly isLoading: boolean;
  readonly isAuthenticated: boolean;
  readonly pendingTerms: readonly PendingTermsVersion[];
  readonly mustChangePassword: boolean;

  // Actions
  init: () => Promise<void>;
  logout: () => void;
  updateOrgSlug: (slug: string, name?: string) => void;
  clearPendingTerms: () => void;
  clearMustChangePassword: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  orgSlug: null,
  orgName: null,
  isLoading: true,
  isAuthenticated: false,
  pendingTerms: [],
  mustChangePassword: false,

  init: async () => {
    try {
      const meRes = await api.auth.me();
      set({
        user: meRes.user,
        orgSlug: meRes.organization?.slug ?? null,
        orgName: meRes.organization?.name ?? null,
        isAuthenticated: meRes.user !== null,
        isLoading: false,
      });
    } catch {
      set({
        user: null,
        orgSlug: null,
        orgName: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

  logout: () => {
    // Call the API logout endpoint (best-effort), then redirect to BI Identity login
    void api.auth.logout().catch(() => {
      // Ignore errors — proceed with local state clear + redirect
    });
    set({
      user: null,
      orgSlug: null,
      orgName: null,
      isAuthenticated: false,
      pendingTerms: [],
      mustChangePassword: false,
    });
    window.location.href = SSO_LOGIN_URL;
  },

  updateOrgSlug: (slug, name) => {
    set((state) => ({ orgSlug: slug, orgName: name !== undefined ? name : state.orgName }));
  },

  clearPendingTerms: () => set({ pendingTerms: [] }),
  clearMustChangePassword: () => set({ mustChangePassword: false }),
}));
