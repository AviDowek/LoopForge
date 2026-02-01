import { create } from 'zustand';
import type { LLMProvider, PRD, GeneratedFile } from '@/types';

interface WizardStore {
  // Current step (0-4)
  currentStep: number;
  setStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;

  // Step 1: Basic info
  projectName: string;
  setProjectName: (name: string) => void;
  projectDescription: string;
  setProjectDescription: (desc: string) => void;
  shortPrompt: string;
  setShortPrompt: (prompt: string) => void;
  llmProvider: LLMProvider;
  setLLMProvider: (provider: LLMProvider) => void;

  // Step 2: PRD generation
  generatedPRD: PRD | null;
  setGeneratedPRD: (prd: PRD | null) => void;
  prdContent: string;
  setPRDContent: (content: string) => void;
  prdApproved: boolean;
  setPRDApproved: (approved: boolean) => void;
  isGenerating: boolean;
  setIsGenerating: (generating: boolean) => void;

  // Step 3-4: File generation
  generatedFiles: GeneratedFile[];
  setGeneratedFiles: (files: GeneratedFile[]) => void;
  fileApprovals: Record<string, boolean>;
  setFileApproval: (path: string, approved: boolean) => void;
  approveAllFiles: () => void;

  // Created project ID
  createdProjectId: string | null;
  setCreatedProjectId: (id: string | null) => void;

  // Reset
  resetWizard: () => void;
}

const initialState = {
  currentStep: 0,
  projectName: '',
  projectDescription: '',
  shortPrompt: '',
  llmProvider: 'claude' as LLMProvider,
  generatedPRD: null,
  prdContent: '',
  prdApproved: false,
  isGenerating: false,
  generatedFiles: [],
  fileApprovals: {},
  createdProjectId: null,
};

export const useWizardStore = create<WizardStore>((set, get) => ({
  ...initialState,

  setStep: (step) => set({ currentStep: step }),
  nextStep: () => set((state) => ({ currentStep: Math.min(state.currentStep + 1, 4) })),
  prevStep: () => set((state) => ({ currentStep: Math.max(state.currentStep - 1, 0) })),

  setProjectName: (name) => set({ projectName: name }),
  setProjectDescription: (desc) => set({ projectDescription: desc }),
  setShortPrompt: (prompt) => set({ shortPrompt: prompt }),
  setLLMProvider: (provider) => set({ llmProvider: provider }),

  setGeneratedPRD: (prd) => set({ generatedPRD: prd }),
  setPRDContent: (content) => set({ prdContent: content }),
  setPRDApproved: (approved) => set({ prdApproved: approved }),
  setIsGenerating: (generating) => set({ isGenerating: generating }),

  setGeneratedFiles: (files) => {
    const approvals: Record<string, boolean> = {};
    files.forEach((f) => {
      approvals[f.path] = false;
    });
    set({ generatedFiles: files, fileApprovals: approvals });
  },
  setFileApproval: (path, approved) =>
    set((state) => ({
      fileApprovals: { ...state.fileApprovals, [path]: approved },
    })),
  approveAllFiles: () =>
    set((state) => {
      const approvals: Record<string, boolean> = {};
      state.generatedFiles.forEach((f) => {
        approvals[f.path] = true;
      });
      return { fileApprovals: approvals };
    }),

  setCreatedProjectId: (id) => set({ createdProjectId: id }),

  resetWizard: () => set(initialState),
}));
