// ----- Design System Types -----

export interface ColorToken {
  name: string;           // e.g., "primary-500"
  value: string;          // e.g., "#3B82F6"
  usage: string;          // e.g., "Primary buttons, links"
}

export interface ColorPalette {
  primary: ColorToken[];
  secondary: ColorToken[];
  accent: ColorToken[];
  neutral: ColorToken[];
  semantic: {
    success: string;
    warning: string;
    error: string;
    info: string;
  };
  background: {
    primary: string;
    secondary: string;
    tertiary: string;
  };
  text: {
    primary: string;
    secondary: string;
    muted: string;
    inverse: string;
  };
}

export interface TypographyToken {
  name: string;           // e.g., "heading-1"
  fontFamily: string;     // e.g., "'Inter', sans-serif"
  fontSize: string;       // e.g., "2.25rem"
  fontWeight: number;     // e.g., 700
  lineHeight: string;     // e.g., "1.2"
  letterSpacing: string;  // e.g., "-0.02em"
  usage: string;          // e.g., "Page titles"
}

export interface SpacingScale {
  unit: number;           // base unit in px (4 or 8)
  scale: Record<string, string>; // e.g., { "xs": "4px", "sm": "8px", ... }
}

export interface DesignSystem {
  name: string;           // Creative name for the design direction
  description: string;    // Brief design philosophy statement
  colors: ColorPalette;
  typography: {
    fontFamilies: {
      heading: string;
      body: string;
      mono: string;
    };
    scale: TypographyToken[];
  };
  spacing: SpacingScale;
  borderRadius: Record<string, string>;
  shadows: Record<string, string>;
  transitions: Record<string, string>;
  componentTokens?: Record<string, Record<string, string>>;
  rawCSS?: string;        // Generated CSS custom properties block
}

// ----- Judge Types -----

export type DesignJudgeCriterion =
  | 'visual_hierarchy'
  | 'typography'
  | 'color_contrast'
  | 'spacing_layout'
  | 'component_design'
  | 'innovation'
  | 'consistency';

export interface JudgeScore {
  criterion: DesignJudgeCriterion;
  score: number;          // 0-100
  feedback: string;       // Specific feedback for this criterion
}

export interface DesignJudgeResult {
  overallScore: number;   // 0-100 (weighted average)
  scores: JudgeScore[];
  passed: boolean;        // overallScore >= threshold
  strengths: string[];    // What works well
  issues: string[];       // Specific problems to fix
  suggestions: string[];  // Targeted improvement suggestions
  iterationCount: number; // Which iteration produced this result
}

// ----- Page Design Types -----

export type PageDesignStatus =
  | 'pending'
  | 'generating'
  | 'judging'
  | 'iterating'
  | 'passed'
  | 'failed'
  | 'approved';

export interface PageDesign {
  id: string;             // Slug-based ID, e.g., "dashboard"
  name: string;           // Human-readable, e.g., "Dashboard"
  description: string;    // What this page is for
  userFlowRef: string;    // Which PRD user flow this maps to
  htmlContent: string;    // Complete self-contained HTML with inline CSS/Tailwind
  judgeResult: DesignJudgeResult | null;
  iterationHistory: Array<{
    iteration: number;
    score: number;
    feedback: string[];
  }>;
  status: PageDesignStatus;
}

// ----- Cross-Page Consistency Types -----

export interface ConsistencyIssue {
  pages: string[];        // Which pages are inconsistent
  description: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface ConsistencyCheckResult {
  overallScore: number;
  passed: boolean;
  issues: ConsistencyIssue[];
  summary: string;
}
