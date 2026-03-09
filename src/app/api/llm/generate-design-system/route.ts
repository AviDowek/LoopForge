import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { createProvider } from '@/lib/llm';
import { PRDSchema } from '@/lib/llm/types';
import {
  DESIGN_DIRECTOR_SYSTEM_PROMPT,
  buildDesignSystemPrompt,
} from '@/lib/design/designPrompts';
import type { DesignSystem } from '@/types/design';

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

/**
 * Extract JSON from LLM response (handles code blocks and raw JSON)
 */
function extractJSON(text: string): string {
  let jsonStr = text.trim();

  // Try code block extraction first
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  return jsonStr;
}

/**
 * Build a design system prompt from markdown PRD content (fallback when structured PRD is unavailable)
 */
function buildDesignSystemPromptFromMarkdown(prdMarkdown: string): string {
  return `Generate a complete design system for this product.

## Product Context (from PRD)

${prdMarkdown}

## Your Task

Think deeply about this product's domain, its users, and the emotional register it needs. Then create a comprehensive design system as a JSON object.

The design system must feel UNIQUE to this product. Not a generic template with swapped colors — a thoughtful system that reflects the product's personality.

Also, based on the PRD above, identify the key pages/screens that need to be designed. Return them in a separate "pages" array alongside the design system.

Return a JSON code block with this exact structure:

\`\`\`json
{
  "designSystem": {
    "name": "A creative name for this design direction",
    "description": "2-sentence description of the aesthetic philosophy",
    "colors": {
      "primary": [
        { "name": "primary-50", "value": "#hex", "usage": "Lightest tint" },
        { "name": "primary-100", "value": "#hex", "usage": "..." },
        { "name": "primary-200", "value": "#hex", "usage": "..." },
        { "name": "primary-300", "value": "#hex", "usage": "..." },
        { "name": "primary-400", "value": "#hex", "usage": "..." },
        { "name": "primary-500", "value": "#hex", "usage": "Default primary" },
        { "name": "primary-600", "value": "#hex", "usage": "..." },
        { "name": "primary-700", "value": "#hex", "usage": "..." },
        { "name": "primary-800", "value": "#hex", "usage": "..." },
        { "name": "primary-900", "value": "#hex", "usage": "Darkest shade" }
      ],
      "secondary": [ ...same 50-900 ],
      "accent": [ ...same 50-900 ],
      "neutral": [ ...same 50-900 ],
      "semantic": { "success": "#hex", "warning": "#hex", "error": "#hex", "info": "#hex" },
      "background": { "primary": "#hex", "secondary": "#hex", "tertiary": "#hex" },
      "text": { "primary": "#hex", "secondary": "#hex", "muted": "#hex", "inverse": "#hex" }
    },
    "typography": {
      "fontFamilies": { "heading": "Google Font", "body": "Google Font", "mono": "Google Font" },
      "scale": [
        { "name": "display", "fontFamily": "heading", "fontSize": "3.5rem", "fontWeight": 800, "lineHeight": "1.1", "letterSpacing": "-0.03em", "usage": "Hero headlines" },
        ...more scale entries
      ]
    },
    "spacing": { "unit": 4, "scale": { "3xs": "2px", "2xs": "4px", "xs": "8px", "sm": "12px", "md": "16px", "lg": "24px", "xl": "32px", "2xl": "48px", "3xl": "64px", "4xl": "96px" } },
    "borderRadius": { "none": "0", "sm": "4px", "md": "8px", "lg": "12px", "xl": "16px", "full": "9999px" },
    "shadows": { "sm": "...", "md": "...", "lg": "...", "xl": "..." },
    "transitions": { "fast": "100ms ease", "default": "200ms ease", "slow": "400ms ease" }
  },
  "pages": [
    { "id": "kebab-case-id", "name": "Page Name", "description": "What this page shows", "userFlowRef": "Related user flow name" }
  ]
}
\`\`\``;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prd, prdMarkdown, provider } = body;

    if (!prd && !prdMarkdown) {
      return NextResponse.json(
        { error: 'PRD is required (either structured JSON or markdown content)' },
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

    const llm = createProvider(providerType, apiKey);

    console.log('[generate-design-system] Generating design system...');
    const startTime = Date.now();

    // Build the prompt based on what PRD data we have
    let userPrompt: string;
    let usingMarkdownFallback = false;

    if (prd && typeof prd === 'object') {
      // Structured PRD available — use the precise prompt builder
      try {
        const prdJson = PRDSchema.parse(prd);
        userPrompt = buildDesignSystemPrompt(prdJson);
      } catch (parseError) {
        console.warn('[generate-design-system] Structured PRD failed Zod validation, falling back to markdown:', parseError);
        // Fall through to markdown
        if (prdMarkdown) {
          userPrompt = buildDesignSystemPromptFromMarkdown(prdMarkdown);
          usingMarkdownFallback = true;
        } else {
          return NextResponse.json(
            { error: 'Failed to parse PRD data' },
            { status: 400 }
          );
        }
      }
    } else if (prdMarkdown) {
      // Only markdown available — use the markdown prompt
      console.log('[generate-design-system] Using markdown PRD fallback');
      userPrompt = buildDesignSystemPromptFromMarkdown(prdMarkdown);
      usingMarkdownFallback = true;
    } else {
      return NextResponse.json(
        { error: 'No PRD data provided' },
        { status: 400 }
      );
    }

    const response = await llm.chat({
      systemPrompt: DESIGN_DIRECTOR_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 8192,
      temperature: 0.8,
    });

    const jsonStr = extractJSON(response.content);
    let designSystem: DesignSystem;
    let pages: Array<{ id: string; name: string; description: string; userFlowRef: string }> | undefined;

    try {
      const parsed = JSON.parse(jsonStr);

      // When using markdown fallback, the response wraps designSystem + pages
      if (usingMarkdownFallback && parsed.designSystem) {
        designSystem = parsed.designSystem;
        pages = parsed.pages;
      } else {
        designSystem = parsed;
      }
    } catch (parseError) {
      console.error('Failed to parse design system JSON:', parseError);
      console.error('Raw response:', response.content.slice(0, 500));
      return NextResponse.json(
        { error: 'Failed to parse design system response. Please try again.' },
        { status: 500 }
      );
    }

    console.log(`[generate-design-system] Completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s: "${designSystem.name}"`);

    return NextResponse.json({ designSystem, pages });
  } catch (error) {
    console.error('Error generating design system:', error);
    return NextResponse.json(
      { error: 'Failed to generate design system. Please try again.' },
      { status: 500 }
    );
  }
}
