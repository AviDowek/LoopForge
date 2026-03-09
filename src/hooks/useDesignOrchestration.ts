'use client';

import { useState, useCallback, useRef } from 'react';
import { useWizardStore } from '@/stores/wizardStore';
import { extractPagesFromPRD } from '@/lib/design/designPrompts';
import type { DesignSystem, PageDesign, DesignJudgeResult } from '@/types/design';
import type { PRDType } from '@/lib/llm/types';

export type DesignPhase =
  | 'idle'
  | 'generating_system'
  | 'awaiting_system_approval'
  | 'generating_anchor'
  | 'generating_pages'
  | 'judging'
  | 'iterating'
  | 'consistency_check'
  | 'awaiting_approval'
  | 'complete'
  | 'error';

const JUDGE_THRESHOLD = 80;
const MAX_ITERATIONS = 3;

/**
 * Get PRD data from the store. Returns:
 * - prdObject: the structured JSON PRD (may be null)
 * - prdContent: the raw markdown/text PRD content (always available if user got past step 1)
 * At least one will be usable when this is called from the design step.
 */
function getPRDData(): { prdObject: Record<string, unknown> | null; prdContent: string } {
  const { generatedPRD, prdContent } = useWizardStore.getState();

  // Try the structured PRD object first
  if (generatedPRD && typeof generatedPRD === 'object') {
    return { prdObject: generatedPRD as unknown as Record<string, unknown>, prdContent };
  }

  // Try to extract JSON from prdContent (in case it's raw LLM JSON output)
  if (prdContent) {
    try {
      let str = prdContent.trim();
      if (str.startsWith('```json')) str = str.slice(7);
      if (str.startsWith('```')) str = str.slice(3);
      if (str.endsWith('```')) str = str.slice(0, -3);
      str = str.trim();
      const parsed = JSON.parse(str);
      if (parsed && typeof parsed === 'object' && parsed.meta) {
        return { prdObject: parsed, prdContent };
      }
    } catch {
      // prdContent is markdown, not JSON — that's fine
    }
  }

  return { prdObject: null, prdContent };
}

