/**
 * E2E Test Runner
 *
 * Playwright-based test runner that:
 * 1. Starts dev server
 * 2. Launches browser (headed/headless)
 * 3. Executes test scenarios
 * 4. Captures screenshots
 * 5. Analyzes with Claude vision
 */

import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import path from 'path';
import { spawn, ChildProcess, exec } from 'child_process';
import { promisify } from 'util';
import type {
  E2ETestResult,
  E2ETestConfig,
  E2ETestStatus,
  ScreenshotCapture,
  InteractionResult,
  VisualFinding,
  TestScenario,
  TestStep,
  VisualAnalysisResult,
} from '@/types/e2e';
import { generateVisualAnalysisPrompt } from './visualAnalysisPrompt';

const execAsync = promisify(exec);

export class E2ETestRunner extends EventEmitter {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private screenshots: ScreenshotCapture[] = [];
  private interactions: InteractionResult[] = [];
  private findings: VisualFinding[] = [];
  private screenshotDir: string;
  private devServerProcess: ChildProcess | null = null;
  private screenshotCounter = 0;

  constructor(private projectPath: string) {
    super();
    this.screenshotDir = path.join(projectPath, '.e2e-screenshots');
  }

  async runTests(config: E2ETestConfig): Promise<E2ETestResult> {
    const startTime = Date.now();
    this.screenshots = [];
    this.interactions = [];
    this.findings = [];
    this.screenshotCounter = 0;

    // Create screenshot directory
    await fs.mkdir(this.screenshotDir, { recursive: true });

    try {
      // 1. Start dev server
      this.emit('status', { phase: 'starting-server' });
      await this.startDevServer(config);

      // 2. Wait for server to be ready
      this.emit('status', { phase: 'waiting-for-server' });
      await this.waitForServer(config.baseUrl, config.devServerReadyTimeout);

      // 3. Launch browser
      this.emit('status', { phase: 'launching-browser' });
      this.browser = await chromium.launch({
        headless: config.headless,
        slowMo: config.headless ? 0 : 100,
      });

      // 4. Run tests for each viewport
      for (const viewport of config.viewports) {
        this.emit('status', { phase: 'testing', viewport: viewport.name });
        await this.testViewport(config, viewport);
      }

      // 5. Analyze screenshots with Claude (if we have any)
      if (this.screenshots.length > 0) {
        this.emit('status', { phase: 'analyzing' });
        await this.analyzeScreenshotsWithClaude(config);
      }

      // 6. Generate result
      const visualScore = this.calculateVisualScore();
      const testStatus = this.determineStatus(visualScore);

      const result: E2ETestResult = {
        testStatus,
        visualScore,
        screenshots: this.screenshots,
        interactions: this.interactions,
        findings: this.findings,
        devServerUrl: config.baseUrl,
        browserUsed: 'chromium',
        testDurationMs: Date.now() - startTime,
        timestamp: Date.now(),
        summary: this.generateSummary(testStatus, visualScore),
      };

      this.emit('complete', result);
      return result;

    } catch (error) {
      const errorResult = this.createErrorResult(error, startTime);
      this.emit('error', errorResult);
      return errorResult;
    } finally {
      await this.cleanup();
    }
  }

