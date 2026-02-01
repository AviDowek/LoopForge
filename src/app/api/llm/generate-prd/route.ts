import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { createProvider } from '@/lib/llm';

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

const PRD_SYSTEM_PROMPT = `You are an expert product manager and software architect. Your job is to take a SHORT, VAGUE product idea and transform it into a COMPREHENSIVE Product Requirements Document (PRD).

## YOUR PRIMARY GOAL
The user gives you a brief idea. You must DEEPLY THINK about what they're trying to build and create a full product specification that:
1. EXPLAINS what the product is and why it matters
2. DESCRIBES all features in detail with user-facing language
3. DEFINES what's in scope and out of scope
4. IDENTIFIES target users and their needs
5. THEN breaks down into technical implementation

## CRITICAL: PRODUCT FIRST, TASKS SECOND
Before ANY technical breakdown, you MUST fully describe the PRODUCT:
- What problem does it solve?
- Who is it for?
- What can users DO with it?
- What makes it valuable?
- What does v1 include vs exclude?

## JSON STRUCTURE (FOLLOW EXACTLY)

{
  "meta": {
    "project_name": "short-kebab-case",
    "full_name": "Full Human-Readable Name",
    "version": "1.0.0",
    "methodology": "Ralph Wiggum Technique",
    "target_platform": "web|mobile|desktop|api",
    "primary_language": "TypeScript|Python|etc",
    "architecture": "monolith|microservices|serverless"
  },
  "product": {
    "vision": "2-3 sentence vision statement explaining what this product is and the value it provides to users",
    "problem_statement": "Clear description of the problem this solves. What pain point exists today?",
    "target_users": [
      {
        "persona": "Primary User Type",
        "description": "Who they are and why they need this product",
        "goals": ["What they want to achieve", "Their key motivations"]
      }
    ],
    "value_proposition": "The core reason someone would use this over alternatives"
  },
  "features": [
    {
      "id": "F1",
      "name": "Feature Name",
      "description": "Detailed description of what this feature does from the USER's perspective. Not technical - explain the benefit and experience.",
      "user_stories": [
        "As a [user], I want to [action] so that [benefit]",
        "As a [user], I want to [action] so that [benefit]"
      ],
      "priority": "must-have|should-have|nice-to-have",
      "complexity": "low|medium|high"
    }
  ],
  "scope": {
    "in_scope": [
      "Specific capability that IS included in v1",
      "Another included capability"
    ],
    "out_of_scope": [
      "Specific capability that is NOT included in v1 (maybe v2)",
      "Another excluded capability"
    ],
    "assumptions": [
      "Key assumption about users, environment, or constraints",
      "Another assumption"
    ]
  },
  "user_flows": [
    {
      "name": "Primary User Flow Name",
      "description": "Step-by-step description of how a user accomplishes a key task",
      "steps": [
        "User does X",
        "System responds with Y",
        "User sees Z"
      ]
    }
  ],
  "tech_stack": {
    "framework": "Next.js 15|FastAPI|etc",
    "language": "TypeScript 5.x|Python 3.12|etc",
    "database": "PostgreSQL|SQLite|MongoDB|etc",
    "orm": "Prisma|SQLAlchemy|etc",
    "styling": "Tailwind CSS|etc",
    "state": "Zustand|Redux|etc",
    "auth": "NextAuth|Clerk|none",
    "testing": "Jest|Pytest|etc",
    "deployment": "Vercel|AWS|etc"
  },
  "data_models": [
    {
      "name": "ModelName",
      "description": "What this data represents",
      "fields": ["field1: type", "field2: type"],
      "relationships": ["Has many X", "Belongs to Y"]
    }
  ],
  "epics": [
    {
      "id": "E0",
      "name": "Epic Name",
      "description": "What this epic accomplishes",
      "priority": "P0|P1|P2",
      "phase": 1,
      "user_stories": [
        {
          "id": "E0-S0",
          "title": "Story Title",
          "tasks": [
            {
              "id": "E0-S0-T0",
              "title": "Task title",
              "type": "infrastructure|code|test|documentation",
              "hours": 2,
              "deps": [],
              "files": ["src/path/file.ts"],
              "acceptance": ["Criterion 1", "Criterion 2"]
            }
          ]
        }
      ]
    }
  ],
  "summary": {
    "total_epics": 6,
    "total_stories": 20,
    "total_tasks": 50,
    "estimated_hours": 120,
    "feature_count": 8
  }
}

## REQUIREMENTS

### Product Sections (REQUIRED - Be Thorough!)
- vision: 2-3 compelling sentences about what this product IS
- problem_statement: Clear problem being solved (2-3 sentences)
- target_users: At least 1-2 user personas with goals
- features: 5-10 user-facing features with detailed descriptions
- scope: Clear in/out of scope lists (4-6 items each)
- user_flows: 2-4 key user journeys

### Technical Sections
- 5-8 epics with clear descriptions
- 40-80 granular tasks (1-4 hours each)
- Realistic file paths
- Specific acceptance criteria

## OUTPUT
Output ONLY valid JSON. No markdown, no explanation.`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, projectName, provider, changeRequest, previousPRD } = body;

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
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

    const llm = createProvider(providerType, apiKey);

    // Build the user message
    let userMessage = `Project Name: ${projectName || 'My Project'}

## The User's Idea (this is ALL they gave you)
"${prompt}"

## Your Mission
Transform this brief idea into a COMPLETE product specification.

FIRST, think deeply about the PRODUCT:
- What is this really about? What's the core value?
- Who would use this and why? What problem does it solve for them?
- What features would make this genuinely useful (not just technically complete)?
- What should v1 include? What can wait for later?
- How would a user actually interact with this?

THEN, plan the technical implementation:
- What data needs to be stored?
- What's the right architecture?
- How do we break this into buildable pieces?

Write the PRD with rich product descriptions BEFORE the task breakdown. The product sections should read like something a product manager would present to stakeholders - clear, compelling, and user-focused.

Output the complete PRD as JSON.`;

    if (changeRequest && previousPRD) {
      userMessage = `Here is the previous PRD:

${previousPRD}

The user wants these changes:
${changeRequest}

Regenerate the complete PRD with these changes. Keep all product description sections detailed and user-focused. Output ONLY valid JSON.`;
    }

    const response = await llm.chat({
      systemPrompt: PRD_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 16384,
      temperature: 0.7,
    });

    // Try to parse as JSON to validate, but return as markdown-formatted content
    let prdJson;
    try {
      // Clean up the response - remove markdown code blocks if present
      let content = response.content.trim();
      if (content.startsWith('```json')) {
        content = content.slice(7);
      }
      if (content.startsWith('```')) {
        content = content.slice(3);
      }
      if (content.endsWith('```')) {
        content = content.slice(0, -3);
      }
      content = content.trim();

      prdJson = JSON.parse(content);
    } catch {
      // If not valid JSON, return raw content
      return NextResponse.json({
        content: response.content,
        isJson: false,
      });
    }

    // Format as readable markdown for display
    const markdownContent = formatPRDAsMarkdown(prdJson);

    return NextResponse.json({
      content: markdownContent,
      json: prdJson,
      isJson: true,
    });
  } catch (error) {
    console.error('Error generating PRD:', error);
    return NextResponse.json(
      { error: 'Failed to generate PRD. Please check your API key and try again.' },
      { status: 500 }
    );
  }
}

