import { create } from 'zustand';

interface UIState {
  // Sidebar
  sidebarOpen: boolean;
  collapsed: boolean;

  // Command palette
  commandOpen: boolean;

  // Actions
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setCollapsed: (collapsed: boolean) => void;
  toggleCollapsed: () => void;
  setCommandOpen: (open: boolean) => void;
  toggleCommandOpen: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: false,
  collapsed: false,
  commandOpen: false,

  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setCollapsed: (collapsed) => set({ collapsed }),
  toggleCollapsed: () => set((state) => ({ collapsed: !state.collapsed })),
  setCommandOpen: (open) => set({ commandOpen: open }),
  toggleCommandOpen: () => set((state) => ({ commandOpen: !state.commandOpen })),
}));
