import { z } from 'zod';

// Chat message types
export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// GPT-5.2 reasoning effort levels
export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh';

export interface ChatRequest {
  messages: Message[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  // GPT-5.2 specific parameters
  reasoningEffort?: ReasoningEffort;
  includeReasoning?: boolean;
}

export interface ChatResponse {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
  };
  model: string;
  finishReason: string;
}

export interface ChatChunk {
  delta: string;
  finishReason?: string;
}

export interface StructuredRequest<T> {
  messages: Message[];
  schema: z.ZodSchema<T>;
  model?: string;
  systemPrompt?: string;
}

// LLM Provider interface
export interface LLMProvider {
  name: 'openai' | 'claude';
  chat(request: ChatRequest): Promise<ChatResponse>;
  streamChat(request: ChatRequest): AsyncIterable<ChatChunk>;
}

// PRD Schema for structured generation
export const PRDTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.enum(['infrastructure', 'code', 'test', 'documentation']),
  hours: z.number(),
  deps: z.array(z.string()),
  files: z.array(z.string()),
  acceptance: z.array(z.string()),
});

export const PRDUserStorySchema = z.object({
  id: z.string(),
  title: z.string(),
  tasks: z.array(PRDTaskSchema),
});

export const PRDEpicSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  priority: z.string(),
  phase: z.number(),
  user_stories: z.array(PRDUserStorySchema),
});

// Product-focused sections
export const PRDTargetUserSchema = z.object({
  persona: z.string(),
  description: z.string(),
  goals: z.array(z.string()),
});

export const PRDFeatureSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  user_stories: z.array(z.string()).optional(),
  priority: z.string(),
  complexity: z.string(),
});

export const PRDUserFlowSchema = z.object({
  name: z.string(),
  description: z.string(),
  steps: z.array(z.string()),
});

export const PRDDataModelSchema = z.object({
  name: z.string(),
  description: z.string(),
  fields: z.array(z.string()),
  relationships: z.array(z.string()).optional(),
});

export const PRDSchema = z.object({
  meta: z.object({
    project_name: z.string(),
    full_name: z.string(),
    version: z.string(),
    methodology: z.string(),
    target_platform: z.string(),
    primary_language: z.string(),
    architecture: z.string(),
  }),
  // Product sections (comprehensive product description)
  product: z.object({
    vision: z.string(),
    problem_statement: z.string(),
    target_users: z.array(PRDTargetUserSchema),
    value_proposition: z.string(),
  }).optional(),
  features: z.array(PRDFeatureSchema).optional(),
  scope: z.object({
    in_scope: z.array(z.string()),
    out_of_scope: z.array(z.string()),
    assumptions: z.array(z.string()).optional(),
  }).optional(),
  user_flows: z.array(PRDUserFlowSchema).optional(),
  data_models: z.array(PRDDataModelSchema).optional(),
  // Technical sections
  tech_stack: z.record(z.string(), z.string()),
  epics: z.array(PRDEpicSchema),
  summary: z.object({
    total_epics: z.number(),
    total_stories: z.number(),
    total_tasks: z.number(),
    estimated_hours: z.number(),
    feature_count: z.number().optional(),
  }),
});

export type PRDType = z.infer<typeof PRDSchema>;