function formatPRDAsMarkdown(prd: Record<string, unknown>): string {
  const meta = prd.meta as Record<string, string>;
  const product = prd.product as {
    vision?: string;
    problem_statement?: string;
    target_users?: Array<{ persona: string; description: string; goals: string[] }>;
    value_proposition?: string;
  } | undefined;
  const features = prd.features as Array<{
    id: string;
    name: string;
    description: string;
    user_stories?: string[];
    priority: string;
    complexity: string;
  }> | undefined;
  const scope = prd.scope as {
    in_scope?: string[];
    out_of_scope?: string[];
    assumptions?: string[];
  } | undefined;
  const userFlows = prd.user_flows as Array<{
    name: string;
    description: string;
    steps: string[];
  }> | undefined;
  const dataModels = prd.data_models as Array<{
    name: string;
    description: string;
    fields: string[];
    relationships?: string[];
  }> | undefined;
  const techStack = prd.tech_stack as Record<string, string>;
  const epics = prd.epics as Array<{
    id: string;
    name: string;
    description?: string;
    priority: string;
    user_stories: Array<{
      id: string;
      title: string;
      tasks: Array<{
        id: string;
        title: string;
        type: string;
        hours: number;
        files: string[];
        acceptance: string[];
      }>;
    }>;
  }>;
  const summary = prd.summary as Record<string, number>;

  let md = `# ${meta.full_name}\n\n`;

  // Product Vision & Overview
  if (product) {
    if (product.vision) {
      md += `## Product Vision\n\n${product.vision}\n\n`;
    }
    if (product.problem_statement) {
      md += `## Problem Statement\n\n${product.problem_statement}\n\n`;
    }
    if (product.value_proposition) {
      md += `## Value Proposition\n\n${product.value_proposition}\n\n`;
    }
    if (product.target_users && product.target_users.length > 0) {
      md += `## Target Users\n\n`;
      for (const user of product.target_users) {
        md += `### ${user.persona}\n\n${user.description}\n\n`;
        if (user.goals && user.goals.length > 0) {
          md += `**Goals:**\n`;
          for (const goal of user.goals) {
            md += `- ${goal}\n`;
          }
          md += '\n';
        }
      }
    }
  }

  // Features
  if (features && features.length > 0) {
    md += `## Features\n\n`;
    for (const feature of features) {
      md += `### ${feature.id}: ${feature.name}\n\n`;
      md += `${feature.description}\n\n`;
      md += `- **Priority**: ${feature.priority}\n`;
      md += `- **Complexity**: ${feature.complexity}\n`;
      if (feature.user_stories && feature.user_stories.length > 0) {
        md += `\n**User Stories:**\n`;
        for (const story of feature.user_stories) {
          md += `- ${story}\n`;
        }
      }
      md += '\n';
    }
  }

  // Scope
  if (scope) {
    md += `## Scope\n\n`;
    if (scope.in_scope && scope.in_scope.length > 0) {
      md += `### In Scope (v1)\n`;
      for (const item of scope.in_scope) {
        md += `- ✅ ${item}\n`;
      }
      md += '\n';
    }
    if (scope.out_of_scope && scope.out_of_scope.length > 0) {
      md += `### Out of Scope (Future)\n`;
      for (const item of scope.out_of_scope) {
        md += `- ❌ ${item}\n`;
      }
      md += '\n';
    }
    if (scope.assumptions && scope.assumptions.length > 0) {
      md += `### Assumptions\n`;
      for (const item of scope.assumptions) {
        md += `- ${item}\n`;
      }
      md += '\n';
    }
  }

  // User Flows
  if (userFlows && userFlows.length > 0) {
    md += `## User Flows\n\n`;
    for (const flow of userFlows) {
      md += `### ${flow.name}\n\n${flow.description}\n\n`;
      if (flow.steps && flow.steps.length > 0) {
        md += `**Steps:**\n`;
        flow.steps.forEach((step, i) => {
          md += `${i + 1}. ${step}\n`;
        });
        md += '\n';
      }
    }
  }

  // Technical Overview
  md += `---\n\n# Technical Specification\n\n`;

  md += `## Project Meta\n`;
  md += `- **Name**: ${meta.project_name}\n`;
  md += `- **Version**: ${meta.version}\n`;
  md += `- **Platform**: ${meta.target_platform}\n`;
  md += `- **Language**: ${meta.primary_language}\n`;
  md += `- **Architecture**: ${meta.architecture}\n\n`;

  md += `## Tech Stack\n`;
  for (const [key, value] of Object.entries(techStack)) {
    md += `- **${key}**: ${value}\n`;
  }
  md += '\n';

  // Data Models
  if (dataModels && dataModels.length > 0) {
    md += `## Data Models\n\n`;
    for (const model of dataModels) {
      md += `### ${model.name}\n\n${model.description}\n\n`;
      md += `**Fields:** ${model.fields.join(', ')}\n`;
      if (model.relationships && model.relationships.length > 0) {
        md += `**Relationships:** ${model.relationships.join(', ')}\n`;
      }
      md += '\n';
    }
  }

  // Epics & Tasks
  md += `## Implementation Epics\n\n`;

  for (const epic of epics) {
    md += `### ${epic.id}: ${epic.name} (${epic.priority})\n\n`;
    if (epic.description) {
      md += `${epic.description}\n\n`;
    }

    for (const story of epic.user_stories) {
      md += `#### ${story.id}: ${story.title}\n\n`;

      for (const task of story.tasks) {
        md += `- **${task.id}**: ${task.title}\n`;
        md += `  - Type: ${task.type}, Hours: ${task.hours}\n`;
        if (task.files && task.files.length > 0) {
          md += `  - Files: \`${task.files.join('`, `')}\`\n`;
        }
        if (task.acceptance && task.acceptance.length > 0) {
          md += `  - Acceptance:\n`;
          for (const ac of task.acceptance) {
            md += `    - ${ac}\n`;
          }
        }
      }
      md += '\n';
    }
  }

  md += `## Summary\n`;
  md += `- **Total Epics**: ${summary.total_epics}\n`;
  md += `- **Total Stories**: ${summary.total_stories}\n`;
  md += `- **Total Tasks**: ${summary.total_tasks}\n`;
  md += `- **Estimated Hours**: ${summary.estimated_hours}\n`;
  if (summary.feature_count) {
    md += `- **Features**: ${summary.feature_count}\n`;
  }

  return md;
}
