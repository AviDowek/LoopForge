/**
 * Visual Analysis Prompt Generator
 *
 * Generates prompts for Claude to analyze screenshots using vision capabilities
 */

interface VisualAnalysisContext {
  screenshotDescription: string;
  viewport: {
    width: number;
    height: number;
    deviceName?: string;
  };
  expectedUI?: string;
  previousScreenshot?: string;
  userAction?: string;
  projectContext?: string;
}

export function generateVisualAnalysisPrompt(context: VisualAnalysisContext): string {
  const deviceInfo = context.viewport.deviceName
    ? `Device: ${context.viewport.deviceName} (${context.viewport.width}x${context.viewport.height})`
    : `Viewport: ${context.viewport.width}x${context.viewport.height}`;

  return `# Visual Analysis Request

Analyze this screenshot of a web application.

## Screenshot Context
- **Description:** ${context.screenshotDescription}
- **${deviceInfo}**
${context.expectedUI ? `- **Expected UI:** ${context.expectedUI}` : ''}
${context.userAction ? `- **User action just taken:** ${context.userAction}` : ''}
${context.projectContext ? `- **Project context:** ${context.projectContext}` : ''}

## Analysis Instructions

Carefully examine the screenshot and identify any issues in these categories:

### 1. Layout Issues
- Elements overlapping or cut off
- Improper spacing, margins, or padding
- Content overflowing containers
- Responsive design problems for this viewport size
- Misaligned elements

### 2. Content Issues
- Missing text, images, or data
- Placeholder content still visible (e.g., "Lorem ipsum", "TODO", "[placeholder]")
- Incorrect or garbled text
- Missing icons or broken images
- Truncated content that shouldn't be truncated

### 3. Style Issues
- Color/contrast problems (hard to read text)
- Inconsistent font sizes or families
- Missing or broken styling
- Elements that look visually broken
- Poor visual hierarchy

### 4. Functionality Indicators
- Error messages visible on screen
- Stuck loading states or spinners
- Empty states that shouldn't be empty
- Console errors shown in UI
- Form validation issues visible

### 5. Accessibility Concerns
- Very small text (hard to read)
- Small touch targets (buttons too small)
- Poor color contrast
- Missing visible focus indicators
- Content that would be inaccessible

## Output Format

Return your analysis as valid JSON in a code block:

\`\`\`json
{
  "findings": [
    {
      "type": "layout|content|style|accessibility|functionality",
      "description": "Clear, specific description of the issue",
      "priority": "HIGH|MEDIUM|LOW",
      "suggestedFix": "Specific suggestion on how to fix this issue",
      "location": "Where on screen (e.g., 'header navigation', 'main content area', 'footer')"
    }
  ],
  "overallAssessment": "Brief 1-2 sentence summary of the UI quality",
  "passesVisualCheck": true
}
\`\`\`

## Priority Guidelines

- **HIGH**: Blocking issues that prevent normal use, major visual bugs, broken functionality
- **MEDIUM**: Noticeable issues that affect user experience but don't block usage
- **LOW**: Minor polish issues, nice-to-haves, slight inconsistencies

## Important Notes

1. Only report actual issues you can see in the screenshot
2. Be specific about locations - reference visible UI elements
3. Don't speculate about hidden functionality - only assess what's visible
4. If the UI looks correct and functional, return an empty findings array
5. Set passesVisualCheck to false if there are any HIGH priority issues
`;
}

/**
 * Generate a batch analysis prompt for multiple screenshots
 */
export function generateBatchAnalysisPrompt(
  screenshots: Array<{
    id: string;
    description: string;
    viewport: { width: number; height: number; deviceName?: string };
  }>,
  projectContext?: string
): string {
  const screenshotList = screenshots
    .map(
      (s, i) =>
        `${i + 1}. **${s.id}**: ${s.description} (${s.viewport.width}x${s.viewport.height})`
    )
    .join('\n');

  return `# Batch Visual Analysis Request

Analyze the following ${screenshots.length} screenshots from a web application.

## Screenshots to Analyze
${screenshotList}

${projectContext ? `## Project Context\n${projectContext}\n` : ''}

## Analysis Instructions

For EACH screenshot, identify issues in these categories:
1. **Layout** - Overlapping, misalignment, overflow, responsiveness
2. **Content** - Missing content, placeholders, broken images
3. **Style** - Visual bugs, inconsistencies, contrast issues
4. **Functionality** - Error states, loading issues, broken features
5. **Accessibility** - Small text, poor contrast, small touch targets

## Output Format

Return your analysis as JSON:

\`\`\`json
{
  "screenshotAnalysis": [
    {
      "screenshotId": "screenshot_id_here",
      "findings": [
        {
          "type": "layout|content|style|accessibility|functionality",
          "description": "Clear description of issue",
          "priority": "HIGH|MEDIUM|LOW",
          "suggestedFix": "How to fix it",
          "location": "Where on screen"
        }
      ],
      "passesVisualCheck": true
    }
  ],
  "overallSummary": "Summary of all screenshots",
  "overallScore": 85
}
\`\`\`

Focus on actionable issues. Empty findings array is fine if screenshot looks correct.
`;
}
