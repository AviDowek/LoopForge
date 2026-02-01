import { spawn, ChildProcess, exec, execSync } from 'child_process';
import { promisify } from 'util';
import { existsSync, promises as fs } from 'fs';
import path from 'path';

const execAsync = promisify(exec);
import { EventEmitter } from 'events';
import type { RalphStatus, StreamEvent, ReviewResult, AutoContinueConfig, ReviewConfig } from '@/types';
import type { E2ETestResult, E2ETestConfig, E2EAutoConfig, TestScenario } from '@/types/e2e';
import { generateReviewPromptMd, generateContinuationPromptMd, generateReviewFindingsSection } from '../ralph/reviewTemplates';
import { parseReviewOutput, createErrorReviewResult } from '../ralph/reviewParser';
import { E2ETestRunner, generateE2EFixPromptMd, generateE2EFindingsSection, generateDefaultE2EConfig } from '../e2e';

export interface LoopConfig {
  projectPath: string;
  promptFile: string;
  mode: 'plan' | 'build';
  model: string;
  sessionId: string;
  claudeCliPath?: string; // Optional custom path to Claude CLI
  maxIterations?: number; // 0 = unlimited, >0 = stop after N iterations
  autoPush?: boolean; // Auto git push after each iteration
  verbose?: boolean; // Enable verbose output
  autoReview?: boolean; // Trigger review on loop completion
  autoContinue?: AutoContinueConfig; // Auto-continuation settings
}

/**
 * Parse RALPH_STATUS block from output
 */
function parseRalphStatus(text: string): RalphStatus | null {
  const statusMatch = text.match(/RALPH_STATUS:\s*([\s\S]*?)(?=\n\n|\z)/);
  if (!statusMatch) return null;

  const statusBlock = statusMatch[1];
  const result: RalphStatus = {
    taskCompleted: '',
    filesCreated: [],
    nextTask: '',
    exitSignal: false,
    notes: '',
  };

  const taskMatch = statusBlock.match(/TASK_COMPLETED:\s*"([^"]+)"/);
  if (taskMatch) result.taskCompleted = taskMatch[1];

  const filesMatch = statusBlock.match(/FILES_CREATED:\s*\[(.*?)\]/s);
  if (filesMatch) {
    result.filesCreated = filesMatch[1]
      .split(',')
      .map((f) => f.trim().replace(/"/g, ''))
      .filter(Boolean);
  }

  const nextMatch = statusBlock.match(/NEXT_TASK:\s*"([^"]+)"/);
  if (nextMatch) result.nextTask = nextMatch[1];

  const exitMatch = statusBlock.match(/EXIT_SIGNAL:\s*(true|false)/);
  if (exitMatch) result.exitSignal = exitMatch[1] === 'true';

  const notesMatch = statusBlock.match(/NOTES:\s*"([^"]+)"/);
  if (notesMatch) result.notes = notesMatch[1];

  return result;
}

/**
 * Manages spawned CLI processes for the Ralph Wiggum loop
 */
export class ProcessManager extends EventEmitter {
  private processes: Map<string, ChildProcess> = new Map();
  private outputBuffers: Map<string, string> = new Map();
  private sessionConfigs: Map<string, LoopConfig> = new Map();
  private iterationCounts: Map<string, number> = new Map();
  private claudeSessionIds: Map<string, string> = new Map(); // Maps our sessionId to Claude's session ID
  private shouldContinueLoop: Map<string, boolean> = new Map(); // Track if loop should continue
  private exitSignalReceived: Map<string, boolean> = new Map(); // Track if EXIT_SIGNAL was received
  private currentBranches: Map<string, string> = new Map(); // Track git branch per session
  private reviewInProgress: Map<string, boolean> = new Map(); // Track if review is in progress
  private latestReviewResults: Map<string, ReviewResult> = new Map(); // Cache latest review results
  private e2eInProgress: Map<string, boolean> = new Map(); // Track if E2E test is in progress
  private latestE2EResults: Map<string, E2ETestResult> = new Map(); // Cache latest E2E test results

