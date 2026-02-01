'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import type { StreamEvent, RalphStatus, ReviewResult, AutoContinueConfig } from '@/types';
import type { E2ETestResult, ScreenshotCapture } from '@/types/e2e';

interface TerminalLine {
  id: string;
  timestamp: Date;
  content: string;
  type: 'stdout' | 'stderr' | 'system' | 'ralph_status';
}

interface UseLoopStreamOptions {
  enabled?: boolean;
  wsUrl?: string;
}

interface UseLoopStreamReturn {
  isConnected: boolean;
  isRunning: boolean;
  lines: TerminalLine[];
  latestStatus: RalphStatus | null;
  error: string | null;
  claudeSessionId: string | null;
  iterationCount: number;
  branch: string | null;
  // Review state
  reviewResult: ReviewResult | null;
  isReviewing: boolean;
  // E2E state
  e2eResult: E2ETestResult | null;
  isE2ETesting: boolean;
  e2eScreenshots: ScreenshotCapture[];
  e2ePhase: string | null;
  // Loop controls
  startLoop: (config: {
    projectPath: string;
    mode: 'plan' | 'build';
    promptFile?: string;
    model?: string;
    maxIterations?: number;
    autoPush?: boolean;
    verbose?: boolean;
    autoReview?: boolean;
    autoContinue?: AutoContinueConfig;
  }) => void;
  stopLoop: () => void;
  pauseLoop: () => void;
  resumeLoop: () => void;
  clearLines: () => void;
  // Review controls
  triggerReview: (projectPath?: string, model?: string) => void;
  approveContinuation: (projectPath?: string, model?: string) => void;
  clearReviewResult: () => void;
  // E2E controls
  triggerE2ETest: (config: {
    projectPath: string;
    headless?: boolean;
    viewports?: Array<{ name: string; width: number; height: number }>;
    devServerCommand?: string;
    devServerPort?: number;
    baseUrl?: string;
    model?: string;
  }) => void;
  approveE2EFix: (projectPath?: string, model?: string) => void;
  clearE2EResult: () => void;
}

