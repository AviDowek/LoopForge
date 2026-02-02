import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { createProvider } from '@/lib/llm';
import { PRDSchema, type PRDType } from '@/lib/llm/types';
import {
  generatePromptPlanMd,
  generatePromptBuildMd,
  generateAgentsMd,
  generateLoopSh,
  generateImplementationPlanMd,
  generateProjectContextMd,
} from '@/lib/ralph/templates';

const SETTINGS_FILE = path.join(process.cwd(), 'data', 'settings.json');

interface Settings {
  llmProvider: 'openai' | 'claude';
  openaiApiKey: string | null;
  anthropicApiKey: string | null;
}

async function readSettings(): Promise<Settings> {
  try {
    const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {
      llmProvider: 'claude',
      openaiApiKey: null,
      anthropicApiKey: null,
    };
  }
}

const SPEC_SYSTEM_PROMPT = `You are an expert technical writer creating detailed specification documents for software development.

Given an epic from a PRD, write a comprehensive spec document that includes:
1. Overview of the epic's purpose
2. Detailed user stories with acceptance criteria
3. Technical requirements and constraints
4. API endpoints (if applicable)
5. Data models (if applicable)
6. UI/UX requirements (if applicable)
7. Testing requirements

Write in clear, technical markdown. Be specific and actionable.`;

/**
 * Regenerate a single file with optional additional context
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { filePath, prd, provider, context, previousContent } = body;

    if (!filePath || !prd) {
      return NextResponse.json(
        { error: 'filePath and prd are required' },
        { status: 400 }
      );
    }

    const settings = await readSettings();
    const providerType = provider || settings.llmProvider;

    const apiKey = providerType === 'claude'
      ? settings.anthropicApiKey
      : settings.openaiApiKey;

    if (!apiKey) {
      return NextResponse.json(
        { error: `No API key configured for ${providerType}. Please add it in Settings.` },
        { status: 400 }
      );
    }

    // Parse PRD
    let prdJson: PRDType;
    try {
      if (typeof prd === 'object') {
        prdJson = PRDSchema.parse(prd);
      } else {
        prdJson = PRDSchema.parse(JSON.parse(prd));
      }
    } catch (parseError) {
      console.error('Error parsing PRD:', parseError);
      return NextResponse.json(
        { error: 'Failed to parse PRD data' },
        { status: 400 }
      );
    }

    // Determine file type and generate accordingly
    let newContent: string;
    const llm = createProvider(providerType, apiKey);

    // Template-based files (can be regenerated with LLM customization if context provided)
    if (filePath === 'PROJECT_CONTEXT.md') {
      newContent = await regenerateWithContext(
        llm,
        generateProjectContextMd(prdJson),
        context,
        previousContent,
        'project context documentation'
      );
    } else if (filePath === 'PROMPT_plan.md') {
      newContent = await regenerateWithContext(
        llm,
        generatePromptPlanMd(prdJson),
        context,
        previousContent,
        'planning mode prompt'
      );
    } else if (filePath === 'PROMPT_build.md') {
      newContent = await regenerateWithContext(
        llm,
        generatePromptBuildMd(prdJson),
        context,
        previousContent,
        'build mode prompt'
      );
    } else if (filePath === 'AGENTS.md') {
      newContent = await regenerateWithContext(
        llm,
        generateAgentsMd(prdJson),
        context,
        previousContent,
        'operational guide for agents'
      );
    } else if (filePath === 'IMPLEMENTATION_PLAN.md') {
      newContent = await regenerateWithContext(
        llm,
        generateImplementationPlanMd(prdJson),
        context,
        previousContent,
        'implementation task plan'
      );
    } else if (filePath === 'loop.sh') {
      // Script file - just use template, no LLM customization
      newContent = generateLoopSh();
    } else if (filePath === 'prd_complete.json') {
      // JSON file - just return formatted PRD
      newContent = JSON.stringify(prdJson, null, 2);
    } else if (filePath.startsWith('specs/') && filePath !== 'specs/PRD.md') {
      // Epic spec files - regenerate with LLM
      newContent = await regenerateEpicSpec(llm, prdJson, filePath, context, previousContent);
    } else if (filePath === 'specs/PRD.md') {
      // Main PRD spec
      newContent = await regenerateWithContext(
        llm,
        generatePrdSpecMd(prdJson),
        context,
        previousContent,
        'PRD specification document'
      );
    } else {
      return NextResponse.json(
        { error: `Unknown file type: ${filePath}` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      path: filePath,
      content: newContent,
    });
  } catch (error) {
    console.error('Error regenerating file:', error);
    return NextResponse.json(
      { error: 'Failed to regenerate file. Please try again.' },
      { status: 500 }
    );
  }
}

/**
 * Regenerate content with optional user context
 */
