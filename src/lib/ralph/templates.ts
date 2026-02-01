import type { PRDType } from '../llm/types';

/**
 * Generate PROMPT_plan.md for planning/gap analysis mode
 * Following the official Ralph Wiggum technique structure
 */
export function generatePromptPlanMd(prd: PRDType): string {
  return `# ${prd.meta.project_name} - Planning Mode

You are in PLANNING mode. Your job is to analyze the codebase and update IMPLEMENTATION_PLAN.md.
DO NOT write any code. DO NOT create source files. ONLY update planning documents.

## Phase 0a: Study the Specifications
Using parallel subagents (up to 500), read and understand all files in \`specs/\` directory.
- Understand what needs to be built
- Note acceptance criteria for each feature
- Identify dependencies between features

## Phase 0b: Study the Existing Plan
Read \`IMPLEMENTATION_PLAN.md\` to understand:
- What tasks have been completed
- What tasks are pending
- Current priorities and blockers

## Phase 0c: Study the Source Code
Using parallel subagents (up to 500), scan the \`src/\` directory.
- Don't assume something isn't implemented - SEARCH for it
- Map existing code to specification requirements
- Note any deviations from specs

## Phase 0d: Study Utilities
Read \`src/lib/\` for shared utilities and patterns.
- Understand existing abstractions
- Note reusable components
- Identify patterns to follow

## Phase 1: Gap Analysis
Compare specs vs. existing code:
- What specs are fully implemented?
- What specs are partially implemented?
- What specs are not started?
- Are there bugs or inconsistencies?

## Phase 2: Update IMPLEMENTATION_PLAN.md
Generate/update the implementation plan with a prioritized task list.
Format tasks as markdown checkboxes:
\`\`\`
- [ ] Task description (files: file1.ts, file2.ts)
- [x] Completed task
\`\`\`

Group by priority and dependencies. Most important/blocking tasks first.

---
## Guardrails (999+)

999. This is PLANNING mode - do NOT write implementation code
1000. Do NOT create files in \`src/\` during planning
1001. Do NOT assume something isn't implemented - use subagents to SEARCH
1002. Keep tasks granular (1-4 hours each)
1003. Include file paths in task descriptions
1004. Document any spec inconsistencies you find
`;
}

/**
 * Generate PROMPT_build.md for build/implementation mode
 * Following the official Ralph Wiggum technique structure
 */
export function generatePromptBuildMd(prd: PRDType): string {
  return `# ${prd.meta.project_name} - Build Mode

You are in BUILD mode. Execute ONE task at a time from IMPLEMENTATION_PLAN.md.

## Phase 0a: Orient with Specifications
Using parallel subagents, study \`specs/\` to understand requirements.
- Read the spec file relevant to your current task
- Note acceptance criteria
- Understand edge cases

## Phase 0b: Orient with Implementation Plan
Read \`IMPLEMENTATION_PLAN.md\`:
- Find the first unchecked task (highest priority)
- This is your ONLY task for this iteration
- Do NOT look at other tasks

## Phase 0c: Orient with Source Code
Using parallel subagents, study existing code:
- Don't assume - SEARCH the codebase
- Understand existing patterns
- Find related code to modify

## Phase 1: Select Task
Identify the single highest-priority unchecked task from IMPLEMENTATION_PLAN.md.
- ONE task only
- Note the files involved
- Note the acceptance criteria

## Phase 2: Implement
Implement the task:
- Create/modify ONLY the files specified
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
`;
}

/**
 * Generate AGENTS.md - operational reference guide
 * Should be ~60 lines max, operational only
 */
export function generateAgentsMd(prd: PRDType): string {
  return `# ${prd.meta.project_name} - Operational Guide

## Build & Run
\`\`\`bash
npm install          # Install dependencies
npm run dev          # Development server
npm run build        # Production build
\`\`\`

## Validation Commands
\`\`\`bash
npm run build        # Must pass - no type errors
npm test             # Must pass - all tests green
npm run lint         # Must pass - no lint errors
\`\`\`

## Tech Stack
${Object.entries(prd.tech_stack).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

## Project Structure
\`\`\`
src/
├── app/             # Next.js app router pages
├── components/      # React components (PascalCase)
├── lib/             # Shared utilities (camelCase)
└── types/           # TypeScript types
specs/               # Requirement specifications
\`\`\`

## Codebase Patterns
- Components: PascalCase (UserProfile.tsx)
- Utilities: camelCase (formatDate.ts)
- Tests: *.test.ts or __tests__/
- Treat src/lib/ as shared standard library

## Subagent Usage
- Code search: Up to 500 parallel subagents
- Build/test: 1 subagent only (sequential)

## Operational Notes
- Status updates go in IMPLEMENTATION_PLAN.md
- Keep this file operational only (~60 lines)
`;
}

/**
 * Generate IMPLEMENTATION_PLAN.md - the task list that Ralph maintains
 */
