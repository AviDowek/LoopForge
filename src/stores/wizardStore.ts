import { create } from 'zustand';
import type { LLMProvider, PRD, GeneratedFile } from '@/types';
import type { DesignSystem, PageDesign, ConsistencyCheckResult } from '@/types/design';

interface WizardStore {
  // Current step (0-5)
  currentStep: number;
  setStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;

  // Step 0: Basic info
  projectName: string;
  setProjectName: (name: string) => void;
  projectDescription: string;
  setProjectDescription: (desc: string) => void;
  shortPrompt: string;
  setShortPrompt: (prompt: string) => void;
  llmProvider: LLMProvider;
  setLLMProvider: (provider: LLMProvider) => void;

  // Step 1: PRD generation
  generatedPRD: PRD | null;
  setGeneratedPRD: (prd: PRD | null) => void;
  prdContent: string;
  setPRDContent: (content: string) => void;
  prdApproved: boolean;
  setPRDApproved: (approved: boolean) => void;
  isGenerating: boolean;
  setIsGenerating: (generating: boolean) => void;

  // Step 2: Design generation
  designSystem: DesignSystem | null;
  setDesignSystem: (ds: DesignSystem | null) => void;
  designSystemApproved: boolean;
  setDesignSystemApproved: (approved: boolean) => void;
  pageDesigns: PageDesign[];
  setPageDesigns: (designs: PageDesign[]) => void;
  updatePageDesign: (pageId: string, updates: Partial<PageDesign>) => void;
  designApprovals: Record<string, boolean>;
  setDesignApproval: (pageId: string, approved: boolean) => void;
  approveAllDesigns: () => void;
  consistencyResult: ConsistencyCheckResult | null;
  setConsistencyResult: (result: ConsistencyCheckResult | null) => void;
  isGeneratingDesign: boolean;
  setIsGeneratingDesign: (generating: boolean) => void;

  // Step 3-4: File generation
  generatedFiles: GeneratedFile[];
  setGeneratedFiles: (files: GeneratedFile[]) => void;
  updateFile: (path: string, content: string) => void;
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
  generatedPRD: null as PRD | null,
  prdContent: '',
  prdApproved: false,
  isGenerating: false,
  // Design state
  designSystem: null as DesignSystem | null,
  designSystemApproved: false,
  pageDesigns: [] as PageDesign[],
  designApprovals: {} as Record<string, boolean>,
  consistencyResult: null as ConsistencyCheckResult | null,
  isGeneratingDesign: false,
  // File state
  generatedFiles: [] as GeneratedFile[],
  fileApprovals: {} as Record<string, boolean>,
  createdProjectId: null as string | null,
};

export const useWizardStore = create<WizardStore>((set) => ({
  ...initialState,

  setStep: (step) => set({ currentStep: step }),
  nextStep: () => set((state) => ({ currentStep: Math.min(state.currentStep + 1, 5) })),
  prevStep: () => set((state) => ({ currentStep: Math.max(state.currentStep - 1, 0) })),

  setProjectName: (name) => set({ projectName: name }),
  setProjectDescription: (desc) => set({ projectDescription: desc }),
  setShortPrompt: (prompt) => set({ shortPrompt: prompt }),
  setLLMProvider: (provider) => set({ llmProvider: provider }),

  setGeneratedPRD: (prd) => set({ generatedPRD: prd }),
  setPRDContent: (content) => set({ prdContent: content }),
  setPRDApproved: (approved) => set({ prdApproved: approved }),
  setIsGenerating: (generating) => set({ isGenerating: generating }),

  // Design actions
  setDesignSystem: (ds) => set({ designSystem: ds }),
  setDesignSystemApproved: (approved) => set({ designSystemApproved: approved }),
  setPageDesigns: (designs) => {
    const approvals: Record<string, boolean> = {};
    designs.forEach((d) => {
      approvals[d.id] = d.status === 'approved';
    });
    set({ pageDesigns: designs, designApprovals: approvals });
  },
  updatePageDesign: (pageId, updates) =>
    set((state) => ({
      pageDesigns: state.pageDesigns.map((d) =>
        d.id === pageId ? { ...d, ...updates } : d
      ),
      // Reset approval if content changed
      designApprovals: updates.htmlContent
        ? { ...state.designApprovals, [pageId]: false }
        : state.designApprovals,
    })),
  setDesignApproval: (pageId, approved) =>
    set((state) => ({
      designApprovals: { ...state.designApprovals, [pageId]: approved },
    })),
  approveAllDesigns: () =>
    set((state) => {
      const approvals: Record<string, boolean> = {};
      state.pageDesigns.forEach((d) => {
        approvals[d.id] = true;
      });
      return { designApprovals: approvals };
    }),
  setConsistencyResult: (result) => set({ consistencyResult: result }),
  setIsGeneratingDesign: (generating) => set({ isGeneratingDesign: generating }),

  // File actions
  setGeneratedFiles: (files) => {
    const approvals: Record<string, boolean> = {};
    files.forEach((f) => {
      approvals[f.path] = false;
    });
    set({ generatedFiles: files, fileApprovals: approvals });
  },
  updateFile: (path, content) =>
    set((state) => ({
      generatedFiles: state.generatedFiles.map((f) =>
        f.path === path ? { ...f, content } : f
      ),
      fileApprovals: { ...state.fileApprovals, [path]: false },
    })),
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
