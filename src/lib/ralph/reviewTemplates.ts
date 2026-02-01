import type { ReviewResult, MissingItem } from '@/types/review';

/**
 * Generate PROMPT_review.md for auto-review mode
 * Uses Plan Mode (-p) WITHOUT --dangerously-skip-permissions (read-only)
 * Follows Ralph Wiggum technique with subagent usage
 */
export function generateReviewPromptMd(projectName: string = 'Project'): string {
  return `# ${projectName} - Comprehensive Review

You are reviewing a completed implementation to determine if ALL requirements have been met.
This is READ-ONLY mode. Do NOT make any changes. Only analyze and report.

## Phase 0a: Study Specifications
Using parallel subagents (up to 500), read and understand:
- All files in \`specs/\` directory
- \`PROJECT_CONTEXT.md\` for project overview
- \`AGENTS.md\` for operational commands

## Phase 0b: Study Implementation Plan
Read \`IMPLEMENTATION_PLAN.md\` to understand:
- What tasks were planned
- What tasks are marked complete
- Any documented blockers or discoveries

## Phase 0c: Study Source Code
Using parallel subagents (up to 500), scan the \`src/\` directory:
- Don't assume something isn't implemented - SEARCH for it
- Map existing code to specification requirements
- Note any deviations from specs

## Phase 1: Gap Analysis
Compare specs vs. implementation:
- What specs are fully implemented?
- What specs are partially implemented?
- What specs are missing?
- Are there bugs or test failures?

## Output Format

You MUST output your findings in this EXACT JSON format wrapped in a code block.
This is critical - the JSON must be valid and parseable:

\`\`\`json
{
  "reviewStatus": "COMPLETE",
  "overallScore": 85,
  "requirements": [
    {
      "id": "REQ-001",
      "description": "User authentication with OAuth",
      "status": "COMPLETE",
      "evidence": "Found in src/auth/oauth.ts",
      "notes": "Fully implemented with Google and GitHub providers"
    },
    {
      "id": "REQ-002",
      "description": "Database integration",
      "status": "PARTIAL",
      "evidence": "Found in src/db/",
      "notes": "Schema exists but migrations not set up"
    }
  ],
  "missingItems": [
    {
      "description": "Database migrations not configured",
      "priority": "HIGH",
      "suggestedFix": "Add migration scripts and setup commands"
    }
  ],
  "setupInstructions": {
    "envVars": ["DATABASE_URL=postgresql://...", "API_KEY=your-key"],
    "installCommands": ["npm install", "prisma generate"],
    "buildCommand": "npm run build",
    "testCommand": "npm test",
    "runCommand": "npm start"
  },
  "testingNotes": "Run npm test to verify all unit tests pass. For E2E, use npm run test:e2e",
  "summary": "Implementation is 85% complete. Main functionality works but database migrations need setup."
}
\`\`\`

## Review Status Values

- **COMPLETE**: All requirements implemented and working (score 90-100)
- **PARTIAL**: Most requirements done, minor items missing (score 60-89)
- **INCOMPLETE**: Significant features missing (score 0-59)

## Requirement Status Values

- **COMPLETE**: Fully implemented, tested, working
- **PARTIAL**: Started but not fully working or tested
- **MISSING**: Not implemented at all

## Priority Values for Missing Items

- **HIGH**: Blocking functionality, must be fixed
- **MEDIUM**: Important but not blocking
- **LOW**: Nice to have, can be deferred

## Review Checklist

For EACH requirement in the PRD/specs:
1. Is it fully implemented?
2. Are there tests for it?
3. Is error handling present?
4. Is the code following project patterns?

Be thorough but fair:
- Mark items COMPLETE only if they fully work
- Mark items PARTIAL if they work but have issues
- Mark items MISSING if not implemented at all

## Guardrails (999+)

999. This is REVIEW mode - do NOT write any code
1000. Do NOT modify any files - read only
1001. Do NOT assume not implemented - use subagents to SEARCH
1002. Include specific file paths as evidence
1003. Be accurate - don't guess, verify by reading code
1004. Output ONLY the JSON report in the format above

## CRITICAL OUTPUT INSTRUCTION

After completing your analysis, you MUST output the JSON review result.
Your FINAL output should be ONLY the JSON code block - nothing else after it.
Do not ask for confirmation. Do not wait for approval.
Just output the \`\`\`json block with your findings.

Example final output:

\`\`\`json
{
  "reviewStatus": "PARTIAL",
  "overallScore": 75,
  "requirements": [...],
  "missingItems": [...],
  "setupInstructions": {...},
  "testingNotes": "...",
  "summary": "..."
}
\`\`\`
`;
}