  /**
   * Start a new loop process
   */
  async startLoop(config: LoopConfig): Promise<void> {
    const {
      projectPath,
      promptFile,
      mode,
      model,
      sessionId,
      claudeCliPath,
      maxIterations = 0,
      autoPush = false,
      verbose = false  // Match original Ralph Wiggum - explicit opt-in
    } = config;

    // Check if already running
    if (this.processes.has(sessionId)) {
      throw new Error(`Session ${sessionId} is already running`);
    }

    // Validate prompt file exists
    const promptPath = path.join(projectPath, promptFile);
    if (!existsSync(promptPath)) {
      throw new Error(`Prompt file not found: ${promptPath}`);
    }

    // Check for IMPLEMENTATION_PLAN.md (warning only)
    const planPath = path.join(projectPath, 'IMPLEMENTATION_PLAN.md');
    if (!existsSync(planPath)) {
      this.emitEvent(sessionId, {
        type: 'system',
        timestamp: Date.now(),
        data: { message: 'Warning: IMPLEMENTATION_PLAN.md not found. Plan exhaustion detection disabled.' },
      });
    }

    // Get current git branch
    let currentBranch = 'unknown';
    try {
      currentBranch = execSync('git branch --show-current', {
        cwd: projectPath,
        encoding: 'utf-8'
      }).trim() || 'HEAD';
      this.currentBranches.set(sessionId, currentBranch);
    } catch {
      currentBranch = 'not a git repo';
    }

    // Determine the CLI command - use custom path if provided, otherwise 'claude'
    const cliCommand = claudeCliPath || 'claude';

    // Construct the loop command
    // On Windows, use cmd.exe; on Unix, use bash
    const isWindows = process.platform === 'win32';

    // Only quote paths that contain spaces
    const quotedCli = cliCommand.includes(' ') ? `"${cliCommand}"` : cliCommand;
    const quotedPrompt = promptFile.includes(' ') ? `"${promptFile}"` : promptFile;

    // Build CLI flags
    const verboseFlag = verbose ? ' --verbose' : '';

    const loopCommand = isWindows
      ? `type ${quotedPrompt} | ${quotedCli} -p --dangerously-skip-permissions --output-format=stream-json --model=${model}${verboseFlag}`
      : `cat "${promptFile}" | "${cliCommand}" -p --dangerously-skip-permissions --output-format=stream-json --model=${model}${verboseFlag}`;

    // Log the command for debugging
    console.log(`[ProcessManager] Starting loop:`, {
      command: loopCommand,
      cwd: projectPath,
      isWindows,
    });

    const proc = spawn(isWindows ? 'cmd.exe' : 'bash', [isWindows ? '/c' : '-c', loopCommand], {
      cwd: projectPath,
      env: {
        ...process.env,
        RALPH_MODE: mode,
        RALPH_SESSION_ID: sessionId,
      },
      shell: false,
    });

    this.processes.set(sessionId, proc);
    this.outputBuffers.set(sessionId, '');
    this.sessionConfigs.set(sessionId, config);
    this.iterationCounts.set(sessionId, this.iterationCounts.get(sessionId) || 0);
    this.shouldContinueLoop.set(sessionId, true);
    this.exitSignalReceived.set(sessionId, false);

    // Emit startup banner like original loop.sh
    this.emitEvent(sessionId, {
      type: 'system',
      timestamp: Date.now(),
      data: {
        message: `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nMode:   ${mode}\nPrompt: ${promptFile}\nBranch: ${currentBranch}${maxIterations > 0 ? `\nMax:    ${maxIterations} iterations` : ''}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        branch: currentBranch,
        mode,
        promptFile,
      },
    });

    // Handle stdout
    proc.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      console.log(`[ProcessManager] STDOUT chunk (${text.length} chars):`, text.substring(0, 200));
      let buffer = this.outputBuffers.get(sessionId) || '';
      buffer += text;

      const lines = buffer.split('\n');
      // Keep the last incomplete line in the buffer
      this.outputBuffers.set(sessionId, lines.pop() || '');

      for (const line of lines) {
        if (!line.trim()) continue;

        // Try to parse as stream-json
        try {
          const parsed = JSON.parse(line);
          this.emitEvent(sessionId, {
            type: 'stdout',
            timestamp: Date.now(),
            data: parsed,
          });

          // Capture Claude's session ID from init message
          if (parsed.type === 'system' && parsed.subtype === 'init' && parsed.session_id) {
            this.claudeSessionIds.set(sessionId, parsed.session_id);
            console.log(`[ProcessManager] Captured Claude session ID: ${parsed.session_id}`);
          }

          // Check for RALPH_STATUS in text content
          if (parsed.event?.delta?.text) {
            const status = parseRalphStatus(parsed.event.delta.text);
            if (status) {
              this.handleRalphStatus(sessionId, status);
            }
          }
        } catch {
          // Not JSON, emit as raw output
          this.emitEvent(sessionId, {
            type: 'stdout',
            timestamp: Date.now(),
            data: { raw: line },
          });

          // Check for RALPH_STATUS in raw output
          const status = parseRalphStatus(line);
          if (status) {
            this.handleRalphStatus(sessionId, status);
          }
        }
      }
    });

    // Handle stderr
    proc.stderr?.on('data', (chunk: Buffer) => {
      const message = chunk.toString();
      console.log(`[ProcessManager] STDERR:`, message);
      this.emitEvent(sessionId, {
        type: 'stderr',
        timestamp: Date.now(),
        data: { message },
      });
    });

    // Handle process exit
    proc.on('close', async (code) => {
      console.log(`[ProcessManager] Process exited with code:`, code);
      this.processes.delete(sessionId);
      this.outputBuffers.delete(sessionId);

      const config = this.sessionConfigs.get(sessionId);
      const shouldContinue = this.shouldContinueLoop.get(sessionId);
      const exitSignal = this.exitSignalReceived.get(sessionId);
      const currentIteration = this.iterationCounts.get(sessionId) || 0;

      // Check if we should restart the loop
      const maxReached = config?.maxIterations && config.maxIterations > 0 && currentIteration >= config.maxIterations;

      // Check for plan exhaustion (all tasks completed in IMPLEMENTATION_PLAN.md)
      let planExhausted = false;
      if (config) {
        planExhausted = await this.checkPlanExhausted(config.projectPath);
        if (planExhausted) {
          this.emitEvent(sessionId, {
            type: 'system',
            timestamp: Date.now(),
            data: { message: 'All tasks in IMPLEMENTATION_PLAN.md completed. Stopping loop.' },
          });
        }
      }

      console.log(`[ProcessManager] Loop status:`, {
        shouldContinue,
        exitSignal,
        currentIteration,
        maxIterations: config?.maxIterations,
        maxReached,
        planExhausted,
        exitCode: code,
      });

      if (code === 0 && shouldContinue && !exitSignal && !maxReached && !planExhausted && config) {
        // Git push AFTER Claude exits, BEFORE restart (Ralph Wiggum technique)
        if (config.autoPush) {
          try {
            const branch = this.currentBranches.get(sessionId) || 'HEAD';
            // Push with fallback for new branches
            await execAsync(
              `git push origin ${branch} || git push -u origin ${branch}`,
              { cwd: config.projectPath, timeout: 30000 }
            );
            this.emitEvent(sessionId, {
              type: 'system',
              timestamp: Date.now(),
              data: { message: `Pushed to origin/${branch}` },
            });
          } catch (error) {
            this.emitEvent(sessionId, {
              type: 'stderr',
              timestamp: Date.now(),
              data: { message: `Git push failed: ${error instanceof Error ? error.message : 'Unknown'}` },
            });
            // Continue anyway - don't fail the loop
          }
        }

        // Increment iteration count and restart
        const nextIteration = currentIteration + 1;
        this.iterationCounts.set(sessionId, nextIteration);

        // Emit iteration update event
        this.emit('iteration:update', { sessionId, iteration: nextIteration, maxIterations: config.maxIterations });

        // Iteration banner like original loop.sh
        this.emitEvent(sessionId, {
          type: 'system',
          timestamp: Date.now(),
          data: {
            message: `\n======================== ITERATION ${nextIteration} ========================\n`,
            iteration: nextIteration,
          },
        });

        // Small delay before restarting to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Restart the loop if it hasn't been stopped
        if (this.shouldContinueLoop.get(sessionId)) {
          console.log(`[ProcessManager] Restarting loop for iteration ${nextIteration}`);
          try {
            await this.startLoop(config);
          } catch (error) {
            console.error(`[ProcessManager] Failed to restart loop:`, error);
            this.cleanupSession(sessionId);
            this.emitEvent(sessionId, {
              type: 'error',
              timestamp: Date.now(),
              data: { message: `Failed to restart loop: ${error instanceof Error ? error.message : 'Unknown error'}` },
            });
            this.emit('session:end', { sessionId, exitCode: 1 });
          }
        }
      } else {
        // Loop is done - determine reason and check for auto-review
        const reason = planExhausted ? 'All tasks completed in IMPLEMENTATION_PLAN.md' :
                       exitSignal ? 'EXIT_SIGNAL received' :
                       maxReached ? `Max iterations (${config?.maxIterations}) reached` :
                       !shouldContinue ? 'Loop was stopped' :
                       code !== 0 ? `Exit code ${code}` : 'Unknown';

        this.emitEvent(sessionId, {
          type: 'complete',
          timestamp: Date.now(),
          data: { exitCode: code, reason, totalIterations: currentIteration },
        });

        // Check for auto-review (only on successful completion)
        if (code === 0 && config?.autoReview && !exitSignal) {
          try {
            this.emitEvent(sessionId, {
              type: 'system',
              timestamp: Date.now(),
              data: { message: 'Loop complete. Starting auto-review...' },
            });

            const reviewResult = await this.runAutoReview({
              projectPath: config.projectPath,
              sessionId,
              model: config.model,
              claudeCliPath: config.claudeCliPath,
            });

            // Check auto-continue conditions
            const autoContinue = config.autoContinue;
            if (
              autoContinue?.enabled &&
              reviewResult.reviewStatus !== 'COMPLETE' &&
              reviewResult.missingItems.length > 0 &&
              autoContinue.currentAutoIteration < autoContinue.maxAutoIterations
            ) {
              // Generate continuation docs
              await this.generateContinuationDocs({
                projectPath: config.projectPath,
                sessionId,
                reviewResult,
              });

              const nextAutoIteration = autoContinue.currentAutoIteration + 1;
              this.emitEvent(sessionId, {
                type: 'system',
                timestamp: Date.now(),
                data: {
                  message: `Auto-continue iteration ${nextAutoIteration}/${autoContinue.maxAutoIterations}`,
                  autoIteration: nextAutoIteration,
                },
              });

              // Start new loop with continuation prompt
              const continueConfig: LoopConfig = {
                ...config,
                promptFile: 'PROMPT_continue.md',
                autoContinue: {
                  ...autoContinue,
                  currentAutoIteration: nextAutoIteration,
                },
              };

              // Reset loop state for continuation
              this.iterationCounts.set(sessionId, 0);

              await new Promise(resolve => setTimeout(resolve, 3000));
              await this.startLoop(continueConfig);
              return; // Don't clean up - loop is continuing
            } else if (autoContinue?.enabled && autoContinue.currentAutoIteration >= autoContinue.maxAutoIterations) {
              this.emitEvent(sessionId, {
                type: 'system',
                timestamp: Date.now(),
                data: { message: `Max auto-continue iterations (${autoContinue.maxAutoIterations}) reached` },
              });
            }
          } catch (error) {
            console.error(`[ProcessManager] Auto-review/continue failed:`, error);
            this.emitEvent(sessionId, {
              type: 'error',
              timestamp: Date.now(),
              data: { message: `Auto-review failed: ${error instanceof Error ? error.message : 'Unknown'}` },
            });
          }
        }

        this.cleanupSession(sessionId);
        this.emit('session:end', { sessionId, exitCode: code });
      }
    });

    // Handle errors
    proc.on('error', (error) => {
      this.emitEvent(sessionId, {
        type: 'error',
        timestamp: Date.now(),
        data: { message: error.message },
      });
    });
  }

  /**
   * Clean up all session data
   */
  private cleanupSession(sessionId: string): void {
    this.processes.delete(sessionId);
    this.outputBuffers.delete(sessionId);
    this.sessionConfigs.delete(sessionId);
    this.iterationCounts.delete(sessionId);
    this.claudeSessionIds.delete(sessionId);
    this.shouldContinueLoop.delete(sessionId);
    this.exitSignalReceived.delete(sessionId);
    this.currentBranches.delete(sessionId);
    this.reviewInProgress.delete(sessionId);
    this.e2eInProgress.delete(sessionId);
    // Note: Don't delete latestReviewResults or latestE2EResults - keep for UI access
  }

  /**
   * Run an auto-review of the project
   * Uses Plan Mode (-p) WITHOUT --dangerously-skip-permissions (read-only)
   */
  async runAutoReview(config: ReviewConfig): Promise<ReviewResult> {
    const { projectPath, sessionId, model, claudeCliPath } = config;

    // Guard: Check not already reviewing
    if (this.reviewInProgress.get(sessionId)) {
      throw new Error('Review already in progress');
    }

    // Guard: Check required files exist
    const requiredFiles = ['IMPLEMENTATION_PLAN.md'];
    const optionalFiles = ['PROJECT_CONTEXT.md', 'specs'];
    const missingRequired = requiredFiles.filter(f => !existsSync(path.join(projectPath, f)));

    if (missingRequired.length > 0) {
      const errorResult = createErrorReviewResult(
        `Missing required files: ${missingRequired.join(', ')}`,
        ''
      );
      this.emit('review:error', { sessionId, error: errorResult.summary });
      return errorResult;
    }

    this.reviewInProgress.set(sessionId, true);
    const startTime = Date.now();

    // Emit review start
    this.emit('review:start', { sessionId });
    this.emitEvent(sessionId, {
      type: 'system',
      timestamp: Date.now(),
      data: { message: 'Starting auto-review...' },
    });

    try {
      // Generate review prompt
      const projectName = path.basename(projectPath);
      const reviewPrompt = generateReviewPromptMd(projectName);
      const reviewPromptPath = path.join(projectPath, 'PROMPT_review.md');
      await fs.writeFile(reviewPromptPath, reviewPrompt);

      // Spawn Claude in SAFE plan mode (no --dangerously-skip-permissions)
      const cliCommand = claudeCliPath || 'claude';
      const isWindows = process.platform === 'win32';
      const quotedCli = cliCommand.includes(' ') ? `"${cliCommand}"` : cliCommand;

      // Note: NO --dangerously-skip-permissions for review (read-only)
      // Use plain text output (not stream-json) for simpler parsing
      const reviewCommand = isWindows
        ? `type PROMPT_review.md | ${quotedCli} -p --model=${model}`
        : `cat PROMPT_review.md | "${cliCommand}" -p --model=${model}`;

      console.log(`[ProcessManager] Running auto-review:`, { reviewCommand, cwd: projectPath });

      // Use spawn with shell to properly handle pipes on Windows
      // This is more reliable than exec for complex shell commands
      const output = await new Promise<string>((resolve, reject) => {
        const shellCmd = isWindows ? 'cmd.exe' : 'bash';
        const shellArgs = isWindows ? ['/c', reviewCommand] : ['-c', reviewCommand];

        console.log(`[ProcessManager] Spawning review:`, { shellCmd, shellArgs });

        const proc = spawn(shellCmd, shellArgs, {
          cwd: projectPath,
          shell: false,
          env: {
            ...process.env,
            RALPH_MODE: 'review',
          },
        });

        let stdout = '';
        let stderr = '';

        proc.stdout?.on('data', (chunk: Buffer) => {
          const text = chunk.toString();
          stdout += text;
          // Log progress
          if (stdout.length % 10000 < text.length) {
            console.log(`[ProcessManager] Review output progress: ${stdout.length} chars`);
          }
        });

        proc.stderr?.on('data', (chunk: Buffer) => {
          const text = chunk.toString();
          stderr += text;
          console.log(`[ProcessManager] Review stderr:`, text.slice(0, 200));
        });

        // Timeout after 10 minutes
        const timeout = setTimeout(() => {
          proc.kill('SIGTERM');
          reject(new Error('Review timed out after 10 minutes'));
        }, 600000);

        proc.on('close', (code) => {
          clearTimeout(timeout);
          console.log(`[ProcessManager] Review process exited with code ${code}`);
          if (code === 0 || stdout.length > 0) {
            resolve(stdout + (stderr || ''));
          } else {
            reject(new Error(`Review process exited with code ${code}: ${stderr}`));
          }
        });

        proc.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
      console.log(`[ProcessManager] Review output (${output.length} chars)`);
      // Log first and last portions to help debug
      console.log(`[ProcessManager] Review output start:`, output.slice(0, 1000));
      console.log(`[ProcessManager] Review output end:`, output.slice(-1000));

      // Save raw output to file for debugging
      const debugOutputPath = path.join(projectPath, '.review-debug-output.txt');
      await fs.writeFile(debugOutputPath, output);
      console.log(`[ProcessManager] Saved raw output to ${debugOutputPath}`);

      // Parse the review result
      const reviewResult = parseReviewOutput(output);

      if (!reviewResult) {
        const errorResult = createErrorReviewResult(
          'Failed to parse review output',
          output
        );
        errorResult.reviewDurationMs = Date.now() - startTime;
        this.latestReviewResults.set(sessionId, errorResult);
        this.emit('review:complete', { sessionId, result: errorResult });
        return errorResult;
      }

      reviewResult.reviewDurationMs = Date.now() - startTime;
      this.latestReviewResults.set(sessionId, reviewResult);

      this.emitEvent(sessionId, {
        type: 'system',
        timestamp: Date.now(),
        data: {
          message: `Review complete: ${reviewResult.reviewStatus} (${reviewResult.overallScore}/100)`,
          reviewStatus: reviewResult.reviewStatus,
          score: reviewResult.overallScore,
        },
      });

      this.emit('review:complete', { sessionId, result: reviewResult });
      return reviewResult;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[ProcessManager] Review error:`, error);

      const errorResult = createErrorReviewResult(errorMessage, '');
      errorResult.reviewDurationMs = Date.now() - startTime;
      this.latestReviewResults.set(sessionId, errorResult);

      this.emitEvent(sessionId, {
        type: 'error',
        timestamp: Date.now(),
        data: { message: `Review failed: ${errorMessage}` },
      });

      this.emit('review:error', { sessionId, error: errorMessage });
      return errorResult;

    } finally {
      this.reviewInProgress.delete(sessionId);
    }
  }

  /**
   * Generate continuation documents based on review results
   */
  async generateContinuationDocs(config: {
    projectPath: string;
    sessionId: string;
    reviewResult: ReviewResult;
  }): Promise<void> {
    const { projectPath, sessionId, reviewResult } = config;

    // Generate continuation prompt with project name
    const projectName = path.basename(projectPath);
    const continuationPrompt = generateContinuationPromptMd(reviewResult, projectName);
    const continuationPath = path.join(projectPath, 'PROMPT_continue.md');
    await fs.writeFile(continuationPath, continuationPrompt);

    // Append review findings to IMPLEMENTATION_PLAN.md
    const planPath = path.join(projectPath, 'IMPLEMENTATION_PLAN.md');
    let existingPlan = '';
    try {
      existingPlan = await fs.readFile(planPath, 'utf-8');
    } catch {
      // File doesn't exist, create new one
      existingPlan = '# Implementation Plan\n';
    }

    const reviewSection = generateReviewFindingsSection(reviewResult);
    await fs.writeFile(planPath, existingPlan + reviewSection);

    this.emitEvent(sessionId, {
      type: 'system',
      timestamp: Date.now(),
      data: { message: 'Generated continuation documents' },
    });
  }

  /**
   * Get the latest review result for a session
   */
  getLatestReviewResult(sessionId: string): ReviewResult | undefined {
    return this.latestReviewResults.get(sessionId);
  }

  /**
   * Check if a review is in progress
   */
  isReviewInProgress(sessionId: string): boolean {
    return this.reviewInProgress.get(sessionId) || false;
  }

  /**
   * Run E2E visual tests on the project
   */
  async runE2ETests(config: E2ETestConfig): Promise<E2ETestResult> {
    const { projectPath, sessionId } = config;

    // Guard: Check not already running
    if (this.e2eInProgress.get(sessionId)) {
      throw new Error('E2E test already in progress');
    }

    this.e2eInProgress.set(sessionId, true);

    // Emit E2E start
    this.emit('e2e:start', { sessionId });
    this.emitEvent(sessionId, {
      type: 'system',
      timestamp: Date.now(),
      data: { message: 'Starting E2E visual tests...' },
    });

    const runner = new E2ETestRunner(projectPath);

    // Forward runner events
    runner.on('status', (status) => {
      this.emit('e2e:status', { sessionId, ...status });
      this.emitEvent(sessionId, {
        type: 'system',
        timestamp: Date.now(),
        data: { message: `E2E: ${status.phase}${status.viewport ? ` (${status.viewport})` : ''}` },
      });
    });

    runner.on('screenshot', (screenshot) => {
      this.emit('e2e:screenshot', { sessionId, screenshot });
    });

    runner.on('server-output', ({ type, data }) => {
      // Optionally log dev server output
      console.log(`[E2E DevServer ${type}]:`, data.substring(0, 200));
    });

    try {
      const result = await runner.runTests(config);
      this.latestE2EResults.set(sessionId, result);

      this.emitEvent(sessionId, {
        type: 'system',
        timestamp: Date.now(),
        data: {
          message: `E2E test ${result.testStatus}: Score ${result.visualScore}/100, ${result.findings.length} findings`,
          testStatus: result.testStatus,
          visualScore: result.visualScore,
        },
      });

      this.emit('e2e:complete', { sessionId, result });
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[ProcessManager] E2E test error:`, error);

      const errorResult: E2ETestResult = {
        testStatus: 'ERROR',
        visualScore: 0,
        screenshots: [],
        interactions: [],
        findings: [],
        devServerUrl: config.baseUrl,
        browserUsed: 'chromium',
        testDurationMs: 0,
        timestamp: Date.now(),
        summary: `E2E test ERROR: ${errorMessage}`,
      };

      this.latestE2EResults.set(sessionId, errorResult);

      this.emitEvent(sessionId, {
        type: 'error',
        timestamp: Date.now(),
        data: { message: `E2E test failed: ${errorMessage}` },
      });

      this.emit('e2e:error', { sessionId, error: errorMessage });
      return errorResult;

    } finally {
      this.e2eInProgress.delete(sessionId);
    }
  }

  /**
   * Generate E2E fix documents based on test results
   */
  async generateE2EFixDocs(config: {
    projectPath: string;
    sessionId: string;
    e2eResult: E2ETestResult;
  }): Promise<void> {
    const { projectPath, sessionId, e2eResult } = config;

    // Generate E2E fix prompt
    const projectName = path.basename(projectPath);
    const fixPrompt = generateE2EFixPromptMd(e2eResult, projectName);
    const fixPromptPath = path.join(projectPath, 'PROMPT_e2e_fix.md');
    await fs.writeFile(fixPromptPath, fixPrompt);

    // Append E2E findings to IMPLEMENTATION_PLAN.md
    const planPath = path.join(projectPath, 'IMPLEMENTATION_PLAN.md');
    let existingPlan = '';
    try {
      existingPlan = await fs.readFile(planPath, 'utf-8');
    } catch {
      existingPlan = '# Implementation Plan\n';
    }

    const e2eSection = generateE2EFindingsSection(e2eResult);
    await fs.writeFile(planPath, existingPlan + e2eSection);

    this.emitEvent(sessionId, {
      type: 'system',
      timestamp: Date.now(),
      data: { message: 'Generated E2E fix documents' },
    });
  }

  /**
   * Get the latest E2E test result for a session
   */
  getLatestE2EResult(sessionId: string): E2ETestResult | undefined {
    return this.latestE2EResults.get(sessionId);
  }

  /**
   * Check if an E2E test is in progress
   */
  isE2EInProgress(sessionId: string): boolean {
    return this.e2eInProgress.get(sessionId) || false;
  }

  /**
   * Generate default test scenarios for a project
   */
  generateDefaultE2EScenarios(baseUrl: string): TestScenario[] {
    return E2ETestRunner.generateDefaultScenarios(baseUrl);
  }

  /**
   * Check if IMPLEMENTATION_PLAN.md has remaining tasks
   */
  private async checkPlanExhausted(projectPath: string): Promise<boolean> {
    try {
      const planPath = path.join(projectPath, 'IMPLEMENTATION_PLAN.md');
      const content = await fs.readFile(planPath, 'utf-8');
      // Check for uncompleted tasks: "- [ ]"
      const hasRemainingTasks = /^-\s*\[\s*\]/m.test(content);
      return !hasRemainingTasks;
    } catch {
      // If file doesn't exist or can't be read, don't stop
      return false;
    }
  }

  /**
   * Handle RALPH_STATUS detection - track exit signal for loop control
   * Note: Git push moved to close handler per Ralph Wiggum technique
   */
  private handleRalphStatus(sessionId: string, status: RalphStatus): void {
    // Emit the status event
    this.emitEvent(sessionId, {
      type: 'ralph_status',
      timestamp: Date.now(),
      data: status,
    });

    console.log(`[ProcessManager] RALPH_STATUS received:`, status);

    // Track exit signal - the loop restart logic will check this
    if (status.exitSignal) {
      console.log(`[ProcessManager] EXIT_SIGNAL received - loop will stop after this iteration`);
      this.exitSignalReceived.set(sessionId, true);
      this.emitEvent(sessionId, {
        type: 'system',
        timestamp: Date.now(),
        data: { message: 'Exit signal received - loop will stop after this iteration completes.' },
      });
    }
  }

  /**
   * Get the current iteration count for a session
   */
  getIterationCount(sessionId: string): number {
    return this.iterationCounts.get(sessionId) || 0;
  }

  /**
   * Get the config for a session
   */
  getSessionConfig(sessionId: string): LoopConfig | undefined {
    return this.sessionConfigs.get(sessionId);
  }

  /**
   * Set the config for a session (used for manual review when no active loop)
   */
  setSessionConfig(sessionId: string, config: LoopConfig): void {
    this.sessionConfigs.set(sessionId, config);
  }

  /**
   * Get Claude's session ID for resuming
   */
  getClaudeSessionId(sessionId: string): string | undefined {
    return this.claudeSessionIds.get(sessionId);
  }

  /**
   * Get the current git branch for a session
   */
  getBranch(sessionId: string): string | undefined {
    return this.currentBranches.get(sessionId);
  }

  /**
   * Stop a running loop
   */
  async stopLoop(sessionId: string): Promise<boolean> {
    // Mark loop as stopped so it won't restart
    this.shouldContinueLoop.set(sessionId, false);

    const proc = this.processes.get(sessionId);
    if (!proc) {
      // Clean up even if no process
      this.cleanupSession(sessionId);
      return false;
    }

    console.log(`[ProcessManager] Stopping loop for session ${sessionId}`);

    // Send SIGTERM first
    proc.kill('SIGTERM');

    // Force kill after timeout
    setTimeout(() => {
      if (this.processes.has(sessionId)) {
        proc.kill('SIGKILL');
      }
    }, 5000);

    return true;
  }

  /**
   * Pause a running loop (Unix only)
   */
  async pauseLoop(sessionId: string): Promise<boolean> {
    const proc = this.processes.get(sessionId);
    if (!proc) return false;

    if (process.platform !== 'win32') {
      proc.kill('SIGSTOP');
    }
    return true;
  }

  /**
   * Resume a paused loop (Unix only)
   */
  async resumeLoop(sessionId: string): Promise<boolean> {
    const proc = this.processes.get(sessionId);
    if (!proc) return false;

    if (process.platform !== 'win32') {
      proc.kill('SIGCONT');
    }
    return true;
  }

  /**
   * Check if a session is running
   */
  isRunning(sessionId: string): boolean {
    return this.processes.has(sessionId);
  }

  /**
   * Get all running session IDs
   */
  getRunningSessions(): string[] {
    return Array.from(this.processes.keys());
  }

  private emitEvent(sessionId: string, event: StreamEvent): void {
    this.emit('event', { sessionId, event });
    this.emit(`session:${sessionId}`, event);
  }
}

// Singleton instance
let processManager: ProcessManager | null = null;

export function getProcessManager(): ProcessManager {
  if (!processManager) {
    processManager = new ProcessManager();
  }
  return processManager;
}
