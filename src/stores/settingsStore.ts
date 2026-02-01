import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LLMProvider } from '@/types';

interface SettingsStore {
  // LLM Configuration
  llmProvider: LLMProvider;
  setLLMProvider: (provider: LLMProvider) => void;

  // API Keys (stored encrypted in localStorage)
  openaiApiKey: string | null;
  setOpenaiApiKey: (key: string | null) => void;
  anthropicApiKey: string | null;
  setAnthropicApiKey: (key: string | null) => void;

  // Key validation status
  openaiKeyValid: boolean | null;
  setOpenaiKeyValid: (valid: boolean | null) => void;
  anthropicKeyValid: boolean | null;
  setAnthropicKeyValid: (valid: boolean | null) => void;

  // Projects base path
  projectsBasePath: string;
  setProjectsBasePath: (path: string) => void;

  // Helpers
  hasValidKey: (provider: LLMProvider) => boolean;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      llmProvider: 'claude',
      setLLMProvider: (provider) => set({ llmProvider: provider }),

      openaiApiKey: null,
      setOpenaiApiKey: (key) => set({ openaiApiKey: key, openaiKeyValid: null }),
      anthropicApiKey: null,
      setAnthropicApiKey: (key) => set({ anthropicApiKey: key, anthropicKeyValid: null }),

      openaiKeyValid: null,
      setOpenaiKeyValid: (valid) => set({ openaiKeyValid: valid }),
      anthropicKeyValid: null,
      setAnthropicKeyValid: (valid) => set({ anthropicKeyValid: valid }),

      projectsBasePath: '~/ralph-projects',
      setProjectsBasePath: (path) => set({ projectsBasePath: path }),

      hasValidKey: (provider) => {
        const state = get();
        if (provider === 'openai') {
          return !!state.openaiApiKey && state.openaiKeyValid !== false;
        }
        return !!state.anthropicApiKey && state.anthropicKeyValid !== false;
      },
    }),
    {
      name: 'loopforge-settings',
      partialize: (state) => ({
        llmProvider: state.llmProvider,
        openaiApiKey: state.openaiApiKey,
        anthropicApiKey: state.anthropicApiKey,
        projectsBasePath: state.projectsBasePath,
      }),
    }
  )
);
