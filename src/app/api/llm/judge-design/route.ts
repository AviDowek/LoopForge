import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { createProvider } from '@/lib/llm';
import {
  DESIGN_JUDGE_SYSTEM_PROMPT,
  buildJudgeUserPrompt,
} from '@/lib/design/designPrompts';
import type { DesignJudgeResult } from '@/types/design';

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
 * Extract JSON from LLM response
 */
function extractJSON(text: string): string {
  let jsonStr = text.trim();

  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  return jsonStr;
}

/**
 * Validate and fix judge result to ensure correct structure
 */
function validateJudgeResult(raw: Record<string, unknown>, threshold: number): DesignJudgeResult {
  const scores = Array.isArray(raw.scores) ? raw.scores : [];
  const overallScore = typeof raw.overallScore === 'number'
    ? Math.max(0, Math.min(100, raw.overallScore))
    : 50;

  return {
    overallScore,
    scores: scores.map((s: Record<string, unknown>) => ({
      criterion: String(s.criterion || 'visual_hierarchy'),
      score: typeof s.score === 'number' ? Math.max(0, Math.min(100, s.score)) : 50,
      feedback: String(s.feedback || ''),
    })) as DesignJudgeResult['scores'],
    passed: overallScore >= threshold,
    strengths: Array.isArray(raw.strengths) ? raw.strengths.map(String) : [],
    issues: Array.isArray(raw.issues) ? raw.issues.map(String) : [],
    suggestions: Array.isArray(raw.suggestions) ? raw.suggestions.map(String) : [],
    iterationCount: typeof raw.iterationCount === 'number' ? raw.iterationCount : 1,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { htmlContent, designSystem, pageName, threshold = 80, provider, iterationCount = 1 } = body;

    if (!htmlContent || !designSystem || !pageName) {
      return NextResponse.json(
        { error: 'htmlContent, designSystem, and pageName are required' },
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

    console.log(`[judge-design] Judging "${pageName}" (threshold: ${threshold})...`);
    const startTime = Date.now();

    const response = await llm.chat({
      systemPrompt: DESIGN_JUDGE_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: buildJudgeUserPrompt(htmlContent, designSystem, pageName, threshold),
      }],
      maxTokens: 4096,
      temperature: 0.3,
    });

    const jsonStr = extractJSON(response.content);
    let judgeResult: DesignJudgeResult;

    try {
      const raw = JSON.parse(jsonStr);
      judgeResult = validateJudgeResult(raw, threshold);
      judgeResult.iterationCount = iterationCount;
    } catch (parseError) {
      console.error('Failed to parse judge result JSON:', parseError);
      // Return a failing score so iteration continues
      judgeResult = {
        overallScore: 0,
        scores: [],
        passed: false,
        strengths: [],
        issues: ['Judge failed to parse response — regenerate to get a proper evaluation'],
        suggestions: ['Try regenerating this page design'],
        iterationCount,
      };
    }

    console.log(`[judge-design] "${pageName}" scored ${judgeResult.overallScore}/100 (${judgeResult.passed ? 'PASS' : 'FAIL'}) in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

    return NextResponse.json({ judgeResult });
  } catch (error) {
    console.error('Error judging design:', error);
    return NextResponse.json(
      { error: 'Failed to judge design. Please try again.' },
      { status: 500 }
    );
  }
}
