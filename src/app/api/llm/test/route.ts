import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';

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

export async function GET(request: NextRequest) {
  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    tests: [],
  };

  try {
    const settings = await readSettings();

    if (!settings.openaiApiKey) {
      return NextResponse.json({ error: 'No OpenAI API key configured' }, { status: 400 });
    }

    const apiKey = settings.openaiApiKey;
    results.apiKeyPrefix = apiKey.substring(0, 12) + '...';

    // Test 1: Simple HTTPS connectivity test to api.openai.com
    console.log('\n=== TEST 1: Basic HTTPS connectivity ===');
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const pingStart = Date.now();
      const pingResponse = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const pingTime = Date.now() - pingStart;
      const pingData = await pingResponse.json();

      (results.tests as unknown[]).push({
        name: 'Basic HTTPS to api.openai.com',
        success: pingResponse.ok,
        status: pingResponse.status,
        timeMs: pingTime,
        modelCount: pingResponse.ok ? pingData.data?.length : undefined,
        error: !pingResponse.ok ? pingData : undefined,
      });

      console.log(`Test 1 result: ${pingResponse.status} in ${pingTime}ms`);

      if (pingResponse.ok) {
        // Find GPT-5 models
        const gpt5Models = pingData.data?.filter((m: { id: string }) => m.id.includes('gpt-5')) || [];
        results.gpt5Models = gpt5Models.map((m: { id: string }) => m.id);
        console.log('GPT-5 models found:', results.gpt5Models);
      }
    } catch (e) {
      const error = e as Error;
      (results.tests as unknown[]).push({
        name: 'Basic HTTPS to api.openai.com',
        success: false,
        error: error.message,
        errorType: error.name,
      });
      console.error('Test 1 failed:', error.message);
    }

    // Test 2: Simple chat completion with gpt-4o-mini (fast, cheap)
    console.log('\n=== TEST 2: Chat completion (gpt-4o-mini) ===');
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const chatStart = Date.now();
      const chatResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Say "ok"' }],
          max_tokens: 5,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const chatTime = Date.now() - chatStart;
      const chatData = await chatResponse.json();

      (results.tests as unknown[]).push({
        name: 'Chat completion (gpt-4o-mini)',
        success: chatResponse.ok,
        status: chatResponse.status,
        timeMs: chatTime,
        response: chatResponse.ok ? chatData.choices?.[0]?.message?.content : undefined,
        error: !chatResponse.ok ? chatData : undefined,
      });

      console.log(`Test 2 result: ${chatResponse.status} in ${chatTime}ms`);
    } catch (e) {
      const error = e as Error;
      (results.tests as unknown[]).push({
        name: 'Chat completion (gpt-4o-mini)',
        success: false,
        error: error.message,
        errorType: error.name,
      });
      console.error('Test 2 failed:', error.message);
    }

    // Test 3: Try GPT-5.2 specifically
    console.log('\n=== TEST 3: Chat completion (gpt-5.2) ===');
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000); // 60s for GPT-5.2

      const gpt5Start = Date.now();
      const gpt5Response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-5.2',
          messages: [{ role: 'user', content: 'Say "ok"' }],
          max_completion_tokens: 5,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const gpt5Time = Date.now() - gpt5Start;
      const gpt5Data = await gpt5Response.json();

      (results.tests as unknown[]).push({
        name: 'Chat completion (gpt-5.2)',
        success: gpt5Response.ok,
        status: gpt5Response.status,
        timeMs: gpt5Time,
        response: gpt5Response.ok ? gpt5Data.choices?.[0]?.message?.content : undefined,
        error: !gpt5Response.ok ? gpt5Data : undefined,
      });

      console.log(`Test 3 result: ${gpt5Response.status} in ${gpt5Time}ms`);
      if (!gpt5Response.ok) {
        console.log('GPT-5.2 error:', JSON.stringify(gpt5Data, null, 2));
      }
    } catch (e) {
      const error = e as Error;
      (results.tests as unknown[]).push({
        name: 'Chat completion (gpt-5.2)',
        success: false,
        error: error.message,
        errorType: error.name,
      });
      console.error('Test 3 failed:', error.message);
    }

    // Summary
    const tests = results.tests as Array<{ success: boolean }>;
    results.summary = {
      totalTests: tests.length,
      passed: tests.filter(t => t.success).length,
      failed: tests.filter(t => !t.success).length,
    };

    return NextResponse.json(results);
  } catch (error) {
    console.error('Test suite failed:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
