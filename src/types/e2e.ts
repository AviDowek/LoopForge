/**
 * E2E Visual Testing Type Definitions
 *
 * Types for Playwright-based visual testing with Claude vision analysis
 */

export type E2ETestStatus = 'PASS' | 'PARTIAL' | 'FAIL' | 'ERROR' | 'RUNNING' | 'PENDING';

export interface ViewportConfig {
  name: string;
  width: number;
  height: number;
  deviceName?: string;
}

export interface ScreenshotCapture {
  id: string;
  timestamp: number;
  path: string;
  base64?: string;
  description: string;
  viewport: {
    width: number;
    height: number;
    deviceName?: string;
  };
}

export interface InteractionResult {
  action: 'navigate' | 'click' | 'fill' | 'scroll' | 'hover' | 'select' | 'wait';
  target: string;
  status: 'success' | 'error' | 'timeout';
  duration: number;
  screenshot?: string;
  error?: string;
  value?: string;
}

export type FindingType = 'layout' | 'content' | 'style' | 'accessibility' | 'functionality';
export type FindingPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export interface VisualFinding {
  id: string;
  type: FindingType;
  description: string;
  screenshotId: string;
  priority: FindingPriority;
  suggestedFix?: string;
  location?: string;
  coordinates?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface E2ETestResult {
  testStatus: E2ETestStatus;
  visualScore: number;
  screenshots: ScreenshotCapture[];
  interactions: InteractionResult[];
  findings: VisualFinding[];
  devServerUrl: string;
  browserUsed: string;
  testDurationMs: number;
  timestamp: number;
  summary: string;
}

export interface TestScenario {
  name: string;
  description?: string;
  steps: TestStep[];
}

export interface TestStep {
  action: InteractionResult['action'];
  target?: string;
  value?: string;
  description?: string;
  waitFor?: string;
  takeScreenshot?: boolean;
}

export interface E2ETestConfig {
  enabled: boolean;
  projectPath: string;
  sessionId: string;
  headless: boolean;
  viewports: ViewportConfig[];
  testScenarios: TestScenario[];
  screenshotOnEveryAction: boolean;
  timeout: number;
  devServerCommand: string;
  devServerPort: number;
  devServerReadyTimeout: number;
  baseUrl: string;
  claudeCliPath?: string;
  model?: string;
  /** Enable AI-driven testing where Claude decides what to test (default: true) */
  aiDrivenTesting?: boolean;
  /** Max AI test iterations per viewport (default: 15) */
  aiMaxIterations?: number;
}

export interface E2EAutoConfig {
  enabled: boolean;
  headless: boolean;
  autoFix: boolean;
  maxAutoIterations: number;
  currentAutoIteration: number;
  viewports: string[];
}

export interface VisualAnalysisResult {
  findings: Array<{
    type: FindingType;
    description: string;
    priority: FindingPriority;
    suggestedFix?: string;
    location?: string;
  }>;
  overallAssessment: string;
  passesVisualCheck: boolean;
}
