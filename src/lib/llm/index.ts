import { OpenAIProvider } from './providers/openai';
import { ClaudeProvider } from './providers/claude';
import type { LLMProvider } from './types';

export type { LLMProvider, ChatRequest, ChatResponse, ChatChunk, Message } from './types';
export { PRDSchema, type PRDType } from './types';
export { OpenAIProvider } from './providers/openai';
export { ClaudeProvider } from './providers/claude';

export function createProvider(
  type: 'openai' | 'claude',
  apiKey: string
): LLMProvider {
  switch (type) {
    case 'openai':
      return new OpenAIProvider(apiKey);
    case 'claude':
      return new ClaudeProvider(apiKey);
    default:
      throw new Error(`Unknown provider type: ${type}`);
  }
}
