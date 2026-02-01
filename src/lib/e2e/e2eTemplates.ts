/**
 * E2E Fix Prompt Templates
 *
 * Generates PROMPT_e2e_fix.md and continuation docs based on E2E test findings
 */

import type { E2ETestResult, VisualFinding } from '@/types/e2e';

/**
 * Generate PROMPT_e2e_fix.md for fixing E2E test failures
 * Follows Ralph Wiggum technique structure
 */
export function generateE2EFixPromptMd(
  e2eResult: E2ETestResult,
  projectName: string = 'Project'
): string {
  const highPriority = e2eResult.findings.filter((f) => f.priority === 'HIGH');
  const mediumPriority = e2eResult.findings.filter((f) => f.priority === 'MEDIUM');
  const lowPriority = e2eResult.findings.filter((f) => f.priority === 'LOW');

  const formatFindings = (findings: VisualFinding[], priority: string): string => {
    if (findings.length === 0) return '';
    return `
### ${priority} Priority
${findings
  .map(
    (f) =>
      `- [ ] [${f.type.toUpperCase()}] ${f.description}${f.location ? ` (Location: ${f.location})` : ''}${f.suggestedFix ? `\n  - Suggested fix: ${f.suggestedFix}` : ''}`
  )
  .join('\n')}
`;
  };

  const interactionErrors = e2eResult.interactions.filter((i) => i.status === 'error');
  const formatInteractionErrors = (): string => {
    if (interactionErrors.length === 0) return '';
    return `
### Interaction Errors
${interactionErrors
  .map((e) => `- [ ] ${e.action} on "${e.target}" failed: ${e.error}`)
  .join('\n')}
`;
  };

  return `# ${projectName} - E2E Test Fix Mode

You are in BUILD mode. Fix visual and functional issues found during E2E testing.
Execute ONE fix at a time, then validate.

---

## E2E Test Results

**Test Status:** ${e2eResult.testStatus} (Visual Score: ${e2eResult.visualScore}/100)
**Summary:** ${e2eResult.summary}

### Visual Findings
${formatFindings(highPriority, 'HIGH')}
${formatFindings(mediumPriority, 'MEDIUM')}
${formatFindings(lowPriority, 'LOW')}
${formatInteractionErrors()}

---

## Phase 0a: Study the E2E Results
Review the findings above carefully:
- Understand each issue's type (layout, content, style, accessibility, functionality)
- Note the specific locations mentioned
- Consider the suggested fixes provided

## Phase 0b: Study Existing Implementation
Using parallel subagents (up to 500), examine relevant code:
- Find the components/files related to each issue
- Understand the current implementation
- Identify what needs to change

## Phase 0c: Study Screenshots
If screenshots are available in \`.e2e-screenshots/\`:
- Review the visual evidence of issues
- Understand the context of each problem
- Map issues to specific UI elements

## Phase 1: Select ONE Fix
From the findings above, select the highest-priority unchecked item:
- HIGH priority fixes come first
- Address layout/functionality issues before style issues
- ONE fix per iteration

## Phase 2: Implement the Fix
Make the minimal change needed:
- Edit only the necessary files
- Follow existing code patterns
- Consider responsive design if fixing layout issues
- Ensure accessibility when fixing UI

## Phase 3: Validate
Run validation commands:
\`\`\`bash
npm run build
npm test
npm run lint
\`\`\`
- ALL must pass before proceeding
- Fix any errors that arise

## Phase 4: Mark Complete & Commit
If validation passes:
1. Mark the fix complete in IMPLEMENTATION_PLAN.md
2. Commit with message explaining what was fixed and WHY
3. Document any related issues discovered

---

## Guardrails (999+)

999. ONE fix per iteration - do not batch multiple fixes
1000. Don't assume - use subagents to SEARCH the codebase first
1001. Fix the root cause, not just symptoms
1002. Test responsive behavior for layout fixes
1003. Consider accessibility in all UI changes
1004. ALL validation must pass before marking complete
1005. Capture the WHY in commit messages
1006. Update IMPLEMENTATION_PLAN.md every iteration
`;
}

/**
 * Generate section to append to IMPLEMENTATION_PLAN.md after E2E tests
 */
export function generateE2EFindingsSection(e2eResult: E2ETestResult): string {
  const date = new Date().toISOString().split('T')[0];

  const formatFindings = (): string => {
    return e2eResult.findings
      .sort((a, b) => {
        const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      })
      .map(
        (f) =>
          `- [ ] [${f.priority}] [${f.type}] ${f.description}${f.suggestedFix ? ` - ${f.suggestedFix}` : ''}`
      )
      .join('\n');
  };

  const formatInteractions = (): string => {
    const errors = e2eResult.interactions.filter((i) => i.status === 'error');
    if (errors.length === 0) return 'All interactions successful';
    return errors.map((e) => `- [ ] ${e.action} failed: ${e.error}`).join('\n');
  };

  return `

---

## E2E Test Findings (${date})

**Test Status:** ${e2eResult.testStatus} (Visual Score: ${e2eResult.visualScore}/100)
**Duration:** ${Math.round(e2eResult.testDurationMs / 1000)}s
**Browser:** ${e2eResult.browserUsed}
**Screenshots:** ${e2eResult.screenshots.length} captured

### Summary
${e2eResult.summary}

### Visual Issues to Fix

${formatFindings() || '- No visual issues found'}

### Interaction Results

${formatInteractions()}

### Screenshot References
${e2eResult.screenshots.map((s) => `- ${s.id}: ${s.description} (${s.viewport.width}x${s.viewport.height})`).join('\n')}
`;
}

/**
 * Generate default E2E test config based on project structure
 */
export function generateDefaultE2EConfig(projectPath: string, sessionId: string): {
  devServerCommand: string;
  devServerPort: number;
  baseUrl: string;
  viewports: Array<{ name: string; width: number; height: number }>;
} {
  return {
    devServerCommand: 'npm run dev',
    devServerPort: 3000,
    baseUrl: 'http://localhost:3000',
    viewports: [
      { name: 'Desktop', width: 1920, height: 1080 },
      { name: 'Tablet', width: 768, height: 1024 },
      { name: 'Mobile', width: 375, height: 812 },
    ],
  };
}
