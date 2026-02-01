/**
 * E2E Visual Testing Module
 *
 * Exports E2E test runner and utilities
 */

export { E2ETestRunner } from './E2ETestRunner';
export { generateVisualAnalysisPrompt, generateBatchAnalysisPrompt } from './visualAnalysisPrompt';
export {
  generateE2EFixPromptMd,
  generateE2EFindingsSection,
  generateDefaultE2EConfig,
} from './e2eTemplates';
