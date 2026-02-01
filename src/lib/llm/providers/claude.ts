import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, ChatRequest, ChatResponse, ChatChunk } from '../types';

export class ClaudeProvider implements LLMProvider {
  name = 'claude' as const;
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({
      apiKey,
    });
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const messages: Anthropic.MessageParam[] = request.messages.map((msg) => ({
      role: msg.role === 'system' ? 'user' : msg.role,
      content: msg.content,
    }));

    const response = await this.client.messages.create({
      model: request.model || 'claude-opus-4-5-20251101', // Opus 4.5
      max_tokens: request.maxTokens || 4096,
      system: request.systemPrompt,
      messages,
    });

    const textContent = response.content.find((c) => c.type === 'text');

    return {
      content: textContent?.type === 'text' ? textContent.text : '',
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
      },
      model: response.model,
      finishReason: response.stop_reason || 'end_turn',
    };
  }

  async *streamChat(request: ChatRequest): AsyncIterable<ChatChunk> {
    const messages: Anthropic.MessageParam[] = request.messages.map((msg) => ({
      role: msg.role === 'system' ? 'user' : msg.role,
      content: msg.content,
    }));

    const stream = this.client.messages.stream({
      model: request.model || 'claude-opus-4-5-20251101',
      max_tokens: request.maxTokens || 4096,
      system: request.systemPrompt,
      messages,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        const delta = event.delta;
        if (delta.type === 'text_delta') {
          yield {
            delta: delta.text,
          };
        }
      }
      if (event.type === 'message_stop') {
        yield {
          delta: '',
          finishReason: 'end_turn',
        };
      }
    }
  }
}
