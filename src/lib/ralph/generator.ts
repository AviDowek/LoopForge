import type { LLMProvider, PRDType } from '../llm/types';
import type { GeneratedFile } from '@/types';
import {
  generatePromptPlanMd,
  generatePromptBuildMd,
  generateAgentsMd,
  generateLoopSh,
  generateImplementationPlanMd,
  generateProjectContextMd,
} from './templates';

const PRD_GENERATION_SYSTEM_PROMPT = `You are a senior software architect specializing in the Ralph Wiggum Technique for structured software development. Your task is to generate a comprehensive Product Requirements Document (PRD) in JSON format.

The Ralph Wiggum Technique breaks down projects into:
- Epics (E0, E1, E2...): Major feature areas with phases
- User Stories (E0-S1, E0-S2...): Specific user-facing capabilities
- Tasks (E0-S1-T1, E0-S1-T2...): Atomic implementation units

Each task must have:
- Unique ID in ExSyTn format (e.g., E0-S1-T1)
- Clear title describing the work
- Type: infrastructure, code, test, or documentation
- Hour estimate (realistic, not optimistic)
- Dependencies array (task IDs that must complete first)
- Files array (exact files to create/modify)
- Acceptance criteria array (testable requirements)

Generate a complete PRD that can be executed by Claude Code CLI in autonomous loops.
Always include:
1. Infrastructure setup tasks first (E0)
2. Core functionality (E1, E2, ...)
3. Testing tasks throughout
4. Documentation as final phase

Return ONLY valid JSON matching the PRD schema.`;

export class RalphGenerator {
  constructor(private provider: LLMProvider) {}

  /**
   * Generate PRD from a short user prompt
   */
  async generatePRD(
    shortPrompt: string,
    options: {
      projectName?: string;
      architectureStyle?: 'clean' | 'hexagonal' | 'mvc' | 'layered';
      includeTests?: boolean;
    } = {}
  ): Promise<PRDType> {
    const userPrompt = `Generate a complete PRD JSON for the following project:

Project Idea: ${shortPrompt}

${options.projectName ? `Project Name: ${options.projectName}` : ''}
${options.architectureStyle ? `Architecture Style: ${options.architectureStyle}` : 'Architecture Style: clean architecture'}
${options.includeTests !== false ? 'Include comprehensive test tasks for each feature.' : ''}

Requirements:
1. Start with E0 (Infrastructure) epic for project setup
2. Break down features into logical epics (E1, E2, etc.)
3. Each task should be atomic and completable in 1-4 hours
4. Include all file paths that will be created
5. Define clear acceptance criteria for each task
6. Respect task dependencies (infrastructure before features)

Return ONLY the JSON, no markdown or explanation.`;

    const response = await this.provider.chat({
      messages: [{ role: 'user', content: userPrompt }],
      systemPrompt: PRD_GENERATION_SYSTEM_PROMPT,
      maxTokens: 8192,
      temperature: 0.7,
    });

    // Parse the JSON response
    try {
      // Extract JSON from potential markdown code blocks
      let jsonStr = response.content;
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      const prd = JSON.parse(jsonStr) as PRDType;
      return prd;
    } catch (error) {
      throw new Error(`Failed to parse PRD JSON: ${error}`);
    }
  }

  /**
   * Generate all Ralph Wiggum files from a PRD
   *
   * Files generated (per Ralph Wiggum technique):
   * - PROJECT_CONTEXT.md: Comprehensive project docs for humans/AI
   * - PROMPT_plan.md: Planning mode prompt
   * - PROMPT_build.md: Build mode prompt
   * - AGENTS.md: Operational guide (~60 lines)
   * - IMPLEMENTATION_PLAN.md: Task checklist (the main tracking file)
   * - prd_complete.json: Full PRD as JSON
   * - loop.sh: Orchestration script
   * - specs/: Epic specification files
   */
  generateFiles(prd: PRDType): GeneratedFile[] {
    const files: GeneratedFile[] = [
      {
        path: 'PROJECT_CONTEXT.md',
        content: generateProjectContextMd(prd),
        type: 'prompt',
      },
      {
        path: 'PROMPT_plan.md',
        content: generatePromptPlanMd(prd),
        type: 'prompt',
      },
      {
        path: 'PROMPT_build.md',
        content: generatePromptBuildMd(prd),
        type: 'prompt',
      },
      {
        path: 'AGENTS.md',
        content: generateAgentsMd(prd),
        type: 'config',
      },
      {
        path: 'IMPLEMENTATION_PLAN.md',
        content: generateImplementationPlanMd(prd),
        type: 'plan',
      },
      {
        path: 'prd_complete.json',
        content: JSON.stringify(prd, null, 2),
        type: 'config',
      },
      {
        path: 'loop.sh',
        content: generateLoopSh(),
        type: 'script',
      },
    ];

    // Generate spec files for each epic
    for (const epic of prd.epics) {
      const epicContent = this.generateEpicSpec(epic, prd);
      files.push({
        path: `specs/${epic.id}-${this.slugify(epic.name)}.md`,
        content: epicContent,
        type: 'spec',
      });
    }

    return files;
  }

  private generateEpicSpec(
    epic: PRDType['epics'][0],
    prd: PRDType
  ): string {
    let content = `# ${epic.id}: ${epic.name}

Phase: ${epic.phase}
Priority: ${epic.priority}

## Overview

This epic covers the ${epic.name.toLowerCase()} functionality for ${prd.meta.project_name}.

## User Stories

`;

    for (const story of epic.user_stories) {
      content += `### ${story.id}: ${story.title}\n\n`;
      content += `#### Tasks\n\n`;

      for (const task of story.tasks) {
        content += `**${task.id}: ${task.title}**\n`;
        content += `- Type: ${task.type}\n`;
        content += `- Estimated Hours: ${task.hours}\n`;

        if (task.deps.length > 0) {
          content += `- Dependencies: ${task.deps.join(', ')}\n`;
        }

        content += `\nFiles:\n`;
        for (const file of task.files) {
          content += `- \`${file}\`\n`;
        }

        content += `\nAcceptance Criteria:\n`;
        for (const criterion of task.acceptance) {
          content += `- [ ] ${criterion}\n`;
        }

        content += '\n---\n\n';
      }
    }

    return content;
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