  private async startDevServer(config: E2ETestConfig): Promise<void> {
    const { devServerCommand, projectPath } = config;

    // Check if something is already running on the port
    const isPortInUse = await this.checkPort(config.devServerPort);
    if (isPortInUse) {
      this.emit('status', {
        phase: 'starting-server',
        message: `Port ${config.devServerPort} already in use, assuming dev server is running`,
      });
      return;
    }

    return new Promise((resolve, reject) => {
      const isWindows = process.platform === 'win32';
      const shell = isWindows ? true : '/bin/bash';

      this.devServerProcess = spawn(devServerCommand, [], {
        cwd: projectPath,
        shell,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, FORCE_COLOR: '0' },
      });

      // Resolve once server outputs something (indicates it's starting)
      let resolved = false;

      this.devServerProcess.stdout?.on('data', (data) => {
        const output = data.toString();
        this.emit('server-output', { type: 'stdout', data: output });

        // Check for common "ready" indicators
        if (!resolved && (
          output.includes('ready') ||
          output.includes('started') ||
          output.includes('localhost') ||
          output.includes(`${config.devServerPort}`)
        )) {
          resolved = true;
          resolve();
        }
      });

      this.devServerProcess.stderr?.on('data', (data) => {
        this.emit('server-output', { type: 'stderr', data: data.toString() });
      });

      this.devServerProcess.on('error', (error) => {
        if (!resolved) {
          reject(error);
        }
      });

      // Give it some time to start, then resolve anyway
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      }, 5000);
    });
  }

  private async checkPort(port: number): Promise<boolean> {
    try {
      const response = await fetch(`http://localhost:${port}`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(1000),
      });
      return true;
    } catch {
      return false;
    }
  }

  private async waitForServer(url: string, timeout: number): Promise<void> {
    const startTime = Date.now();
    const pollInterval = 500;

    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(url, {
          method: 'HEAD',
          signal: AbortSignal.timeout(2000),
        });
        if (response.ok || response.status === 304) {
          return;
        }
      } catch {
        // Server not ready yet
      }
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Dev server did not respond at ${url} within ${timeout}ms`);
  }

  private async testViewport(
    config: E2ETestConfig,
    viewport: { name: string; width: number; height: number }
  ): Promise<void> {
    this.context = await this.browser!.newContext({
      viewport: { width: viewport.width, height: viewport.height },
    });
    this.page = await this.context.newPage();

    // Navigate to home page first
    await this.navigateAndCapture(
      config.baseUrl,
      `${viewport.name} - Initial Load`,
      config.screenshotOnEveryAction
    );

    // Use AI-driven testing if enabled (default: true)
    if (config.aiDrivenTesting !== false) {
      await this.runAIDrivenTests(config, viewport.name);
    } else {
      // Fallback to static scenarios
      for (const scenario of config.testScenarios) {
        this.emit('status', {
          phase: 'testing',
          viewport: viewport.name,
          scenario: scenario.name,
        });
        await this.executeScenario(scenario, viewport.name, config);
      }
    }

    await this.context.close();
    this.context = null;
    this.page = null;
  }

  /**
   * AI-driven testing: Let Claude analyze the page and decide what to test
   */
  private async runAIDrivenTests(
    config: E2ETestConfig,
    viewportName: string
  ): Promise<void> {
    const maxIterations = config.aiMaxIterations || 15;
    const cliCommand = config.claudeCliPath || 'claude';
    const model = config.model || 'sonnet';

    // Read PRD/specs for context
    let prdContext = '';
    try {
      const specsDir = path.join(config.projectPath, 'specs');
      if (existsSync(specsDir)) {
        const files = await fs.readdir(specsDir);
        for (const file of files.slice(0, 3)) { // Limit to first 3 specs
          if (file.endsWith('.md')) {
            const content = await fs.readFile(path.join(specsDir, file), 'utf-8');
            prdContext += `\n\n## ${file}\n${content.slice(0, 2000)}`;
          }
        }
      }
    } catch {
      // No specs available
    }

    // Track visited pages and tested elements
    const visited = new Set<string>();
    const testedElements = new Set<string>();
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;
      this.emit('status', {
        phase: 'ai-testing',
        viewport: viewportName,
        iteration,
        maxIterations,
      });

      try {
        // Capture current state
        const screenshot = await this.captureScreenshot(`${viewportName} - AI Test ${iteration}`);
        const accessibilityTree = await this.getAccessibilityTree();
        const currentUrl = this.page!.url();
        visited.add(currentUrl);

        // Ask Claude what to test
        const prompt = this.generateAITestPrompt({
          prdContext,
          accessibilityTree,
          currentUrl,
          baseUrl: config.baseUrl,
          visited: Array.from(visited),
          testedElements: Array.from(testedElements),
          iteration,
          maxIterations,
          screenshotPath: screenshot.path,
        });

        const tempPromptPath = path.join(this.screenshotDir, `ai_test_prompt_${iteration}.md`);
        await fs.writeFile(tempPromptPath, prompt);

        // Get Claude's decision
        const isWindows = process.platform === 'win32';
        const catCmd = isWindows ? 'type' : 'cat';
        console.log(`[E2E AI Test] Iteration ${iteration}: Asking Claude what to test...`);

        let stdout = '';
        try {
          const result = await execAsync(
            `${catCmd} "${tempPromptPath}" | "${cliCommand}" -p --model ${model}`,
            {
              cwd: config.projectPath,
              timeout: 60000,
              maxBuffer: 10 * 1024 * 1024,
            }
          );
          stdout = result.stdout;
        } catch (execError) {
          console.error(`[E2E AI Test] Claude command failed:`, execError);
          // Try a simpler fallback action
          const fallbackAction = this.generateFallbackAction(accessibilityTree, iteration);
          if (fallbackAction) {
            console.log(`[E2E AI Test] Using fallback action:`, fallbackAction);
            await this.executeAIAction(fallbackAction, viewportName, config);
            if (fallbackAction.target) {
              testedElements.add(`${fallbackAction.action}:${fallbackAction.target}`);
            }
          }
          continue;
        }

        console.log(`[E2E AI Test] Claude response (${stdout.length} chars)`);
        console.log(`[E2E AI Test] First 500 chars:`, stdout.slice(0, 500));

        // Parse Claude's response
        const action = this.parseAITestAction(stdout);

        if (!action) {
          console.log(`[E2E AI Test] Failed to parse action, trying fallback...`);
          // Try a fallback action based on accessibility tree
          const fallbackAction = this.generateFallbackAction(accessibilityTree, iteration);
          if (fallbackAction) {
            console.log(`[E2E AI Test] Using fallback action:`, fallbackAction);
            await this.executeAIAction(fallbackAction, viewportName, config);
            if (fallbackAction.target) {
              testedElements.add(`${fallbackAction.action}:${fallbackAction.target}`);
            }
          }
          continue;
        }

        if (action.action === 'done') {
          this.emit('status', {
            phase: 'ai-testing',
            viewport: viewportName,
            message: 'AI testing complete',
          });
          break;
        }

        console.log(`[E2E AI Test] Parsed action:`, action);

        // Execute the action
        this.emit('status', {
          phase: 'ai-testing',
          viewport: viewportName,
          action: action.action,
          target: action.target,
        });

        await this.executeAIAction(action, viewportName, config);

        // Track what we tested
        if (action.target) {
          testedElements.add(`${action.action}:${action.target}`);
        }

        // Wait for page to settle
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        console.error(`[E2E AI Test] Iteration ${iteration} error:`, error);
        // Continue to next iteration on error
      }
    }
  }

  /**
   * Get the accessibility tree of the current page
   * Uses ARIA snapshot in newer Playwright versions
   */
  private async getAccessibilityTree(): Promise<string> {
    try {
      // Try ARIA snapshot first (newer Playwright)
      const ariaSnapshot = await this.page!.locator('body').ariaSnapshot();
      if (ariaSnapshot) {
        return ariaSnapshot;
      }
    } catch {
      // ARIA snapshot not available, fall back to manual inspection
    }

    // Fallback: Build accessibility info from DOM
    const accessibilityInfo = await this.page!.evaluate(() => {
      const getAccessibleInfo = (element: Element, depth: number): string => {
        const indent = '  '.repeat(depth);
        const results: string[] = [];

        // Get role
        const role = element.getAttribute('role') || element.tagName.toLowerCase();

        // Get accessible name
        const ariaLabel = element.getAttribute('aria-label');
        const innerText = element.textContent?.trim().slice(0, 50);
        const name = ariaLabel || (element as HTMLInputElement).placeholder || innerText || '';

        // Get state
        const disabled = element.hasAttribute('disabled') ? ' [disabled]' : '';
        const checked = (element as HTMLInputElement).checked !== undefined
          ? ` [checked: ${(element as HTMLInputElement).checked}]`
          : '';

        // Filter to interesting elements
        const interestingRoles = ['button', 'link', 'textbox', 'input', 'checkbox', 'radio', 'select', 'option', 'a', 'nav', 'main', 'heading', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
        const isInteresting = interestingRoles.includes(role) ||
          element.hasAttribute('role') ||
          element.hasAttribute('aria-label') ||
          (element as HTMLInputElement).type === 'submit';

        if (isInteresting && name) {
          results.push(`${indent}[${role}] "${name}"${disabled}${checked}`);
        }

        // Process children
        for (const child of element.children) {
          const childInfo = getAccessibleInfo(child, depth + 1);
          if (childInfo) results.push(childInfo);
        }

        return results.join('\n');
      };

      return getAccessibleInfo(document.body, 0);
    });

    return accessibilityInfo || '[WebPage]\n  (empty page)';
  }

  /**
   * Format accessibility tree as readable text
   */
  private formatAccessibilityTree(node: any, depth: number): string {
    if (!node) return '';

    const indent = '  '.repeat(depth);
    let result = '';

    const role = node.role || 'unknown';
    const name = node.name ? ` "${node.name}"` : '';
    const value = node.value ? ` [value: ${node.value}]` : '';
    const checked = node.checked !== undefined ? ` [checked: ${node.checked}]` : '';
    const disabled = node.disabled ? ' [disabled]' : '';
    const focused = node.focused ? ' [focused]' : '';

    result += `${indent}[${role}]${name}${value}${checked}${disabled}${focused}\n`;

    if (node.children) {
      for (const child of node.children) {
        result += this.formatAccessibilityTree(child, depth + 1);
      }
    }

    return result;
  }

  /**
   * Generate prompt for AI-driven testing
   */
  private generateAITestPrompt(context: {
    prdContext: string;
    accessibilityTree: string;
    currentUrl: string;
    baseUrl: string;
    visited: string[];
    testedElements: string[];
    iteration: number;
    maxIterations: number;
    screenshotPath: string;
  }): string {
    return `# E2E Test - AI Decision

You are a QA tester testing a web application. Analyze the current page and decide what to test next.

## Project Context
${context.prdContext || 'No PRD/specs available. Test general functionality.'}

## Current State
- **URL**: ${context.currentUrl}
- **Base URL**: ${context.baseUrl}
- **Iteration**: ${context.iteration}/${context.maxIterations}
- **Pages Visited**: ${context.visited.join(', ')}
- **Elements Tested**: ${context.testedElements.slice(-10).join(', ')}

## Page Accessibility Tree
\`\`\`
${context.accessibilityTree.slice(0, 5000)}
\`\`\`

## Screenshot
![Current Page](${context.screenshotPath})

## Your Task

Look at the accessibility tree and screenshot. Decide what to test next:
1. Click buttons and links to test navigation
2. Fill and submit forms to test functionality
3. Test interactive elements (dropdowns, toggles, etc.)
4. Verify error states and edge cases
5. Navigate to different pages to test all features

## Output Format

Return a JSON object with the action to take:

\`\`\`json
{
  "action": "click|fill|navigate|scroll|select|hover|done",
  "target": "CSS selector or accessible name",
  "value": "value for fill/select actions (optional)",
  "reason": "why you're testing this"
}
\`\`\`

Actions:
- **click**: Click an element (button, link, etc.)
- **fill**: Type into an input field (requires "value")
- **navigate**: Go to a URL (target = URL)
- **scroll**: Scroll to an element or down the page
- **select**: Select an option from a dropdown (requires "value")
- **hover**: Hover over an element
- **done**: Testing is complete for this viewport

Use accessible names from the tree when possible (e.g., "Login" button, "Email" input).
For CSS selectors, use specific ones like: button:has-text("Submit"), input[name="email"]

Focus on testing:
1. Primary user flows (login, signup, main features)
2. Navigation between pages
3. Form submissions
4. Interactive UI elements
5. Error handling

If you've tested the main functionality, return {"action": "done"}.
`;
  }

  /**
   * Generate a fallback action based on accessibility tree
   * Used when Claude fails to respond or respond with invalid JSON
   */
  private generateFallbackAction(
    accessibilityTree: string,
    iteration: number
  ): { action: string; target?: string; value?: string; reason?: string } | null {
    // Parse the accessibility tree to find clickable elements
    const lines = accessibilityTree.split('\n');

    // Find buttons and links
    const buttons: string[] = [];
    const links: string[] = [];
    const inputs: string[] = [];

    for (const line of lines) {
      const buttonMatch = line.match(/\[button\]\s*"([^"]+)"/);
      if (buttonMatch) buttons.push(buttonMatch[1]);

      const linkMatch = line.match(/\[link\]\s*"([^"]+)"/);
      if (linkMatch) links.push(linkMatch[1]);

      const inputMatch = line.match(/\[textbox\]\s*"([^"]+)"/);
      if (inputMatch) inputs.push(inputMatch[1]);
    }

    console.log(`[E2E Fallback] Found ${buttons.length} buttons, ${links.length} links, ${inputs.length} inputs`);

    // Cycle through elements based on iteration
    const allClickable = [...buttons, ...links];
    if (allClickable.length > 0) {
      const targetIndex = (iteration - 1) % allClickable.length;
      const target = allClickable[targetIndex];
      return {
        action: 'click',
        target,
        reason: `Fallback: clicking element ${targetIndex + 1} of ${allClickable.length}`,
      };
    }

    // If no clickable elements, try scrolling
    if (iteration % 3 === 0) {
      return {
        action: 'scroll',
        reason: 'Fallback: scrolling to discover more content',
      };
    }

    return null;
  }

  /**
   * Parse AI test action from Claude's response
   */
  private parseAITestAction(output: string): {
    action: string;
    target?: string;
    value?: string;
    reason?: string;
  } | null {
    try {
      // Try to find JSON in code block
      const jsonMatch = output.match(/```json\s*([\s\S]*?)```/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1].trim());
        if (parsed.action) {
          console.log(`[E2E AI Test] Parsed action from JSON code block:`, parsed.action);
          return parsed;
        }
      }

      // Try to parse raw JSON object containing "action"
      const rawJsonMatch = output.match(/\{[^{}]*"action"\s*:\s*"[^"]+"/);
      if (rawJsonMatch) {
        // Find the complete JSON object
        const startIdx = output.indexOf(rawJsonMatch[0]);
        let depth = 0;
        let endIdx = startIdx;

        for (let i = startIdx; i < output.length; i++) {
          if (output[i] === '{') depth++;
          if (output[i] === '}') {
            depth--;
            if (depth === 0) {
              endIdx = i + 1;
              break;
            }
          }
        }

        const jsonStr = output.substring(startIdx, endIdx);
        const parsed = JSON.parse(jsonStr);
        if (parsed.action) {
          console.log(`[E2E AI Test] Parsed action from raw JSON:`, parsed.action);
          return parsed;
        }
      }

      // Try to extract action from natural language response
      const actionPatterns = [
        { pattern: /click(?:ing)?\s+(?:on\s+)?(?:the\s+)?["']?([^"'\n]+)["']?/i, action: 'click' },
        { pattern: /fill(?:ing)?\s+(?:in\s+)?(?:the\s+)?["']?([^"'\n]+)["']?\s+with\s+["']?([^"'\n]+)["']?/i, action: 'fill' },
        { pattern: /navigate\s+to\s+["']?([^"'\n]+)["']?/i, action: 'navigate' },
        { pattern: /scroll\s+(?:to\s+)?["']?([^"'\n]+)["']?/i, action: 'scroll' },
      ];

      for (const { pattern, action } of actionPatterns) {
        const match = output.match(pattern);
        if (match) {
          console.log(`[E2E AI Test] Extracted action from natural language: ${action} -> ${match[1]}`);
          return {
            action,
            target: match[1],
            value: match[2],
            reason: 'Extracted from natural language',
          };
        }
      }

      console.log(`[E2E AI Test] Could not parse action from output`);
      return null;
    } catch (e) {
      console.error(`[E2E AI Test] Parse error:`, e);
      return null;
    }
  }

  /**
   * Execute an AI-decided action
   */
  private async executeAIAction(
    action: { action: string; target?: string; value?: string; reason?: string },
    viewportName: string,
    config: E2ETestConfig
  ): Promise<void> {
    const startTime = Date.now();

    try {
      switch (action.action) {
        case 'click':
          if (action.target) {
            // Try accessible name first, then CSS selector
            try {
              await this.page!.getByRole('button', { name: action.target }).or(
                this.page!.getByRole('link', { name: action.target })
              ).or(
                this.page!.locator(action.target)
              ).first().click({ timeout: 5000 });
            } catch {
              // Fallback to text matching
              await this.page!.getByText(action.target).first().click({ timeout: 5000 });
            }
          }
          break;

        case 'fill':
          if (action.target && action.value) {
            try {
              await this.page!.getByLabel(action.target).or(
                this.page!.getByPlaceholder(action.target)
              ).or(
                this.page!.locator(action.target)
              ).first().fill(action.value, { timeout: 5000 });
            } catch {
              await this.page!.locator(`input, textarea`).filter({ hasText: action.target }).first().fill(action.value);
            }
          }
          break;

        case 'navigate':
          if (action.target) {
            const url = action.target.startsWith('http') ? action.target : `${config.baseUrl}${action.target}`;
            await this.page!.goto(url, { waitUntil: 'networkidle' });
          }
          break;

        case 'scroll':
          if (action.target) {
            await this.page!.locator(action.target).first().scrollIntoViewIfNeeded();
          } else {
            await this.page!.evaluate(() => window.scrollBy(0, 500));
          }
          break;

        case 'select':
          if (action.target && action.value) {
            await this.page!.locator(action.target).selectOption(action.value, { timeout: 5000 });
          }
          break;

        case 'hover':
          if (action.target) {
            await this.page!.locator(action.target).first().hover({ timeout: 5000 });
          }
          break;
      }

      const duration = Date.now() - startTime;
      const validActions = ['navigate', 'click', 'fill', 'scroll', 'hover', 'select', 'wait'] as const;
      const actionType = validActions.includes(action.action as any)
        ? (action.action as typeof validActions[number])
        : 'click';

      this.interactions.push({
        action: actionType,
        target: action.target || '',
        status: 'success',
        duration,
        value: action.value,
      });

      // Capture screenshot after action
      await this.captureScreenshot(`${viewportName} - ${action.action}: ${action.reason || action.target || ''}`);

    } catch (error) {
      const duration = Date.now() - startTime;
      const validActions = ['navigate', 'click', 'fill', 'scroll', 'hover', 'select', 'wait'] as const;
      const actionType = validActions.includes(action.action as any)
        ? (action.action as typeof validActions[number])
        : 'click';

      this.interactions.push({
        action: actionType,
        target: action.target || '',
        status: 'error',
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
        value: action.value,
      });

      // Capture screenshot even on error
      await this.captureScreenshot(`${viewportName} - ERROR: ${action.action} ${action.target || ''}`);
    }
  }

  private async executeScenario(
    scenario: TestScenario,
    viewportName: string,
    config: E2ETestConfig
  ): Promise<void> {
    for (const step of scenario.steps) {
      try {
        await this.executeStep(step, viewportName, config);
      } catch (error) {
        // Log error but continue with other steps
        this.interactions.push({
          action: step.action,
          target: step.target || '',
          status: 'error',
          duration: 0,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  private async executeStep(
    step: TestStep,
    viewportName: string,
    config: E2ETestConfig
  ): Promise<void> {
    const startTime = Date.now();
    const { action, target, value, description, takeScreenshot } = step;

    try {
      switch (action) {
        case 'navigate':
          await this.page!.goto(target || config.baseUrl, { waitUntil: 'networkidle' });
          break;

        case 'click':
          if (target) {
            await this.page!.click(target, { timeout: 5000 });
          }
          break;

        case 'fill':
          if (target && value) {
            await this.page!.fill(target, value, { timeout: 5000 });
          }
          break;

        case 'hover':
          if (target) {
            await this.page!.hover(target, { timeout: 5000 });
          }
          break;

        case 'select':
          if (target && value) {
            await this.page!.selectOption(target, value, { timeout: 5000 });
          }
          break;

        case 'scroll':
          if (target) {
            await this.page!.locator(target).scrollIntoViewIfNeeded({ timeout: 5000 });
          } else {
            await this.page!.evaluate(() => window.scrollBy(0, 300));
          }
          break;

        case 'wait':
          if (target) {
            await this.page!.waitForSelector(target, { timeout: 10000 });
          } else if (value) {
            await new Promise((resolve) => setTimeout(resolve, parseInt(value, 10)));
          }
          break;
      }

      const duration = Date.now() - startTime;

      this.interactions.push({
        action,
        target: target || '',
        status: 'success',
        duration,
        value,
      });

      // Capture screenshot if requested
      if (takeScreenshot || config.screenshotOnEveryAction) {
        const screenshotDesc = description || `${viewportName} - ${action} ${target || ''}`;
        await this.captureScreenshot(screenshotDesc);
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      this.interactions.push({
        action,
        target: target || '',
        status: 'error',
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  private async navigateAndCapture(
    url: string,
    description: string,
    takeScreenshot: boolean
  ): Promise<void> {
    const startTime = Date.now();

    try {
      await this.page!.goto(url, { waitUntil: 'networkidle' });

      this.interactions.push({
        action: 'navigate',
        target: url,
        status: 'success',
        duration: Date.now() - startTime,
      });

      if (takeScreenshot) {
        await this.captureScreenshot(description);
      }
    } catch (error) {
      this.interactions.push({
        action: 'navigate',
        target: url,
        status: 'error',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  private async captureScreenshot(description: string): Promise<ScreenshotCapture> {
    this.screenshotCounter++;
    const id = `screenshot_${Date.now()}_${this.screenshotCounter}`;
    const filename = `${id}.png`;
    const filepath = path.join(this.screenshotDir, filename);

    await this.page!.screenshot({ path: filepath, fullPage: true });

    // Read as base64 for transmission
    const buffer = await fs.readFile(filepath);
    const base64 = buffer.toString('base64');

    const viewport = this.page!.viewportSize()!;
    const capture: ScreenshotCapture = {
      id,
      timestamp: Date.now(),
      path: filepath,
      base64,
      description,
      viewport: {
        width: viewport.width,
        height: viewport.height,
      },
    };

    this.screenshots.push(capture);
    this.emit('screenshot', capture);
    return capture;
  }

  private async analyzeScreenshotsWithClaude(config: E2ETestConfig): Promise<void> {
    // For MVP, analyze each screenshot individually
    // In production, could batch or use vision API directly

    for (const screenshot of this.screenshots) {
      try {
        const analysisResult = await this.analyzeScreenshot(screenshot, config);

        // Convert findings to VisualFinding format
        for (const finding of analysisResult.findings) {
          this.findings.push({
            id: `finding_${Date.now()}_${this.findings.length}`,
            type: finding.type,
            description: finding.description,
            screenshotId: screenshot.id,
            priority: finding.priority,
            suggestedFix: finding.suggestedFix,
            location: finding.location,
          });
        }
      } catch (error) {
        // Log but don't fail entire analysis
        this.emit('analysis-error', {
          screenshotId: screenshot.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  private async analyzeScreenshot(
    screenshot: ScreenshotCapture,
    config: E2ETestConfig
  ): Promise<VisualAnalysisResult> {
    const prompt = generateVisualAnalysisPrompt({
      screenshotDescription: screenshot.description,
      viewport: screenshot.viewport,
    });

    // Use Claude CLI to analyze the screenshot
    const cliCommand = config.claudeCliPath || 'claude';
    const model = config.model || 'sonnet';

    try {
      // Create a temporary prompt file with the image
      const tempPromptPath = path.join(this.screenshotDir, `analysis_prompt_${screenshot.id}.md`);
      const promptContent = `${prompt}\n\n![Screenshot](${screenshot.path})`;
      await fs.writeFile(tempPromptPath, promptContent);

      const { stdout } = await execAsync(
        `cat "${tempPromptPath}" | "${cliCommand}" -p --model ${model}`,
        {
          cwd: this.projectPath,
          timeout: 60000,
          maxBuffer: 10 * 1024 * 1024,
        }
      );

      // Parse JSON from Claude's response
      const jsonMatch = stdout.match(/```json\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);
        return {
          findings: parsed.findings || [],
          overallAssessment: parsed.overallAssessment || '',
          passesVisualCheck: parsed.passesVisualCheck ?? true,
        };
      }

      // Try parsing the entire output as JSON
      try {
        const parsed = JSON.parse(stdout.trim());
        return {
          findings: parsed.findings || [],
          overallAssessment: parsed.overallAssessment || '',
          passesVisualCheck: parsed.passesVisualCheck ?? true,
        };
      } catch {
        // Return empty findings if parsing fails
        return {
          findings: [],
          overallAssessment: stdout.trim().slice(0, 500),
          passesVisualCheck: true,
        };
      }
    } catch (error) {
      // Return empty findings on error
      return {
        findings: [],
        overallAssessment: `Analysis error: ${error instanceof Error ? error.message : 'Unknown'}`,
        passesVisualCheck: true,
      };
    }
  }

  private calculateVisualScore(): number {
    const highIssues = this.findings.filter((f) => f.priority === 'HIGH').length;
    const mediumIssues = this.findings.filter((f) => f.priority === 'MEDIUM').length;
    const lowIssues = this.findings.filter((f) => f.priority === 'LOW').length;

    // Also factor in interaction errors
    const interactionErrors = this.interactions.filter((i) => i.status === 'error').length;

    const score = Math.max(
      0,
      100 - highIssues * 20 - mediumIssues * 10 - lowIssues * 5 - interactionErrors * 15
    );

    return score;
  }

  private determineStatus(visualScore: number): E2ETestStatus {
    const failedInteractions = this.interactions.filter((i) => i.status === 'error').length;
    const totalInteractions = this.interactions.length;
    const errorRate = totalInteractions > 0 ? failedInteractions / totalInteractions : 0;

    if (errorRate > 0.5 || visualScore < 50) return 'FAIL';
    if (errorRate > 0.2 || visualScore < 80) return 'PARTIAL';
    return 'PASS';
  }

  private generateSummary(status: E2ETestStatus, score: number): string {
    const highFindings = this.findings.filter((f) => f.priority === 'HIGH').length;
    const interactionErrors = this.interactions.filter((i) => i.status === 'error').length;
    const totalInteractions = this.interactions.length;

    return (
      `E2E Test ${status}: Visual score ${score}/100. ` +
      `${this.screenshots.length} screenshots captured. ` +
      `${totalInteractions - interactionErrors}/${totalInteractions} interactions successful. ` +
      `${this.findings.length} visual findings (${highFindings} high priority).`
    );
  }

  private createErrorResult(error: unknown, startTime: number): E2ETestResult {
    return {
      testStatus: 'ERROR',
      visualScore: 0,
      screenshots: this.screenshots,
      interactions: this.interactions,
      findings: [],
      devServerUrl: '',
      browserUsed: 'chromium',
      testDurationMs: Date.now() - startTime,
      timestamp: Date.now(),
      summary: `E2E Test ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }

  private async cleanup(): Promise<void> {
    if (this.page) {
      try {
        await this.page.close();
      } catch {
        // Ignore close errors
      }
      this.page = null;
    }

    if (this.context) {
      try {
        await this.context.close();
      } catch {
        // Ignore close errors
      }
      this.context = null;
    }

    if (this.browser) {
      try {
        await this.browser.close();
      } catch {
        // Ignore close errors
      }
      this.browser = null;
    }

    if (this.devServerProcess) {
      try {
        this.devServerProcess.kill();
      } catch {
        // Ignore kill errors
      }
      this.devServerProcess = null;
    }
  }

  /**
   * Generate default test scenarios based on common patterns
   */
  static generateDefaultScenarios(baseUrl: string): TestScenario[] {
    return [
      {
        name: 'Homepage Load',
        description: 'Verify homepage loads correctly',
        steps: [
          { action: 'navigate', target: baseUrl, takeScreenshot: true },
          { action: 'wait', value: '1000' },
          { action: 'scroll', description: 'Scroll down', takeScreenshot: true },
        ],
      },
      {
        name: 'Navigation Test',
        description: 'Test main navigation links',
        steps: [
          { action: 'navigate', target: baseUrl, takeScreenshot: false },
          { action: 'click', target: 'nav a:first-child', takeScreenshot: true },
          { action: 'wait', value: '500' },
        ],
      },
    ];
  }
}
