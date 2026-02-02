import OpenAI from 'openai';
import type { LLMProvider, ChatRequest, ChatResponse, ChatChunk } from '../types';

// GPT-5.2 model configuration
const DEFAULT_MODEL = 'gpt-5.2';
const MAX_COMPLETION_TOKENS = 65536; // Very high limit - GPT-5.2 reasoning can consume a lot
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
    const MAX_RETRIES = 3;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        // On retries, increase token limit dramatically to leave room after reasoning
        if (attempt > 0 && isGpt5) {
          const newLimit = MAX_COMPLETION_TOKENS * (attempt + 1); // 65536, 131072, 196608...
          console.log(`[OpenAI] Retry ${attempt}: Increasing max_completion_tokens to ${newLimit}`);
          (completionRequest as unknown as Record<string, unknown>).max_completion_tokens = Math.min(newLimit, 128000);
        }

        console.log('[OpenAI] Making API request...', attempt > 0 ? `(retry ${attempt})` : '');
        const startTime = Date.now();

        const response = await this.client.chat.completions.create(completionRequest);

        console.log('[OpenAI] Response received in', Date.now() - startTime, 'ms');
        console.log('[OpenAI] Model used:', response.model);
        console.log('[OpenAI] Usage:', response.usage);

        const content = response.choices[0].message.content || '';

        // Check for empty response due to reasoning using all tokens
        if (isGpt5) {
          const usage = response.usage as {
            completion_tokens?: number;
            completion_tokens_details?: { reasoning_tokens?: number };
          };
          const completionTokens = usage?.completion_tokens || 0;
          const reasoningTokens = usage?.completion_tokens_details?.reasoning_tokens || 0;

          if (!content.trim() && completionTokens > 0 && reasoningTokens >= completionTokens * 0.9) {
            console.log('[OpenAI] WARNING: Empty response - reasoning used most tokens');
            console.log(`[OpenAI] Reasoning tokens: ${reasoningTokens}/${completionTokens}`);

            if (attempt < MAX_RETRIES) {
              continue;
            }
          }
        }

        // If we have content, return it
        if (content.trim()) {
          return {
            content,
            usage: {
              promptTokens: response.usage?.prompt_tokens || 0,
              completionTokens: response.usage?.completion_tokens || 0,
            },
            model: response.model,
            finishReason: response.choices[0].finish_reason || 'stop',
          };
        }

        // Empty content but not due to reasoning - still retry
        if (attempt < MAX_RETRIES) {
          console.log('[OpenAI] Empty response, retrying...');
          continue;
        }

        // Final attempt with empty content
        return {
          content: '',
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