export function useLoopStream(
  sessionId: string,
  options: UseLoopStreamOptions = {}
): UseLoopStreamReturn {
  const { enabled = true, wsUrl = 'http://localhost:3006' } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [latestStatus, setLatestStatus] = useState<RalphStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [claudeSessionId, setClaudeSessionId] = useState<string | null>(null);
  const [iterationCount, setIterationCount] = useState(0);
  const [branch, setBranch] = useState<string | null>(null);
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [e2eResult, setE2EResult] = useState<E2ETestResult | null>(null);
  const [isE2ETesting, setIsE2ETesting] = useState(false);
  const [e2eScreenshots, setE2EScreenshots] = useState<ScreenshotCapture[]>([]);
  const [e2ePhase, setE2EPhase] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const lineIdCounter = useRef(0);

  // Generate unique line ID
  const generateLineId = useCallback(() => {
    lineIdCounter.current += 1;
    return `line-${Date.now()}-${lineIdCounter.current}`;
  }, []);

  // Add a line to the output
  const addLine = useCallback(
    (content: string, type: TerminalLine['type']) => {
      setLines((prev) => [
        ...prev,
        {
          id: generateLineId(),
          timestamp: new Date(),
          content,
          type,
        },
      ]);
    },
    [generateLineId]
  );

  // Connect to WebSocket
  useEffect(() => {
    if (!enabled || !sessionId) return;

    const socket = io(wsUrl, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      setError(null);
      socket.emit('join:session', sessionId);
      addLine('Connected to loop server', 'system');
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      addLine('Disconnected from loop server', 'system');
    });

    socket.on('connect_error', (err) => {
      setError(`Connection error: ${err.message}`);
      addLine(`Connection error: ${err.message}`, 'system');
    });

    // Loop status update
    socket.on('loop:status', (data: {
      isRunning: boolean;
      claudeSessionId?: string;
      iterationCount?: number;
      branch?: string;
      isReviewing?: boolean;
      latestReview?: ReviewResult | null;
      isE2ETesting?: boolean;
      latestE2EResult?: E2ETestResult | null;
    }) => {
      setIsRunning(data.isRunning);
      if (data.claudeSessionId) setClaudeSessionId(data.claudeSessionId);
      if (data.iterationCount !== undefined) setIterationCount(data.iterationCount);
      if (data.branch) setBranch(data.branch);
      if (data.isReviewing !== undefined) setIsReviewing(data.isReviewing);
      if (data.latestReview !== undefined) setReviewResult(data.latestReview);
      if (data.isE2ETesting !== undefined) setIsE2ETesting(data.isE2ETesting);
      if (data.latestE2EResult !== undefined) setE2EResult(data.latestE2EResult);
    });

    // Loop started
    socket.on('loop:started', () => {
      setIsRunning(true);
      setIterationCount(1);
      addLine('Loop started', 'system');
    });

    // Iteration update
    socket.on('loop:iteration', (data: { iteration: number; maxIterations?: number }) => {
      setIterationCount(data.iteration);
      addLine(`Starting iteration ${data.iteration}${data.maxIterations ? ` of ${data.maxIterations}` : ''}`, 'system');
    });

    // Loop events
    socket.on('loop:event', (event: StreamEvent) => {
      switch (event.type) {
        case 'stdout':
          // Handle Claude CLI stream-json format
          const data = event.data as Record<string, unknown>;
          if (data.raw) {
            // Raw non-JSON output
            addLine(data.raw as string, 'stdout');
          } else if (data.type === 'assistant' && data.message) {
            // Assistant message - extract text from content
            const msg = data.message as { content?: Array<{ type: string; text?: string }> };
            if (msg.content) {
              for (const block of msg.content) {
                if (block.type === 'text' && block.text) {
                  addLine(block.text, 'stdout');
                } else if (block.type === 'tool_use') {
                  const toolBlock = block as { name?: string; input?: unknown };
                  addLine(`[Using tool: ${toolBlock.name}]`, 'stdout');
                }
              }
            }
          } else if (data.type === 'system' && data.subtype === 'init') {
            // System init message - capture Claude session ID
            const initData = data as { model?: string; cwd?: string; session_id?: string };
            if (initData.session_id) {
              setClaudeSessionId(initData.session_id);
            }
            addLine(`[Claude ${initData.model || 'unknown'} initialized in ${initData.cwd || 'unknown'}]`, 'system');
          } else if (data.type === 'result') {
            // Final result
            const resultData = data as { result?: string; is_error?: boolean };
            if (resultData.result) {
              addLine(`Result: ${resultData.result}`, resultData.is_error ? 'stderr' : 'stdout');
            }
          }
          break;

        case 'stderr':
          const errData = event.data as { message: string };
          addLine(errData.message, 'stderr');
          break;

        case 'system':
          const sysData = event.data as { message: string };
          addLine(sysData.message, 'system');
          break;

        case 'ralph_status':
          const status = event.data as RalphStatus;
          setLatestStatus(status);
          addLine(
            `RALPH_STATUS:\n  TASK_COMPLETED: "${status.taskCompleted}"\n  FILES_CREATED: ${JSON.stringify(status.filesCreated)}\n  NEXT_TASK: "${status.nextTask}"\n  EXIT_SIGNAL: ${status.exitSignal}`,
            'ralph_status'
          );
          break;

        case 'complete':
          const completeData = event.data as { exitCode: number };
          setIsRunning(false);
          addLine(`Loop completed with exit code ${completeData.exitCode}`, 'system');
          break;

        case 'error':
          const errorData = event.data as { message: string };
          addLine(`Error: ${errorData.message}`, 'stderr');
          setError(errorData.message);
          break;
      }
    });

    // Loop ended
    socket.on('loop:ended', (data: { exitCode: number }) => {
      setIsRunning(false);
      addLine(`Loop ended with exit code ${data.exitCode}`, 'system');
    });

    // Loop stopped
    socket.on('loop:stopped', (data: { success: boolean }) => {
      setIsRunning(false);
      addLine(data.success ? 'Loop stopped' : 'Failed to stop loop', 'system');
    });

    // Loop paused
    socket.on('loop:paused', (data: { success: boolean }) => {
      addLine(data.success ? 'Loop paused' : 'Failed to pause loop', 'system');
    });

    // Loop resumed
    socket.on('loop:resumed', (data: { success: boolean }) => {
      addLine(data.success ? 'Loop resumed' : 'Failed to resume loop', 'system');
    });

    // Loop error
    socket.on('loop:error', (data: { message: string }) => {
      setError(data.message);
      addLine(`Error: ${data.message}`, 'stderr');
    });

    // Review events
    socket.on('review:start', () => {
      setIsReviewing(true);
      addLine('Starting auto-review...', 'system');
    });

    socket.on('review:complete', (result: ReviewResult) => {
      setIsReviewing(false);
      setReviewResult(result);
      addLine(`Review complete: ${result.reviewStatus} (${result.overallScore}/100)`, 'system');
    });

    socket.on('review:error', ({ error }: { error: string }) => {
      setIsReviewing(false);
      addLine(`Review error: ${error}`, 'stderr');
      setError(error);
    });

    socket.on('review:result', ({ result }: { result: ReviewResult | null }) => {
      if (result) setReviewResult(result);
    });

    // E2E test events
    socket.on('e2e:start', () => {
      setIsE2ETesting(true);
      setE2EScreenshots([]);
      setE2EPhase('starting');
      addLine('Starting E2E visual tests...', 'system');
    });

    socket.on('e2e:status', ({ phase, viewport }: { phase: string; viewport?: string }) => {
      setE2EPhase(phase);
      addLine(`E2E: ${phase}${viewport ? ` (${viewport})` : ''}`, 'system');
    });

    socket.on('e2e:screenshot', (screenshot: ScreenshotCapture) => {
      setE2EScreenshots((prev) => [...prev, screenshot]);
      addLine(`Screenshot captured: ${screenshot.description}`, 'system');
    });

    socket.on('e2e:complete', (result: E2ETestResult) => {
      setIsE2ETesting(false);
      setE2EPhase(null);
      setE2EResult(result);
      addLine(`E2E test ${result.testStatus}: Score ${result.visualScore}/100, ${result.findings.length} findings`, 'system');
    });

    socket.on('e2e:error', ({ error }: { error: string }) => {
      setIsE2ETesting(false);
      setE2EPhase(null);
      addLine(`E2E test error: ${error}`, 'stderr');
      setError(error);
    });

    socket.on('e2e:result', ({ result }: { result: E2ETestResult | null }) => {
      if (result) setE2EResult(result);
    });

    return () => {
      socket.emit('leave:session', sessionId);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [enabled, sessionId, wsUrl, addLine]);

  // Control functions
  const startLoop = useCallback(
    (config: {
      projectPath: string;
      mode: 'plan' | 'build';
      promptFile?: string;
      model?: string;
      maxIterations?: number;
      autoPush?: boolean;
      verbose?: boolean;
      autoReview?: boolean;
      autoContinue?: AutoContinueConfig;
    }) => {
      if (!socketRef.current?.connected) {
        setError('Not connected to server');
        return;
      }

      // Clear previous review result when starting new loop
      setReviewResult(null);

      socketRef.current.emit('loop:start', {
        sessionId,
        projectPath: config.projectPath,
        mode: config.mode,
        promptFile: config.promptFile || (config.mode === 'plan' ? 'PROMPT_plan.md' : 'PROMPT_build.md'),
        model: config.model || 'opus',
        maxIterations: config.maxIterations || 0,
        autoPush: config.autoPush || false,
        verbose: config.verbose === true, // Default false - match Ralph Wiggum technique
        autoReview: config.autoReview || false,
        autoContinue: config.autoContinue || undefined,
      });
    },
    [sessionId]
  );

  const stopLoop = useCallback(() => {
    if (!socketRef.current?.connected) return;
    socketRef.current.emit('loop:stop', sessionId);
  }, [sessionId]);

  const pauseLoop = useCallback(() => {
    if (!socketRef.current?.connected) return;
    socketRef.current.emit('loop:pause', sessionId);
  }, [sessionId]);

  const resumeLoop = useCallback(() => {
    if (!socketRef.current?.connected) return;
    socketRef.current.emit('loop:resume', sessionId);
  }, [sessionId]);

  const clearLines = useCallback(() => {
    setLines([]);
  }, []);

  // Review control functions
  const triggerReview = useCallback((projectPath?: string, model?: string) => {
    if (!socketRef.current?.connected) {
      setError('Not connected to server');
      return;
    }
    // Pass projectPath and model for manual reviews after loop has ended
    socketRef.current.emit('review:trigger', { sessionId, projectPath, model });
  }, [sessionId]);

  const approveContinuation = useCallback((projectPath?: string, model?: string) => {
    if (!socketRef.current?.connected || !reviewResult) {
      setError('Not connected or no review result');
      return;
    }
    // Pass projectPath and model for continuation after session cleanup
    socketRef.current.emit('continue:approve', { sessionId, reviewResult, projectPath, model });
    setReviewResult(null); // Clear after approving
  }, [sessionId, reviewResult]);

  const clearReviewResult = useCallback(() => {
    setReviewResult(null);
  }, []);

  // E2E control functions
  const triggerE2ETest = useCallback((config: {
    projectPath: string;
    headless?: boolean;
    viewports?: Array<{ name: string; width: number; height: number }>;
    devServerCommand?: string;
    devServerPort?: number;
    baseUrl?: string;
    model?: string;
  }) => {
    if (!socketRef.current?.connected) {
      setError('Not connected to server');
      return;
    }
    // Clear previous E2E results
    setE2EResult(null);
    setE2EScreenshots([]);
    socketRef.current.emit('e2e:trigger', { sessionId, ...config });
  }, [sessionId]);

  const approveE2EFix = useCallback((projectPath?: string, model?: string) => {
    if (!socketRef.current?.connected || !e2eResult) {
      setError('Not connected or no E2E result');
      return;
    }
    socketRef.current.emit('e2e:approve-fix', { sessionId, e2eResult, projectPath, model });
    setE2EResult(null);
  }, [sessionId, e2eResult]);

  const clearE2EResult = useCallback(() => {
    setE2EResult(null);
    setE2EScreenshots([]);
  }, []);

  return {
    isConnected,
    isRunning,
    lines,
    latestStatus,
    error,
    claudeSessionId,
    iterationCount,
    branch,
    reviewResult,
    isReviewing,
    e2eResult,
    isE2ETesting,
    e2eScreenshots,
    e2ePhase,
    startLoop,
    stopLoop,
    pauseLoop,
    resumeLoop,
    clearLines,
    triggerReview,
    approveContinuation,
    clearReviewResult,
    triggerE2ETest,
    approveE2EFix,
    clearE2EResult,
  };
}
