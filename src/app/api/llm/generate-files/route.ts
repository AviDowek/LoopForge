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

interface GeneratedFile {
  path: string;
  content: string;
  type: 'prompt' | 'config' | 'plan' | 'spec' | 'script';
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prd: prdContent, projectName, provider } = body;

    if (!prdContent) {
      return NextResponse.json(
        { error: 'PRD content is required' },
        { status: 400 }
      );
    }

    const settings = await readSettings();
    const providerType = provider || settings.llmProvider;

    // Get the appropriate API key
    const apiKey = providerType === 'claude'
      ? settings.anthropicApiKey
      : settings.openaiApiKey;

    if (!apiKey) {
      return NextResponse.json(
        { error: `No API key configured for ${providerType}. Please add it in Settings.` },
        { status: 400 }
      );
    }

    // Parse the PRD if it's markdown - extract JSON from the generate-prd response
    // or use the raw content if it's already JSON
    let prdJson: PRDType;

    try {
      // First try to parse as JSON directly
      if (typeof prdContent === 'object') {
        prdJson = PRDSchema.parse(prdContent);
      } else {
        // Try to extract JSON from markdown or parse directly
        let jsonStr = prdContent;

        // If it's markdown, we need to regenerate JSON from it
        // For now, ask the LLM to convert markdown back to JSON
        const llm = createProvider(providerType, apiKey);

        const response = await llm.chat({
          systemPrompt: `Convert the following PRD document back into the JSON format. Output ONLY valid JSON, no markdown.

The JSON structure must be:
{
  "meta": { "project_name", "full_name", "version", "methodology", "target_platform", "primary_language", "architecture" },
  "tech_stack": { key: value pairs },
  "epics": [{ "id", "name", "priority", "phase", "user_stories": [{ "id", "title", "tasks": [{ "id", "title", "type", "hours", "deps", "files", "acceptance" }] }] }],
  "summary": { "total_epics", "total_stories", "total_tasks", "estimated_hours" }
}`,
          messages: [{ role: 'user', content: jsonStr }],
          maxTokens: 8192,
        });

        jsonStr = response.content.trim();
        if (jsonStr.startsWith('```json')) {
          jsonStr = jsonStr.slice(7);
        }
        if (jsonStr.startsWith('```')) {
          jsonStr = jsonStr.slice(3);
        }
        if (jsonStr.endsWith('```')) {
          jsonStr = jsonStr.slice(0, -3);
        }
        jsonStr = jsonStr.trim();

        prdJson = PRDSchema.parse(JSON.parse(jsonStr));
      }
    } catch (parseError) {
      console.error('Error parsing PRD:', parseError);
      return NextResponse.json(
        { error: 'Failed to parse PRD. Please regenerate the PRD.' },
        { status: 400 }
      );
    }

    const files: GeneratedFile[] = [];

    // Generate core Ralph Wiggum files using templates
    // PROJECT_CONTEXT.md provides comprehensive project documentation for humans and AI
    files.push({
      path: 'PROJECT_CONTEXT.md',
      content: generateProjectContextMd(prdJson),
      type: 'prompt',
    });

    files.push({
      path: 'PROMPT_plan.md',
      content: generatePromptPlanMd(prdJson),
      type: 'prompt',
    });

    files.push({
      path: 'PROMPT_build.md',
      content: generatePromptBuildMd(prdJson),
      type: 'prompt',
    });

    files.push({
      path: 'AGENTS.md',
      content: generateAgentsMd(prdJson),
      type: 'config',
    });

    // IMPLEMENTATION_PLAN.md is the main task tracking file for Ralph Wiggum
    // (Note: @fix_plan.md is NOT used - Ralph only reads IMPLEMENTATION_PLAN.md)
    files.push({
      path: 'IMPLEMENTATION_PLAN.md',
      content: generateImplementationPlanMd(prdJson),
      type: 'plan',
    });

    files.push({
      path: 'loop.sh',
      content: generateLoopSh(),
      type: 'script',
    });

    // Save PRD as JSON
    files.push({
      path: 'prd_complete.json',
      content: JSON.stringify(prdJson, null, 2),
      type: 'spec',
    });

    // Generate epic spec files using LLM for richer content
    const llm = createProvider(providerType, apiKey);

    for (const epic of prdJson.epics) {
      const epicSlug = epic.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

      const specResponse = await llm.chat({
        systemPrompt: SPEC_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Generate a detailed specification document for this epic:

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
- Tech Stack: ${Object.entries(prdJson.tech_stack).map(([k, v]) => `${k}: ${v}`).join(', ')}`,
        }],
        maxTokens: 4096,
      });

      files.push({
        path: `specs/${epic.id}-${epicSlug}.md`,
        content: specResponse.content,
        type: 'spec',
      });
    }

    // Generate main PRD spec file
    files.push({
      path: 'specs/PRD.md',
      content: `# ${prdJson.meta.full_name} - Product Requirements Document

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
`,
      type: 'spec',
    });

    return NextResponse.json({ files });
  } catch (error) {
    console.error('Error generating files:', error);
    return NextResponse.json(
      { error: 'Failed to generate files. Please try again.' },
      { status: 500 }
    );
  }
}