async function regenerateWithContext(
  llm: ReturnType<typeof createProvider>,
  templateContent: string,
  context: string | undefined,
  previousContent: string | undefined,
  fileDescription: string
): Promise<string> {
  // If no context provided, just return the template
  if (!context || !context.trim()) {
    return templateContent;
  }

  // Use LLM to modify the template based on user context
  const response = await llm.chat({
    systemPrompt: `You are modifying a ${fileDescription} document based on user feedback.
Your job is to incorporate the user's requested changes while maintaining the document's structure and purpose.
Output ONLY the modified document content, no explanations or markdown code blocks wrapping the entire output.`,
    messages: [{
      role: 'user',
      content: `Here is the current document:

---
${previousContent || templateContent}
---

User's requested changes:
${context}

Please modify the document to incorporate these changes while maintaining its overall structure and purpose.
Output the complete modified document.`,
    }],
    maxTokens: 8192,
  });

  return response.content;
}

/**
 * Regenerate an epic spec file
 */
async function regenerateEpicSpec(
  llm: ReturnType<typeof createProvider>,
  prdJson: PRDType,
  filePath: string,
  context: string | undefined,
  previousContent: string | undefined
): Promise<string> {
  // Extract epic ID from filename (e.g., "specs/E0-setup.md" -> "E0")
  const filename = filePath.replace('specs/', '').replace('.md', '');
  const epicId = filename.split('-')[0];

  const epic = prdJson.epics.find(e => e.id === epicId);
  if (!epic) {
    throw new Error(`Epic ${epicId} not found in PRD`);
  }

  const basePrompt = `Generate a detailed specification document for this epic:

Epic ID: ${epic.id}
Epic Name: ${epic.name}
Priority: ${epic.priority}
Phase: ${epic.phase}

User Stories:
${epic.user_stories.map(story => `
### ${story.id}: ${story.title}
Tasks:
${story.tasks.map(task => `- ${task.id}: ${task.title}
  - Type: ${task.type}
  - Files: ${task.files.join(', ')}
  - Acceptance: ${task.acceptance.join(', ')}`).join('\n')}`).join('\n')}

Project Context:
- Name: ${prdJson.meta.project_name}
- Architecture: ${prdJson.meta.architecture}
- Language: ${prdJson.meta.primary_language}
- Tech Stack: ${Object.entries(prdJson.tech_stack).map(([k, v]) => `${k}: ${v}`).join(', ')}`;

  // Add user context if provided
  let userMessage = basePrompt;
  if (context && context.trim()) {
    userMessage += `

Additional Instructions from User:
${context}

${previousContent ? `Previous Version of This Document:
---
${previousContent}
---

Please incorporate the user's feedback while maintaining the spec document structure.` : ''}`;
  }

  const response = await llm.chat({
    systemPrompt: SPEC_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
    maxTokens: 16384, // Higher limit for GPT-5.2 reasoning overhead
  });

  return response.content;
}

/**
 * Generate the main PRD spec file
 */
function generatePrdSpecMd(prdJson: PRDType): string {
  return `# ${prdJson.meta.full_name} - Product Requirements Document

## Project Overview

**Project Name**: ${prdJson.meta.project_name}
**Version**: ${prdJson.meta.version}
**Methodology**: ${prdJson.meta.methodology}
**Target Platform**: ${prdJson.meta.target_platform}
**Primary Language**: ${prdJson.meta.primary_language}
**Architecture**: ${prdJson.meta.architecture}

## Tech Stack

${Object.entries(prdJson.tech_stack).map(([key, value]) => `- **${key}**: ${value}`).join('\n')}

## Epics Overview

${prdJson.epics.map(epic => `### ${epic.id}: ${epic.name}
- **Priority**: ${epic.priority}
- **Phase**: ${epic.phase}
- **Stories**: ${epic.user_stories.length}
- **Tasks**: ${epic.user_stories.reduce((acc, s) => acc + s.tasks.length, 0)}`).join('\n\n')}

## Summary

- **Total Epics**: ${prdJson.summary.total_epics}
- **Total Stories**: ${prdJson.summary.total_stories}
- **Total Tasks**: ${prdJson.summary.total_tasks}
- **Estimated Hours**: ${prdJson.summary.estimated_hours}

## Document References

${prdJson.epics.map(epic => {
  const epicSlug = epic.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `- [${epic.id}: ${epic.name}](${epic.id}-${epicSlug}.md)`;
}).join('\n')}
`;
}
