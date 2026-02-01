import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ProjectStore {
  // Current project context
  currentProjectId: string | null;
  setCurrentProject: (id: string | null) => void;

  // UI state
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // Loop monitor state
  outputMode: 'raw' | 'parsed';
  setOutputMode: (mode: 'raw' | 'parsed') => void;
  autoScroll: boolean;
  toggleAutoScroll: () => void;
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set) => ({
      // Current project
      currentProjectId: null,
      setCurrentProject: (id) => set({ currentProjectId: id }),

      // UI state
      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      // Loop monitor
      outputMode: 'parsed',
      setOutputMode: (mode) => set({ outputMode: mode }),
      autoScroll: true,
      toggleAutoScroll: () => set((state) => ({ autoScroll: !state.autoScroll })),
    }),
    {
      name: 'loopforge-project-store',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        outputMode: state.outputMode,
        autoScroll: state.autoScroll,
      }),
    }
  )
);
