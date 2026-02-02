import OpenAI from 'openai';
import type { LLMProvider, ChatRequest, ChatResponse, ChatChunk } from '../types';

// GPT-5.2 model configuration
const DEFAULT_MODEL = 'gpt-5.2';
const MAX_COMPLETION_TOKENS = 16384; // Conservative default, can go up to 128k
const DEFAULT_TIMEOUT = 300000; // 5 minutes timeout (GPT-5.2 reasoning can take time)

export class OpenAIProvider implements LLMProvider {
  name = 'openai' as const;
  private client: OpenAI;

  constructor(apiKey: string) {
    // Log API key prefix for debugging (safe to log first few chars)
    console.log('[OpenAI] Initializing with key prefix:', apiKey.substring(0, 8) + '...');

    this.client = new OpenAI({
      apiKey,
      timeout: DEFAULT_TIMEOUT,
      maxRetries: 3,
    });
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const model = request.model || DEFAULT_MODEL;
    console.log('[OpenAI] chat() called with model:', model);

    const messages: OpenAI.ChatCompletionMessageParam[] = [];

    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }

    for (const msg of request.messages) {
      messages.push({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content,
      });
    }

    console.log('[OpenAI] Message count:', messages.length);
    console.log('[OpenAI] System prompt length:', request.systemPrompt?.length || 0);
    console.log('[OpenAI] Total content size:', JSON.stringify(messages).length, 'chars');

    // Build request - use max_completion_tokens for GPT-5.x reasoning models
    const isGpt5 = model.startsWith('gpt-5');
    const completionRequest: OpenAI.ChatCompletionCreateParamsNonStreaming = {
      model,
      messages,
      temperature: request.temperature ?? 0.7,
    };

    // GPT-5.x uses max_completion_tokens, older models use max_tokens
    if (isGpt5) {
      (completionRequest as unknown as Record<string, unknown>).max_completion_tokens = request.maxTokens || MAX_COMPLETION_TOKENS;
    } else {
      completionRequest.max_tokens = request.maxTokens || MAX_COMPLETION_TOKENS;
    }

    // Add reasoning parameters for GPT-5.x if specified
    if (isGpt5 && request.reasoningEffort && request.reasoningEffort !== 'none') {
      (completionRequest as unknown as Record<string, unknown>).reasoning = {
        effort: request.reasoningEffort,
        summary: 'auto',
      };
      // Temperature not allowed with reasoning
      delete (completionRequest as unknown as Record<string, unknown>).temperature;
    }

    console.log('[OpenAI] Request config:', JSON.stringify({
      model: completionRequest.model,
      messageCount: messages.length,
      temperature: completionRequest.temperature,
      isGpt5,
      hasReasoning: !!request.reasoningEffort && request.reasoningEffort !== 'none',
    }));

    // Retry logic for empty responses (GPT-5.x can use all tokens for reasoning)
    const MAX_RETRIES = 2;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log('[OpenAI] Making API request...', attempt > 0 ? `(retry ${attempt})` : '');
        const startTime = Date.now();

        const response = await this.client.chat.completions.create(completionRequest);

        console.log('[OpenAI] Response received in', Date.now() - startTime, 'ms');
        console.log('[OpenAI] Model used:', response.model);
        console.log('[OpenAI] Usage:', response.usage);

        const content = response.choices[0].message.content || '';

        // Check for empty response due to reasoning using all tokens
        const usage = response.usage as {
          completion_tokens?: number;
          completion_tokens_details?: { reasoning_tokens?: number };
        };
        const completionTokens = usage?.completion_tokens || 0;
        const reasoningTokens = usage?.completion_tokens_details?.reasoning_tokens || 0;

        if (!content.trim() && completionTokens > 0 && reasoningTokens >= completionTokens * 0.95) {
          console.log('[OpenAI] WARNING: Empty response - all tokens used for reasoning');
          console.log(`[OpenAI] Reasoning tokens: ${reasoningTokens}/${completionTokens}`);

          if (attempt < MAX_RETRIES) {
            console.log('[OpenAI] Retrying with explicit output instruction...');
            // Add explicit instruction to output content
            const lastUserMsg = messages.findLast(m => m.role === 'user');
            if (lastUserMsg && typeof lastUserMsg.content === 'string') {
              lastUserMsg.content = lastUserMsg.content + '\n\nIMPORTANT: You MUST provide a complete written response. Do not just think - output your answer.';
            }
            continue;
          }
        }

        // If we have content or this is our last attempt, return
        return {
          content,
          usage: {
            promptTokens: response.usage?.prompt_tokens || 0,
            completionTokens: response.usage?.completion_tokens || 0,
          },
          model: response.model,
          finishReason: response.choices[0].finish_reason || 'stop',
        };
      } catch (error) {
        console.error('[OpenAI] API request failed:', error);

        // Extract detailed error info
        const err = error as {
          status?: number;
          code?: string;
          type?: string;
          message?: string;
          cause?: { cause?: { code?: string; socket?: unknown } };
        };

        console.error('[OpenAI] Error details:', {
          status: err.status,
          code: err.code,
          type: err.type,
          message: err.message,
          causeCode: err.cause?.cause?.code,
          socket: err.cause?.cause?.socket,
        });

        throw error;
      }
    }

    // If we exhausted retries without returning, throw an error
    throw new Error('Failed to get response from OpenAI after retries');
  }

  async *streamChat(request: ChatRequest): AsyncIterable<ChatChunk> {
    const model = request.model || DEFAULT_MODEL;
    console.log('[OpenAI] streamChat() called with model:', model);

    const messages: OpenAI.ChatCompletionMessageParam[] = [];

    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }

    for (const msg of request.messages) {
      messages.push({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content,
      });
    }

    const isGpt5 = model.startsWith('gpt-5');
    const completionRequest: OpenAI.ChatCompletionCreateParamsStreaming = {
      model,
      messages,
      temperature: request.temperature ?? 0.7,
      stream: true,
    };

    if (isGpt5) {
      (completionRequest as unknown as Record<string, unknown>).max_completion_tokens = request.maxTokens || MAX_COMPLETION_TOKENS;
    } else {
      completionRequest.max_tokens = request.maxTokens || MAX_COMPLETION_TOKENS;
    }

    if (isGpt5 && request.reasoningEffort && request.reasoningEffort !== 'none') {
      (completionRequest as unknown as Record<string, unknown>).reasoning = {
        effort: request.reasoningEffort,
        summary: 'auto',
      };
      delete (completionRequest as unknown as Record<string, unknown>).temperature;
    }

    try {
      console.log('[OpenAI] Starting stream...');
      const stream = await this.client.chat.completions.create(completionRequest);

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || '';
        yield {
          delta,
          finishReason: chunk.choices[0]?.finish_reason || undefined,
        };
      }
      console.log('[OpenAI] Stream completed');
    } catch (error) {
      console.error('[OpenAI] Stream failed:', error);
      throw error;
    }
  }
}
