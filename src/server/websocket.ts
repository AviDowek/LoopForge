/**
 * WebSocket Server for LoopForge
 *
 * This runs as a separate process alongside Next.js to handle
 * real-time CLI output streaming.
 *
 * Usage: npx ts-node src/server/websocket.ts
 */

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { ProcessManager, getProcessManager, type LoopConfig } from '../lib/cli';

const app = express();
const httpServer = createServer(app);

// Settings file path (same as Next.js API uses)
const SETTINGS_FILE = join(process.cwd(), 'data', 'settings.json');

interface Settings {
  claudeCliPath?: string;
}

/**
 * Read settings from file to get Claude CLI path
 */
function getSettings(): Settings {
  try {
    if (existsSync(SETTINGS_FILE)) {
      const data = readFileSync(SETTINGS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error reading settings:', error);
  }
  return {};
}

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

const processManager = getProcessManager();

// Session to socket mapping
const sessionSockets = new Map<string, Set<string>>();

// Forward process manager events to connected clients
processManager.on('event', ({ sessionId, event }) => {
  io.to(`session:${sessionId}`).emit('loop:event', event);

  // Log for debugging
  if (event.type === 'ralph_status') {
    console.log(`[${sessionId}] RALPH_STATUS:`, event.data);
  }
});

processManager.on('session:end', ({ sessionId, exitCode }) => {
  console.log(`[${sessionId}] Session ended with code ${exitCode}`);
  io.to(`session:${sessionId}`).emit('loop:ended', { exitCode });
});

// Forward iteration updates to connected clients
processManager.on('iteration:update', ({ sessionId, iteration, maxIterations }) => {
  console.log(`[${sessionId}] Iteration update: ${iteration}${maxIterations ? `/${maxIterations}` : ''}`);
  io.to(`session:${sessionId}`).emit('loop:iteration', { iteration, maxIterations });
});

// Forward review events to connected clients
processManager.on('review:start', ({ sessionId }) => {
  console.log(`[${sessionId}] Review started`);
  io.to(`session:${sessionId}`).emit('review:start');
});

processManager.on('review:complete', ({ sessionId, result }) => {
  console.log(`[${sessionId}] Review complete: ${result.reviewStatus} (${result.overallScore}/100)`);
  io.to(`session:${sessionId}`).emit('review:complete', result);
});

processManager.on('review:error', ({ sessionId, error }) => {
  console.log(`[${sessionId}] Review error: ${error}`);
  io.to(`session:${sessionId}`).emit('review:error', { error });
});

// Forward E2E test events to connected clients
processManager.on('e2e:start', ({ sessionId }) => {
  console.log(`[${sessionId}] E2E test started`);
  io.to(`session:${sessionId}`).emit('e2e:start');
});

processManager.on('e2e:status', ({ sessionId, phase, viewport }) => {
  console.log(`[${sessionId}] E2E status: ${phase}${viewport ? ` (${viewport})` : ''}`);
  io.to(`session:${sessionId}`).emit('e2e:status', { phase, viewport });
});

processManager.on('e2e:screenshot', ({ sessionId, screenshot }) => {
  console.log(`[${sessionId}] E2E screenshot: ${screenshot.description}`);
  io.to(`session:${sessionId}`).emit('e2e:screenshot', screenshot);
});

processManager.on('e2e:complete', ({ sessionId, result }) => {
  console.log(`[${sessionId}] E2E complete: ${result.testStatus} (${result.visualScore}/100)`);
  io.to(`session:${sessionId}`).emit('e2e:complete', result);
});

processManager.on('e2e:error', ({ sessionId, error }) => {
  console.log(`[${sessionId}] E2E error: ${error}`);
  io.to(`session:${sessionId}`).emit('e2e:error', { error });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Join a session room to receive updates
  socket.on('join:session', (sessionId: string) => {
    socket.join(`session:${sessionId}`);

    // Track socket-session mapping
    if (!sessionSockets.has(sessionId)) {
      sessionSockets.set(sessionId, new Set());
    }
    sessionSockets.get(sessionId)?.add(socket.id);

    console.log(`[${socket.id}] Joined session ${sessionId}`);

    // Send current status
    socket.emit('loop:status', {
      isRunning: processManager.isRunning(sessionId),
      claudeSessionId: processManager.getClaudeSessionId(sessionId),
      iterationCount: processManager.getIterationCount(sessionId),
      branch: processManager.getBranch(sessionId),
      isReviewing: processManager.isReviewInProgress(sessionId),
      latestReview: processManager.getLatestReviewResult(sessionId) || null,
      isE2ETesting: processManager.isE2EInProgress(sessionId),
      latestE2EResult: processManager.getLatestE2EResult(sessionId) || null,
    });
  });

  // Get Claude session ID
  socket.on('get:claude-session', (sessionId: string) => {
    const claudeSessionId = processManager.getClaudeSessionId(sessionId);
    socket.emit('claude-session', { sessionId, claudeSessionId });
  });

  // Leave a session room
  socket.on('leave:session', (sessionId: string) => {
    socket.leave(`session:${sessionId}`);
    sessionSockets.get(sessionId)?.delete(socket.id);
    console.log(`[${socket.id}] Left session ${sessionId}`);
  });

  // Start a new loop
  socket.on('loop:start', async (config: LoopConfig) => {
    try {
      console.log(`[${socket.id}] Starting loop for session ${config.sessionId}`);

      // Get Claude CLI path from settings
      const settings = getSettings();
      const configWithCli: LoopConfig = {
        ...config,
        claudeCliPath: settings.claudeCliPath || undefined,
      };

      await processManager.startLoop(configWithCli);
      socket.emit('loop:started', { sessionId: config.sessionId });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      socket.emit('loop:error', { message });
    }
  });

  // Stop a running loop
  socket.on('loop:stop', async (sessionId: string) => {
    console.log(`[${socket.id}] Stopping loop ${sessionId}`);
    const stopped = await processManager.stopLoop(sessionId);
    socket.emit('loop:stopped', { sessionId, success: stopped });
  });

  // Pause a running loop
  socket.on('loop:pause', async (sessionId: string) => {
    console.log(`[${socket.id}] Pausing loop ${sessionId}`);
    const paused = await processManager.pauseLoop(sessionId);
    socket.emit('loop:paused', { sessionId, success: paused });
  });

  // Resume a paused loop
  socket.on('loop:resume', async (sessionId: string) => {
    console.log(`[${socket.id}] Resuming loop ${sessionId}`);
    const resumed = await processManager.resumeLoop(sessionId);
    socket.emit('loop:resumed', { sessionId, success: resumed });
  });

  // Trigger manual review
  socket.on('review:trigger', async (data: string | { sessionId: string; projectPath?: string; model?: string }) => {
    // Support both old format (just sessionId string) and new format (object with projectPath)
    const sessionId = typeof data === 'string' ? data : data.sessionId;
    const providedPath = typeof data === 'object' ? data.projectPath : undefined;
    const providedModel = typeof data === 'object' ? data.model : undefined;

    console.log(`[${socket.id}] Triggering manual review for ${sessionId}`);
    try {
      const config = processManager.getSessionConfig(sessionId);
      const settings = getSettings();

      // Use provided path, or fall back to config path
      const projectPath = providedPath || config?.projectPath;
      if (!projectPath) {
        socket.emit('review:error', { error: 'No project path found for session. Please provide projectPath.' });
        return;
      }

      // Store a minimal config for later continuation if not already stored
      if (!config && projectPath) {
        processManager.setSessionConfig(sessionId, {
          projectPath,
          promptFile: 'PROMPT_build.md',
          mode: 'build',
          model: providedModel || 'opus',
          sessionId,
        });
      }

      await processManager.runAutoReview({
        projectPath,
        sessionId,
        model: providedModel || config?.model || 'opus',
        claudeCliPath: settings.claudeCliPath,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      socket.emit('review:error', { error: message });
    }
  });

  // Approve continuation and restart loop
  socket.on('continue:approve', async ({ sessionId, reviewResult, projectPath: providedPath, model: providedModel }) => {
    console.log(`[${socket.id}] Approving continuation for ${sessionId}`);
    try {
      const config = processManager.getSessionConfig(sessionId);
      const settings = getSettings();

      // Use provided path or config path
      const projectPath = providedPath || config?.projectPath;
      if (!projectPath) {
        socket.emit('loop:error', { message: 'No config found for session. Please provide projectPath.' });
        return;
      }

      // Generate continuation docs
      await processManager.generateContinuationDocs({
        projectPath,
        sessionId,
        reviewResult,
      });

      // Start continuation loop - use config if available, otherwise create minimal config
      const continueConfig: LoopConfig = {
        projectPath,
        promptFile: 'PROMPT_continue.md',
        mode: config?.mode || 'build',
        model: providedModel || config?.model || 'opus',
        sessionId,
        claudeCliPath: settings.claudeCliPath || undefined,
        autoPush: config?.autoPush || false,
        verbose: config?.verbose || false,
        autoReview: config?.autoReview || false,
        autoContinue: {
          enabled: false, // Manual continuation, don't auto-continue again
          maxAutoIterations: 0,
          currentAutoIteration: 0,
        },
      };

      await processManager.startLoop(continueConfig);
      socket.emit('loop:started', { sessionId });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      socket.emit('loop:error', { message });
    }
  });

  // Get latest review result
  socket.on('review:get', (sessionId: string) => {
    const result = processManager.getLatestReviewResult(sessionId);
    socket.emit('review:result', { sessionId, result: result || null });
  });

  // Trigger E2E visual test
  socket.on('e2e:trigger', async (config: {
    sessionId: string;
    projectPath: string;
    headless?: boolean;
    viewports?: Array<{ name: string; width: number; height: number }>;
    devServerCommand?: string;
    devServerPort?: number;
    baseUrl?: string;
    model?: string;
  }) => {
    console.log(`[${socket.id}] Triggering E2E test for ${config.sessionId}`);
    try {
      const settings = getSettings();

      // Use port 3001 by default to avoid conflict with LoopForge (port 3000)
      const port = config.devServerPort || 3001;
      const baseUrl = config.baseUrl || `http://localhost:${port}`;

      // Append port flag to dev server command (works for Next.js, Vite, etc.)
      const devServerCommand = config.devServerCommand || `npm run dev -- -p ${port}`;

      const e2eConfig = {
        enabled: true,
        projectPath: config.projectPath,
        sessionId: config.sessionId,
        headless: config.headless ?? true,
        viewports: config.viewports || [
          { name: 'Desktop', width: 1920, height: 1080 },
          { name: 'Tablet', width: 768, height: 1024 },
          { name: 'Mobile', width: 375, height: 812 },
        ],
        testScenarios: processManager.generateDefaultE2EScenarios(baseUrl),
        screenshotOnEveryAction: true,
        timeout: 300000,
        devServerCommand,
        devServerPort: port,
        devServerReadyTimeout: 60000,
        baseUrl,
        claudeCliPath: settings.claudeCliPath,
        model: config.model || 'sonnet',
        // AI-driven testing: Claude analyzes pages and decides what to test
        aiDrivenTesting: true,
        aiMaxIterations: 15,
      };

      await processManager.runE2ETests(e2eConfig);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      socket.emit('e2e:error', { error: message });
    }
  });

  // Approve E2E fix and start continuation loop
  socket.on('e2e:approve-fix', async ({ sessionId, e2eResult, projectPath: providedPath, model: providedModel }) => {
    console.log(`[${socket.id}] Approving E2E fix for ${sessionId}`);
    try {
      const config = processManager.getSessionConfig(sessionId);
      const settings = getSettings();

      const projectPath = providedPath || config?.projectPath;
      if (!projectPath) {
        socket.emit('loop:error', { message: 'No project path found. Please provide projectPath.' });
        return;
      }

      // Generate E2E fix docs
      await processManager.generateE2EFixDocs({
        projectPath,
        sessionId,
        e2eResult,
      });

      // Start fix loop with E2E fix prompt
      const fixConfig = {
        projectPath,
        promptFile: 'PROMPT_e2e_fix.md',
        mode: 'build' as const,
        model: providedModel || config?.model || 'opus',
        sessionId,
        claudeCliPath: settings.claudeCliPath || undefined,
        autoPush: config?.autoPush || false,
        verbose: config?.verbose || false,
        autoReview: false, // Don't auto-review E2E fixes
      };

      await processManager.startLoop(fixConfig);
      socket.emit('loop:started', { sessionId });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      socket.emit('loop:error', { message });
    }
  });

  // Get latest E2E result
  socket.on('e2e:get', (sessionId: string) => {
    const result = processManager.getLatestE2EResult(sessionId);
    socket.emit('e2e:result', { sessionId, result: result || null });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);

    // Clean up session mappings
    for (const [sessionId, sockets] of sessionSockets) {
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        sessionSockets.delete(sessionId);
      }
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    runningSessions: processManager.getRunningSessions(),
  });
});

// Start server
const PORT = parseInt(process.env.WS_PORT || '3006', 10);

httpServer.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
