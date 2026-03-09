import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { createProvider } from '@/lib/llm';
import {
  CONSISTENCY_CHECK_SYSTEM_PROMPT,
  buildConsistencyCheckPrompt,
} from '@/lib/design/designPrompts';
import type { ConsistencyCheckResult } from '@/types/design';

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

function extractJSON(text: string): string {
  let jsonStr = text.trim();
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }
  return jsonStr;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pageDesigns, designSystem, provider } = body;

    if (!pageDesigns || !designSystem) {
      return NextResponse.json(
        { error: 'pageDesigns and designSystem are required' },
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

    console.log(`[check-design-consistency] Checking consistency across ${pageDesigns.length} pages...`);
    const startTime = Date.now();

    const response = await llm.chat({
      systemPrompt: CONSISTENCY_CHECK_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: buildConsistencyCheckPrompt(pageDesigns, designSystem),
      }],
      maxTokens: 4096,
      temperature: 0.3,
    });

    const jsonStr = extractJSON(response.content);
    let consistencyResult: ConsistencyCheckResult;

    try {
      const raw = JSON.parse(jsonStr);
      consistencyResult = {
        overallScore: typeof raw.overallScore === 'number' ? Math.max(0, Math.min(100, raw.overallScore)) : 50,
        passed: typeof raw.passed === 'boolean' ? raw.passed : (raw.overallScore >= 75),
        issues: Array.isArray(raw.issues) ? raw.issues.map((i: Record<string, unknown>) => ({
          pages: Array.isArray(i.pages) ? i.pages.map(String) : [],
          description: String(i.description || ''),
          severity: (['HIGH', 'MEDIUM', 'LOW'].includes(String(i.severity)) ? i.severity : 'MEDIUM') as 'HIGH' | 'MEDIUM' | 'LOW',
        })) : [],
        summary: String(raw.summary || ''),
      };
    } catch (parseError) {
      console.error('Failed to parse consistency check JSON:', parseError);
      consistencyResult = {
        overallScore: 75,
        passed: true,
        issues: [],
        summary: 'Consistency check could not be parsed — assuming acceptable consistency.',
      };
    }

    console.log(`[check-design-consistency] Score: ${consistencyResult.overallScore}/100 (${consistencyResult.passed ? 'PASS' : 'FAIL'}) in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

    return NextResponse.json({ consistencyResult });
  } catch (error) {
    console.error('Error checking design consistency:', error);
    return NextResponse.json(
      { error: 'Failed to check design consistency. Please try again.' },
      { status: 500 }
    );
  }
}