/**
 * Generate continuation prompt based on review findings
 * Follows the full Ralph Wiggum technique structure with review context
 */
export function generateContinuationPromptMd(reviewResult: ReviewResult, projectName: string = 'Project'): string {
  const highPriority = reviewResult.missingItems.filter(i => i.priority === 'HIGH');
  const mediumPriority = reviewResult.missingItems.filter(i => i.priority === 'MEDIUM');
  const lowPriority = reviewResult.missingItems.filter(i => i.priority === 'LOW');

  const formatItems = (items: MissingItem[], priority: string): string => {
    if (items.length === 0) return '';
    return `
### ${priority} Priority
${items.map((item, i) => `- [ ] ${item.description}${item.suggestedFix ? ` (Suggested: ${item.suggestedFix})` : ''}`).join('\n')}
`;
  };

  return `# ${projectName} - Continuation Build Mode

You are in BUILD mode. Execute ONE task at a time from the review findings below.

---

## Review Context

Previous review status: **${reviewResult.reviewStatus}** (${reviewResult.overallScore}/100)

${reviewResult.summary}

### Items to Address
${formatItems(highPriority, 'HIGH')}
${formatItems(mediumPriority, 'MEDIUM')}
${formatItems(lowPriority, 'LOW')}

---

## Phase 0a: Orient with Specifications
Using parallel subagents (up to 500), study \`specs/\` and \`PROJECT_CONTEXT.md\` to understand requirements.
- Read the spec file relevant to your current task
- Note acceptance criteria
- Understand edge cases

## Phase 0b: Orient with Implementation Plan
Read \`IMPLEMENTATION_PLAN.md\`:
- Review the "Review Findings" section at the bottom
- Find the first unchecked task from the review findings
- This is your ONLY task for this iteration

## Phase 0c: Orient with Source Code
Using parallel subagents (up to 500), study existing code:
- Don't assume - SEARCH the codebase
- Understand existing patterns
- Find related code to modify

## Phase 1: Select Task
From the review findings above, select the single highest-priority unchecked item.
- ONE task only
- Note the files involved
- Note the suggested fix if provided

## Phase 2: Implement
Implement the fix:
- Create/modify ONLY the files needed
- Follow existing patterns in the codebase
- Use 1 subagent for implementation (sequential)

## Phase 3: Validate
Run validation commands from AGENTS.md:
\`\`\`bash
npm run build
npm test
npm run lint
\`\`\`
- ALL must pass before proceeding
- Fix any errors before continuing

## Phase 4: Commit & Update Plan
If validation passes:
1. Mark task complete in IMPLEMENTATION_PLAN.md: \`- [ ]\` → \`- [x]\`
2. Commit with descriptive message capturing the WHY
3. Document any discoveries or issues in the plan

---

## Guardrails (999+)

999. ONE task per iteration - no more
1000. Don't assume not implemented - use subagents to SEARCH first
1001. EXACT files only - don't create extra files
1002. ALL validation must pass before marking complete
1003. Capture the WHY in commit messages
1004. Update IMPLEMENTATION_PLAN.md every iteration
1005. If stuck, document the blocker and move to next task
1006. Quality over speed - each fix should be production-ready
`;
}

/**
 * Generate section to append to IMPLEMENTATION_PLAN.md after review
 */
export function generateReviewFindingsSection(reviewResult: ReviewResult): string {
  const date = new Date().toISOString().split('T')[0];

  const formatMissingItems = (): string => {
    return reviewResult.missingItems
      .sort((a, b) => {
        const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      })
      .map(item => `- [ ] [${item.priority}] ${item.description}${item.suggestedFix ? ` - ${item.suggestedFix}` : ''}`)
      .join('\n');
  };

  return `

---

## Review Findings (${date})

**Review Status**: ${reviewResult.reviewStatus} (${reviewResult.overallScore}/100)
**Summary**: ${reviewResult.summary}

### Items to Address

${formatMissingItems() || '- No items to address'}

### Requirements Status

${reviewResult.requirements.map(req =>
  `- [${req.status === 'COMPLETE' ? 'x' : ' '}] ${req.description} (${req.status})${req.notes ? ` - ${req.notes}` : ''}`
).join('\n')}
`;
}