export function generateImplementationPlanMd(prd: PRDType): string {
  let plan = `# Implementation Plan

Project: ${prd.meta.project_name}
Generated: ${new Date().toISOString().split('T')[0]}

## Summary
- Total Tasks: ${prd.summary.total_tasks}
- Estimated Hours: ${prd.summary.estimated_hours}

---

`;

  for (const epic of prd.epics) {
    plan += `## ${epic.id}: ${epic.name}\n`;
    if (epic.description) {
      plan += `${epic.description}\n`;
    }
    plan += `Priority: ${epic.priority} | Phase: ${epic.phase}\n\n`;

    for (const story of epic.user_stories) {
      plan += `### ${story.id}: ${story.title}\n\n`;

      for (const task of story.tasks) {
        const files = task.files.length > 0 ? ` (files: ${task.files.join(', ')})` : '';
        plan += `- [ ] ${task.id}: ${task.title}${files}\n`;
        if (task.acceptance.length > 0) {
          plan += `  - Acceptance: ${task.acceptance.join('; ')}\n`;
        }
      }
      plan += '\n';
    }
  }

  plan += `---

## Completed Tasks

(None yet)

## Discoveries & Notes

(Document findings, blockers, and decisions here)
`;

  return plan;
}

/**
 * Generate loop.sh script - the orchestration script
 */
export function generateLoopSh(): string {
  return `#!/bin/bash
# Ralph Wiggum Loop Script
# Usage: ./loop.sh [plan|build] [max_iterations]
#
# Modes:
#   plan  - Gap analysis and planning (no code changes)
#   build - Implementation (one task per iteration)

set -e

MODE=\${1:-build}
MAX_ITERATIONS=\${2:-0}
ITERATION=0

# Validate mode
if [[ "$MODE" != "plan" && "$MODE" != "build" ]]; then
  echo "Usage: ./loop.sh [plan|build] [max_iterations]"
  echo "  plan  - Run planning/gap analysis mode"
  echo "  build - Run build/implementation mode"
  exit 1
fi

# Set prompt file based on mode
PROMPT_FILE="PROMPT_\${MODE}.md"

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "Error: $PROMPT_FILE not found"
  exit 1
fi

echo "========================================"
echo "Ralph Wiggum Loop - $MODE mode"
echo "Prompt: $PROMPT_FILE"
echo "Max iterations: \${MAX_ITERATIONS:-unlimited}"
echo "========================================"

while true; do
  # Check iteration limit
  if [[ $MAX_ITERATIONS -gt 0 && $ITERATION -ge $MAX_ITERATIONS ]]; then
    echo ""
    echo "Reached max iterations ($MAX_ITERATIONS). Stopping."
    break
  fi

  ITERATION=$((ITERATION + 1))
  echo ""
  echo "=== Iteration $ITERATION ==="
  echo ""

  # Run Claude with the prompt
  cat "$PROMPT_FILE" | claude -p \\
    --dangerously-skip-permissions \\
    --output-format=stream-json \\
    --model opus \\
    --verbose

  # Push changes (if any)
  if git diff --quiet && git diff --staged --quiet; then
    echo "No changes to push"
  else
    BRANCH=$(git branch --show-current)
    git push origin "$BRANCH" 2>/dev/null || echo "Push failed (may need to pull first)"
  fi

  # Delay to avoid rate limits
  sleep 2
done

echo ""
echo "========================================"
echo "Loop completed after $ITERATION iterations"
echo "========================================"
`;
}

/**
 * Generate PROJECT_CONTEXT.md - comprehensive project documentation
 * This replaces the old PROMPT.md and provides context for humans and AI
 */
export function generateProjectContextMd(prd: PRDType): string {
  let md = `# ${prd.meta.full_name}

## Project Overview
- **Name**: ${prd.meta.project_name}
- **Platform**: ${prd.meta.target_platform}
- **Language**: ${prd.meta.primary_language}
- **Architecture**: ${prd.meta.architecture}

`;

  if (prd.product) {
    md += `## Product Vision
${prd.product.vision}

## Problem Statement
${prd.product.problem_statement}

## Value Proposition
${prd.product.value_proposition}

## Target Users
${prd.product.target_users.map(u => `
### ${u.persona}
${u.description}

**Goals:**
${u.goals.map(g => `- ${g}`).join('\n')}
`).join('\n')}
`;
  }

  if (prd.features && prd.features.length > 0) {
    md += `## Features

${prd.features.map(f => `### ${f.id}: ${f.name}
${f.description}
- Priority: ${f.priority}
- Complexity: ${f.complexity}
${f.user_stories ? `\nUser Stories:\n${f.user_stories.map(s => `- ${s}`).join('\n')}` : ''}
`).join('\n')}
`;
  }

  if (prd.scope) {
    md += `## Scope

### In Scope (v1)
${prd.scope.in_scope.map(s => `- ${s}`).join('\n')}

### Out of Scope (Future)
${prd.scope.out_of_scope.map(s => `- ${s}`).join('\n')}

${prd.scope.assumptions ? `### Assumptions\n${prd.scope.assumptions.map(a => `- ${a}`).join('\n')}` : ''}
`;
  }

  if (prd.user_flows && prd.user_flows.length > 0) {
    md += `## User Flows

${prd.user_flows.map(f => `### ${f.name}
${f.description}

**Steps:**
${f.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}
`).join('\n')}
`;
  }

  md += `## Tech Stack
${Object.entries(prd.tech_stack).map(([k, v]) => `- **${k}**: ${v}`).join('\n')}
`;

  if (prd.data_models && prd.data_models.length > 0) {
    md += `
## Data Models

${prd.data_models.map(m => `### ${m.name}
${m.description}
- Fields: ${m.fields.join(', ')}
${m.relationships ? `- Relationships: ${m.relationships.join(', ')}` : ''}
`).join('\n')}
`;
  }

  return md;
}