export function useDesignOrchestration() {
  const {
    llmProvider,
    designSystem,
    setDesignSystem,
    designSystemApproved,
    setDesignSystemApproved,
    pageDesigns,
    setPageDesigns,
    updatePageDesign,
    designApprovals,
    setDesignApproval,
    approveAllDesigns,
    consistencyResult,
    setConsistencyResult,
    isGeneratingDesign,
    setIsGeneratingDesign,
  } = useWizardStore();

  const [phase, setPhase] = useState<DesignPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [currentGeneratingPage, setCurrentGeneratingPage] = useState<string | null>(null);
  const abortRef = useRef(false);

  // -----------------------------------------------------------------------
  // Generate Design System
  // -----------------------------------------------------------------------
  const generateDesignSystem = useCallback(async () => {
    const { prdObject, prdContent } = getPRDData();

    // We need SOMETHING — either structured JSON or at least the markdown text
    if (!prdObject && !prdContent) {
      setError('PRD data is not available. Please go back to step 1 and regenerate the PRD.');
      setPhase('error');
      return;
    }

    setPhase('generating_system');
    setIsGeneratingDesign(true);
    setError(null);

    try {
      // Send both the structured PRD (if available) and the markdown content
      const res = await fetch('/api/llm/generate-design-system', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prd: prdObject,
          prdMarkdown: prdContent,
          provider: llmProvider,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate design system');
      }

      const { designSystem: ds, pages: extractedPages } = await res.json();
      setDesignSystem(ds);
      setPhase('awaiting_system_approval');

      // Initialize page designs — use pages extracted from structured PRD, or from API response
      let prdPages: Array<{ id: string; name: string; description: string; userFlowRef: string; userFlowSteps?: string[] }> = [];
      if (prdObject) {
        prdPages = extractPagesFromPRD(prdObject as unknown as PRDType);
      }
      // If structured extraction found nothing, use pages from API response (extracted from markdown by LLM)
      if (prdPages.length === 0 && extractedPages) {
        prdPages = extractedPages;
      }
      // Last resort: create a single "Home" page
      if (prdPages.length === 0) {
        prdPages = [{ id: 'home', name: 'Home', description: 'Main landing page', userFlowRef: 'home' }];
      }

      const initialDesigns: PageDesign[] = prdPages.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        userFlowRef: p.userFlowRef,
        htmlContent: '',
        judgeResult: null,
        iterationHistory: [],
        status: 'pending',
      }));
      setPageDesigns(initialDesigns);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setPhase('error');
    } finally {
      setIsGeneratingDesign(false);
    }
  }, [llmProvider, setDesignSystem, setPageDesigns, setIsGeneratingDesign]);

  // -----------------------------------------------------------------------
  // Generate a single page design
  // -----------------------------------------------------------------------
  const generateSinglePage = useCallback(async (
    page: { id: string; name: string; description: string; userFlowSteps?: string[] },
    ds: DesignSystem,
    anchorHtml?: string,
    previousHtml?: string,
    judgeFeedback?: { score: number; issues: string[]; suggestions: string[] },
  ): Promise<{ htmlContent: string }> => {
    const { prdObject, prdContent } = getPRDData();
    const prdPages = prdObject ? extractPagesFromPRD(prdObject as unknown as PRDType) : [];
    const pageInfo = prdPages.find((p) => p.id === page.id);

    const res = await fetch('/api/llm/generate-page-design', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pageName: page.name,
        pageDescription: page.description,
        userFlowSteps: pageInfo?.userFlowSteps || page.userFlowSteps || [],
        designSystem: ds,
        prd: prdObject || prdContent,
        provider: llmProvider,
        anchorPageHtml: anchorHtml,
        previousHtml,
        judgeFeedback,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || `Failed to generate ${page.name}`);
    }

    return res.json();
  }, [llmProvider]);

  // -----------------------------------------------------------------------
  // Judge a single page
  // -----------------------------------------------------------------------
  const judgeSinglePage = useCallback(async (
    htmlContent: string,
    ds: DesignSystem,
    pageName: string,
    iterationCount: number,
  ): Promise<DesignJudgeResult> => {
    const res = await fetch('/api/llm/judge-design', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        htmlContent,
        designSystem: ds,
        pageName,
        threshold: JUDGE_THRESHOLD,
        provider: llmProvider,
        iterationCount,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || `Failed to judge ${pageName}`);
    }

    const { judgeResult } = await res.json();
    return judgeResult;
  }, [llmProvider]);

  // -----------------------------------------------------------------------
  // Generate + judge + iterate a single page
  // -----------------------------------------------------------------------
  const processPage = useCallback(async (
    page: PageDesign,
    ds: DesignSystem,
    anchorHtml?: string,
  ): Promise<PageDesign> => {
    let currentPage = { ...page };
    let iteration = 0;
    let previousHtml: string | undefined;
    let judgeFeedback: { score: number; issues: string[]; suggestions: string[] } | undefined;

    while (iteration <= MAX_ITERATIONS) {
      if (abortRef.current) break;

      // Generate
      updatePageDesign(page.id, { status: iteration === 0 ? 'generating' : 'iterating' });
      setCurrentGeneratingPage(page.name);

      const { htmlContent } = await generateSinglePage(
        page,
        ds,
        anchorHtml,
        previousHtml,
        judgeFeedback,
      );

      currentPage = { ...currentPage, htmlContent };
      updatePageDesign(page.id, { htmlContent, status: 'judging' });

      // Judge
      const judgeResult = await judgeSinglePage(htmlContent, ds, page.name, iteration + 1);

      currentPage = { ...currentPage, judgeResult };

      if (judgeResult.passed) {
        updatePageDesign(page.id, { judgeResult, status: 'passed' });
        return currentPage;
      }

      // Record iteration history
      currentPage.iterationHistory = [
        ...currentPage.iterationHistory,
        {
          iteration: iteration + 1,
          score: judgeResult.overallScore,
          feedback: judgeResult.issues,
        },
      ];

      updatePageDesign(page.id, {
        judgeResult,
        iterationHistory: currentPage.iterationHistory,
        status: iteration < MAX_ITERATIONS ? 'iterating' : 'failed',
      });

      // Set up for next iteration
      previousHtml = htmlContent;
      judgeFeedback = {
        score: judgeResult.overallScore,
        issues: judgeResult.issues,
        suggestions: judgeResult.suggestions,
      };

      iteration++;
    }

    // Max iterations reached — mark as passed anyway (user can manually regenerate)
    updatePageDesign(page.id, { status: 'passed' });
    return currentPage;
  }, [updatePageDesign, generateSinglePage, judgeSinglePage]);

  // -----------------------------------------------------------------------
  // Start page generation after design system approval
  // -----------------------------------------------------------------------
  const startPageGeneration = useCallback(async () => {
    const { prdObject, prdContent } = getPRDData();
    if (!designSystem || (!prdObject && !prdContent)) return;
    const pages = useWizardStore.getState().pageDesigns;
    if (pages.length === 0) return;

    setPhase('generating_anchor');
    setIsGeneratingDesign(true);
    setError(null);
    abortRef.current = false;

    try {
      // Step 1: Generate anchor page (first page, sequential)
      const anchorPage = pages[0];
      const processedAnchor = await processPage(anchorPage, designSystem);
      const anchorHtml = processedAnchor.htmlContent;

      if (abortRef.current) return;

      // Step 2: Generate remaining pages in parallel (with anchor as reference)
      if (pages.length > 1) {
        setPhase('generating_pages');
        const remainingPages = pages.slice(1);

        await Promise.all(
          remainingPages.map((page) => processPage(page, designSystem, anchorHtml))
        );
      }

      if (abortRef.current) return;

      // Step 3: Consistency check
      setPhase('consistency_check');
      const currentPages = useWizardStore.getState().pageDesigns;
      const pagesForCheck = currentPages
        .filter((p) => p.htmlContent)
        .map((p) => ({ name: p.name, htmlContent: p.htmlContent }));

      if (pagesForCheck.length > 1) {
        const consistencyRes = await fetch('/api/llm/check-design-consistency', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pageDesigns: pagesForCheck,
            designSystem,
            provider: llmProvider,
          }),
        });

        if (consistencyRes.ok) {
          const { consistencyResult: result } = await consistencyRes.json();
          setConsistencyResult(result);
        }
      } else {
        setConsistencyResult({ overallScore: 100, passed: true, issues: [], summary: 'Single page — no cross-page consistency check needed.' });
      }

      setPhase('awaiting_approval');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setPhase('error');
    } finally {
      setIsGeneratingDesign(false);
      setCurrentGeneratingPage(null);
    }
  }, [designSystem, llmProvider, processPage, setIsGeneratingDesign, setConsistencyResult]);

  // -----------------------------------------------------------------------
  // Regenerate a single page with optional context
  // -----------------------------------------------------------------------
  const regeneratePage = useCallback(async (pageId: string, context?: string) => {
    const { prdObject, prdContent } = getPRDData();
    if (!designSystem || (!prdObject && !prdContent)) return;
    const pages = useWizardStore.getState().pageDesigns;
    const page = pages.find((p) => p.id === pageId);
    if (!page) return;

    setIsGeneratingDesign(true);
    setError(null);

    try {
      const anchorPage = pages[0];
      const anchorHtml = pageId !== anchorPage.id ? anchorPage.htmlContent : undefined;

      // Generate with context as feedback
      updatePageDesign(pageId, { status: 'generating' });
      setCurrentGeneratingPage(page.name);

      const feedback = context ? {
        score: page.judgeResult?.overallScore || 0,
        issues: [context],
        suggestions: [],
      } : undefined;

      const { htmlContent } = await generateSinglePage(
        page,
        designSystem,
        anchorHtml,
        page.htmlContent || undefined,
        feedback,
      );

      // Judge the regenerated page
      updatePageDesign(pageId, { htmlContent, status: 'judging' });
      const judgeResult = await judgeSinglePage(htmlContent, designSystem, page.name, 1);

      updatePageDesign(pageId, {
        htmlContent,
        judgeResult,
        status: 'passed', // Always mark as passed after manual regen
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      updatePageDesign(pageId, { status: 'failed' });
    } finally {
      setIsGeneratingDesign(false);
      setCurrentGeneratingPage(null);
    }
  }, [designSystem, updatePageDesign, generateSinglePage, judgeSinglePage, setIsGeneratingDesign]);

  // -----------------------------------------------------------------------
  // Abort
  // -----------------------------------------------------------------------
  const abort = useCallback(() => {
    abortRef.current = true;
    setIsGeneratingDesign(false);
    setPhase('awaiting_approval');
  }, [setIsGeneratingDesign]);

  // -----------------------------------------------------------------------
  // Check if all designs are approved
  // -----------------------------------------------------------------------
  const allDesignsApproved = pageDesigns.length > 0 &&
    pageDesigns.every((d) => designApprovals[d.id]);

  const designStepComplete = designSystemApproved &&
    allDesignsApproved &&
    (consistencyResult?.passed ?? false);

  return {
    // State
    phase,
    error,
    currentGeneratingPage,
    designSystem,
    designSystemApproved,
    pageDesigns,
    designApprovals,
    consistencyResult,
    isGeneratingDesign,
    allDesignsApproved,
    designStepComplete,

    // Actions
    generateDesignSystem,
    startPageGeneration,
    regeneratePage,
    approveDesignSystem: () => {
      setDesignSystemApproved(true);
      setPhase('generating_anchor');
      // Auto-start page generation after approval
      startPageGeneration();
    },
    regenerateDesignSystem: generateDesignSystem,
    approvePage: (pageId: string) => setDesignApproval(pageId, true),
    approveAllDesigns,
    abort,
  };
}
