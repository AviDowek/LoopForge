// Project types
export type ProjectStatus =
  | 'initialized'
  | 'prd_generated'
  | 'specs_ready'
  | 'running'
  | 'paused'
  | 'completed'
  | 'error';

export type LLMProvider = 'openai' | 'claude';

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  shortPrompt: string;
  path: string;
  status: ProjectStatus;
  llmProvider: LLMProvider;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectWithProgress extends Project {
  tasksCompleted: number;
  totalTasks: number;
}

// Task types
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
export type TaskType = 'infrastructure' | 'code' | 'test' | 'documentation';

export interface Task {
  id: string; // E0-S1-T1 format
  projectId: string;
  epicId: string;
  storyId: string;
  title: string;
  type: TaskType;
  status: TaskStatus;
  hoursEstimate: number | null;
  files: string[];
  acceptance: string[];
  dependencies: string[];
  completedAt: Date | null;
  createdAt: Date;
}

// Loop types
export type LoopStatus = 'running' | 'paused' | 'completed' | 'failed' | 'stopped';
export type LoopMode = 'plan' | 'build';

export interface LoopSession {
  id: string;
  projectId: string;
  mode: LoopMode;
  promptFile: string;
  model: string;
  status: LoopStatus;
  currentTaskId: string | null;
  iterationCount: number;
  pid: number | null;
  startedAt: Date;
  endedAt: Date | null;
  errorMessage: string | null;
}

export interface LoopLog {
  id: number;
  sessionId: string;
  timestamp: Date;
  logType: 'stdout' | 'stderr' | 'system' | 'ralph_status';
  content: string;
  parsedJson: object | null;
}

// Ralph Status (parsed from CLI output)
export interface RalphStatus {
  taskCompleted: string;
  filesCreated: string[];
  nextTask: string;
  exitSignal: boolean;
  notes: string;
}

// Stream events
export interface StreamEvent {
  type: 'stdout' | 'stderr' | 'system' | 'ralph_status' | 'complete' | 'error';
  timestamp: number;
  data: unknown;
}

// PRD types
export interface PRDMeta {
  project_name: string;
  full_name: string;
  version: string;
  methodology: string;
  target_platform: string;
  primary_language: string;
  architecture: string;
}

export interface PRDTask {
  id: string;
  title: string;
  type: TaskType;
  hours: number;
  deps: string[];
  files: string[];
  acceptance: string[];
}

export interface PRDUserStory {
  id: string;
  title: string;
  tasks: PRDTask[];
}

export interface PRDEpic {
  id: string;
  name: string;
  priority: string;
  phase: number;
  user_stories: PRDUserStory[];
}

export interface PRDSummary {
  total_epics: number;
  total_stories: number;
  total_tasks: number;
  estimated_hours: number;
}

export interface PRD {
  meta: PRDMeta;
  tech_stack: Record<string, string>;
  epics: PRDEpic[];
  summary: PRDSummary;
}

// File tree types
export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileNode[];
  modified?: Date;
}

// Settings
export interface AppSettings {
  llmProvider: LLMProvider;
  openaiApiKey: string | null;
  anthropicApiKey: string | null;
  projectsBasePath: string;
}

// Wizard state
export interface WizardState {
  currentStep: number;
  projectName: string;
  projectDescription: string;
  shortPrompt: string;
  llmProvider: LLMProvider;
  generatedPRD: PRD | null;
  prdApproved: boolean;
  generatedFiles: GeneratedFile[];
  fileApprovals: Record<string, boolean>;
}

export interface GeneratedFile {
  path: string;
  content: string;
  type: 'prompt' | 'spec' | 'plan' | 'config' | 'script';
}

// Review types
export * from './review';

// E2E Visual Testing types
export * from './e2e';
