/**
 * Review System Types for Auto-Review and Continuation
 */

export type ReviewStatus = 'COMPLETE' | 'PARTIAL' | 'INCOMPLETE' | 'ERROR' | 'PENDING';

export interface RequirementReview {
  id: string;
  description: string;
  status: 'COMPLETE' | 'PARTIAL' | 'MISSING';
  evidence?: string;
  notes?: string;
}

export interface MissingItem {
  description: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  suggestedFix?: string;
}

export interface SetupInstructions {
  envVars: string[];
  installCommands: string[];
  buildCommand: string;
  testCommand: string;
  runCommand: string;
}

export interface ReviewResult {
  reviewStatus: ReviewStatus;
  overallScore: number;
  requirements: RequirementReview[];
  missingItems: MissingItem[];
  setupInstructions: SetupInstructions;
  testingNotes: string;
  summary: string;
  timestamp: number;
  reviewDurationMs?: number;
  rawOutput?: string; // Store raw output for debugging
}

export interface AutoContinueConfig {
  enabled: boolean;
  maxAutoIterations: number;
  currentAutoIteration: number;
}

export interface ReviewConfig {
  projectPath: string;
  sessionId: string;
  model: string;
  claudeCliPath?: string;
}
