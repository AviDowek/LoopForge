import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { createProvider } from '@/lib/llm';
import { PRDSchema } from '@/lib/llm/types';
import type { PRDType } from '@/lib/llm/types';
import {
  DESIGN_DIRECTOR_SYSTEM_PROMPT,
  buildPageDesignPrompt,
  designSystemToCSS,
  designSystemToTailwindConfig,
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
 * Extract HTML from LLM response (handles code blocks)
 */
function extractHTML(text: string): string {
  const html = text.trim();

  // Try to extract from HTML code block
  const htmlBlockMatch = html.match(/```html\s*\n?([\s\S]*?)\n?```/);
  if (htmlBlockMatch) {
    return htmlBlockMatch[1].trim();
  }

  // Try generic code block
  const codeBlockMatch = html.match(/```\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch && codeBlockMatch[1].includes('<!DOCTYPE') || codeBlockMatch?.[1].includes('<html')) {
    return codeBlockMatch[1].trim();
  }

  // If it starts with DOCTYPE or html tag, it's already clean HTML
  if (html.startsWith('<!DOCTYPE') || html.startsWith('<html')) {
    return html;
  }

  return html;
}

/**
 * Build page design prompt using markdown PRD (fallback when structured PRD is unavailable)
 */
function buildPageDesignPromptFromMarkdown(
  pageName: string,
  pageDescription: string,
  userFlowSteps: string[],
  ds: DesignSystem,
  prdMarkdown: string,
  anchorPageHtml?: string,
  previousHtml?: string,
  judgeFeedback?: { score: number; issues: string[]; suggestions: string[] },
): string {
  const tokenCSS = designSystemToCSS(ds);
  const tailwindConfig = designSystemToTailwindConfig(ds);

  let prompt = '';

  if (judgeFeedback && previousHtml) {
    prompt += `## CRITICAL: Previous Version Scored ${judgeFeedback.score}/100

Your previous design was judged and needs improvement. Address EVERY issue below:

### Issues Found:
${judgeFeedback.issues.map((i: string) => `- ${i}`).join('\n')}

### Specific Suggestions:
${judgeFeedback.suggestions.map((s: string) => `- ${s}`).join('\n')}

Do NOT repeat the same mistakes. The judge is strict and will penalize generic patterns.

---

`;
  }

  prompt += `Design the "${pageName}" page.

## Page Purpose
${pageDescription}

## User Flow for This Page
${userFlowSteps.length > 0 ? userFlowSteps.map((s, i) => `${i + 1}. ${s}`).join('\n') : 'Use the product context below to determine the appropriate user flow.'}

## Design System Name: "${ds.name}"
${ds.description}

## Design Tokens (MUST USE — embed these in your HTML)

### CSS Custom Properties:
\`\`\`css
${tokenCSS}
\`\`\`

### Tailwind Config:
\`\`\`javascript
${tailwindConfig}
\`\`\`

### Typography
- Heading font: "${ds.typography.fontFamilies.heading}"
- Body font: "${ds.typography.fontFamilies.body}"
- Mono font: "${ds.typography.fontFamilies.mono}"

### Color Palette Summary
- Primary: ${ds.colors.primary.find(c => c.name.includes('500'))?.value || 'see tokens'}
- Accent: ${ds.colors.accent.find(c => c.name.includes('500'))?.value || 'see tokens'}
- Background: ${ds.colors.background.primary}
- Text: ${ds.colors.text.primary}

## Product Context (from PRD)
${prdMarkdown.slice(0, 6000)}
`;

  if (anchorPageHtml) {
    prompt += `
## CONSISTENCY REFERENCE — Match This Visual Style

The following is the anchor page design. Your page MUST feel like it belongs to the same application.

\`\`\`html
${anchorPageHtml.slice(0, 12000)}
\`\`\`
`;
  }

  prompt += `
## Requirements
- Output a COMPLETE, self-contained HTML file
- Include \`<script src="https://cdn.tailwindcss.com"></script>\` in head
- Include Tailwind config script with custom theme extending colors/fonts
- Include Google Fonts via \`<link>\` tags for all specified font families
- Include \`<style>\` block with the CSS custom properties above
- Responsive design (mobile-first, use Tailwind sm:/md:/lg: prefixes)
- Realistic content that matches the product domain — NOT "Lorem ipsum"
- NO JavaScript behavior — pure visual reference
- Use semantic HTML elements
- Include hover/focus states via Tailwind hover: and focus: utilities
- Every spacing value, color, and font size must reference the design system

Output ONLY the complete HTML file, no explanations.`;

  return prompt;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      pageName,
      pageDescription,
      userFlowSteps,
      designSystem,
      prd,
      provider,
      anchorPageHtml,
      previousHtml,
      judgeFeedback,
    } = body;

    if (!pageName || !designSystem) {
      return NextResponse.json(
        { error: 'pageName and designSystem are required' },
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

    console.log(`[generate-page-design] Generating "${pageName}"${judgeFeedback ? ' (iteration with feedback)' : ''}...`);
    const startTime = Date.now();

    // Build prompt — try structured PRD first, fall back to markdown
    let userPrompt: string;

    if (prd && typeof prd === 'object') {
      try {
        const prdJson: PRDType = PRDSchema.parse(prd);
        userPrompt = buildPageDesignPrompt(
          pageName,
          pageDescription || `${pageName} page for ${prdJson.meta.full_name}`,
          userFlowSteps || [],
          designSystem,
          prdJson,
          anchorPageHtml,
          previousHtml,
          judgeFeedback,
        );
      } catch {
        // Structured PRD failed validation — use markdown fallback
        console.warn('[generate-page-design] Structured PRD failed Zod validation, using as-is');
        userPrompt = buildPageDesignPromptFromMarkdown(
          pageName,
          pageDescription || `${pageName} page`,
          userFlowSteps || [],
          designSystem,
          JSON.stringify(prd, null, 2),
          anchorPageHtml,
          previousHtml,
          judgeFeedback,
        );
      }
    } else if (prd && typeof prd === 'string') {
      // PRD is a markdown string
      userPrompt = buildPageDesignPromptFromMarkdown(
        pageName,
        pageDescription || `${pageName} page`,
        userFlowSteps || [],
        designSystem,
        prd,
        anchorPageHtml,
        previousHtml,
        judgeFeedback,
      );
    } else {
      // No PRD at all — still try with just the page info + design system
      userPrompt = buildPageDesignPromptFromMarkdown(
        pageName,
        pageDescription || `${pageName} page`,
        userFlowSteps || [],
        designSystem,
        '(PRD not available — use the page description and design system to guide your design)',
        anchorPageHtml,
        previousHtml,
        judgeFeedback,
      );
    }

    const response = await llm.chat({
      systemPrompt: DESIGN_DIRECTOR_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 16384,
      temperature: 0.7,
    });

    const htmlContent = extractHTML(response.content);

    console.log(`[generate-page-design] "${pageName}" completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s (${htmlContent.length} chars)`);

    return NextResponse.json({ htmlContent });
  } catch (error) {
    console.error('Error generating page design:', error);
    return NextResponse.json(
      { error: 'Failed to generate page design. Please try again.' },
      { status: 500 }
    );
  }
}
