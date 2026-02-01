'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Play,
  Pause,
  Square,
  FileText,
  CheckSquare,
  Terminal,
  FolderOpen,
  Clock,
  RotateCcw,
  ExternalLink,
  Loader2,
  AlertCircle,
  Wifi,
  WifiOff,
  Settings2,
  Code2,
  FolderCode,
  X,
  ClipboardCheck,
  RefreshCw,
  Monitor,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useProjectStore } from '@/stores/projectStore';
import { useLoopStream } from '@/hooks/useLoopStream';
import { ReviewResultPanel } from '@/components/review';
import { E2ETestPanel } from '@/components/e2e';
import { cn, formatRelativeTime } from '@/lib/utils';

interface ProjectData {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  path: string;
  status: string;
  llmProvider: string;
  tasksCompleted: number;
  totalTasks: number;
  currentTask?: string;
  createdAt: string;
  updatedAt: string;
}

interface TaskData {
  id: string;
  title: string;
  status: 'completed' | 'in_progress' | 'pending';
}

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const { outputMode, setOutputMode, autoScroll, toggleAutoScroll } = useProjectStore();
  const [project, setProject] = useState<ProjectData | null>(null);
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loopMode, setLoopMode] = useState<'plan' | 'build'>('build');
  const [showModeSelector, setShowModeSelector] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Ralph Wiggum settings
  const [maxIterations, setMaxIterations] = useState(0); // 0 = unlimited
  const [selectedModel, setSelectedModel] = useState<'opus' | 'sonnet' | 'haiku'>('opus');
  const [autoPush, setAutoPush] = useState(false);
  const [verboseOutput, setVerboseOutput] = useState(false);  // Default false per Ralph Wiggum technique

  // Auto-review settings
  const [autoReview, setAutoReview] = useState(false);
  const [autoContinue, setAutoContinue] = useState(false);
  const [maxAutoContinue, setMaxAutoContinue] = useState(3);

  // E2E testing settings
  const [autoE2ETest, setAutoE2ETest] = useState(false);
  const [e2eHeadless, setE2eHeadless] = useState(true);
  const [autoE2EFix, setAutoE2EFix] = useState(false);

  // Connect to WebSocket for loop streaming
  // Use projectId as sessionId for now
  const {
    isConnected,
    isRunning,
    lines,
    latestStatus,
    error: loopError,
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
  } = useLoopStream(projectId, {
    enabled: !!project, // Only connect once project is loaded
  });

  // Fetch project data and tasks
  useEffect(() => {
    async function fetchProject() {
      try {
        // Fetch project data
        const res = await fetch(`/api/projects/${projectId}`);
        if (!res.ok) {
          if (res.status === 404) {
            setError('Project not found');
          } else {
            setError('Failed to load project');
          }
          return;
        }
        const data = await res.json();
        setProject(data);

        // Fetch tasks from IMPLEMENTATION_PLAN.md
        try {
          const tasksRes = await fetch(`/api/projects/${projectId}/tasks`);
          if (tasksRes.ok) {
            const tasksData = await tasksRes.json();
            if (tasksData.tasks && tasksData.tasks.length > 0) {
              setTasks(tasksData.tasks.map((t: { id: string; title: string; status: string }) => ({
                id: t.id,
                title: t.title,
                status: t.status as 'completed' | 'in_progress' | 'pending',
              })));
            }
          }
        } catch (tasksErr) {
          console.error('Failed to fetch tasks:', tasksErr);
          // Non-fatal - just won't show tasks
        }
      } catch (err) {
        console.error('Failed to fetch project:', err);
        setError('Failed to load project');
      } finally {
        setLoading(false);
      }
    }
    fetchProject();
  }, [projectId]);

  // Update task status based on RALPH_STATUS
  useEffect(() => {
    if (latestStatus?.taskCompleted) {
      setTasks((prev) =>
        prev.map((task) =>
          task.id === latestStatus.taskCompleted
            ? { ...task, status: 'completed' as const }
            : task
        )
      );
    }
    if (latestStatus?.nextTask) {
      setTasks((prev) =>
        prev.map((task) =>
          task.id === latestStatus.nextTask
            ? { ...task, status: 'in_progress' as const }
            : task
        )
      );
    }
  }, [latestStatus]);

  // Poll tasks from IMPLEMENTATION_PLAN.md while loop is running
  useEffect(() => {
    if (!isRunning || !projectId) return;

    const fetchTasks = async () => {
      try {
        const tasksRes = await fetch(`/api/projects/${projectId}/tasks`);
        if (tasksRes.ok) {
          const tasksData = await tasksRes.json();
          if (tasksData.tasks && tasksData.tasks.length > 0) {
            setTasks(tasksData.tasks.map((t: { id: string; title: string; status: string }) => ({
              id: t.id,
              title: t.title,
              status: t.status as 'completed' | 'in_progress' | 'pending',
            })));
          }
        }
      } catch (err) {
        console.error('Failed to poll tasks:', err);
      }
    };

    // Poll every 10 seconds while running
    const interval = setInterval(fetchTasks, 10000);

    // Also fetch immediately on iteration change
    fetchTasks();

    return () => clearInterval(interval);
  }, [isRunning, projectId, iterationCount]);

  // Track previous isRunning state to detect when loop ends
  const wasRunningRef = useRef(false);

  // Fetch tasks when loop ends (transition from running to stopped)
  useEffect(() => {
    if (wasRunningRef.current && !isRunning && projectId) {
      // Loop just ended, fetch final task states
      const fetchFinalTasks = async () => {
        try {
          const tasksRes = await fetch(`/api/projects/${projectId}/tasks`);
          if (tasksRes.ok) {
            const tasksData = await tasksRes.json();
            if (tasksData.tasks && tasksData.tasks.length > 0) {
              setTasks(tasksData.tasks.map((t: { id: string; title: string; status: string }) => ({
                id: t.id,
                title: t.title,
                status: t.status as 'completed' | 'in_progress' | 'pending',
              })));
            }
          }
        } catch (err) {
          console.error('Failed to fetch final tasks:', err);
        }
      };
      fetchFinalTasks();
    }
    wasRunningRef.current = isRunning;
  }, [isRunning, projectId]);

  // Open path in VS Code
  const openInVSCode = async () => {
    if (!project) return;
    try {
      await fetch('/api/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'vscode', path: project.path }),
      });
    } catch (err) {
      console.error('Failed to open in VS Code:', err);
    }
  };

  // Open Claude CLI in terminal - resume session if running
  const openClaudeCLI = async () => {
    if (!project) return;
    try {
      await fetch('/api/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'claude-cli',
          path: project.path,
          sessionId: claudeSessionId, // Resume current session if available
        }),
      });
    } catch (err) {
      console.error('Failed to open Claude CLI:', err);
    }
  };

  // Open in file explorer
  const openInExplorer = async () => {
    if (!project) return;
    try {
      await fetch('/api/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'explorer', path: project.path }),
      });
    } catch (err) {
      console.error('Failed to open explorer:', err);
    }
  };

  // Handlers for loop controls
  const handleStart = () => {
    if (!project) return;

    // Determine prompt file based on mode
    const promptFile = loopMode === 'plan' ? 'PROMPT_plan.md' : 'PROMPT_build.md';

    startLoop({
      projectPath: project.path,
      mode: loopMode,
      promptFile,
      model: selectedModel,
      maxIterations,
      autoPush,
      verbose: verboseOutput,
      autoReview,
      autoContinue: autoContinue ? {
        enabled: true,
        maxAutoIterations: maxAutoContinue,
        currentAutoIteration: 0,
      } : undefined,
    });
    setShowSettingsModal(false);
  };

  const handlePause = () => pauseLoop();
  const handleResume = () => resumeLoop();
  const handleStop = () => stopLoop();

  // Derive loop status for UI
  const loopStatus = isRunning ? 'running' : 'stopped';

  // Convert lines for terminal display
  const terminalOutput = useMemo(() =>
    lines.map((line) => ({
      type: line.type,
      content: line.content,
    })),
    [lines]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <AlertCircle className="h-12 w-12 text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold mb-2">{error || 'Project not found'}</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-4">
          The project you&apos;re looking for doesn&apos;t exist or couldn&apos;t be loaded.
        </p>
        <Link href="/projects">
          <Button>Back to Projects</Button>
        </Link>
      </div>
    );
  }

  const tasksCompleted = tasks.filter((t) => t.status === 'completed').length;
  const totalTasks = tasks.length;
  const currentTask = tasks.find((t) => t.status === 'in_progress');

  return (
    <div className="space-y-6">
      {/* Project Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
            <Badge
              variant={
                loopStatus === 'running'
                  ? 'default'
                  : 'secondary'
              }
            >
              {loopStatus === 'running' ? 'Running' : 'Stopped'}
            </Badge>
            {/* Connection status indicator */}
            <Badge variant={isConnected ? 'success' : 'destructive'} className="gap-1">
              {isConnected ? (
                <>
                  <Wifi className="h-3 w-3" /> Connected
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3" /> Disconnected
                </>
              )}
            </Badge>
          </div>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{project.description}</p>
        </div>
        <div className="flex gap-2">
          {/* Mode selector dropdown */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowModeSelector(!showModeSelector)}
              disabled={isRunning}
            >
              <Settings2 className="mr-2 h-4 w-4" />
              {loopMode === 'plan' ? 'Plan Mode' : 'Build Mode'}
            </Button>
            {showModeSelector && !isRunning && (
              <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border rounded-lg shadow-lg z-10 min-w-[160px]">
                <button
                  className={cn(
                    'w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700',
                    loopMode === 'plan' && 'bg-gray-100 dark:bg-gray-700'
                  )}
                  onClick={() => {
                    setLoopMode('plan');
                    setShowModeSelector(false);
                  }}
                >
                  Plan Mode
                  <span className="block text-xs text-gray-500">Gap analysis only</span>
                </button>
                <button
                  className={cn(
                    'w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700',
                    loopMode === 'build' && 'bg-gray-100 dark:bg-gray-700'
                  )}
                  onClick={() => {
                    setLoopMode('build');
                    setShowModeSelector(false);
                  }}
                >
                  Build Mode
                  <span className="block text-xs text-gray-500">Implementation</span>
                </button>
              </div>
            )}
          </div>

          {isRunning ? (
            <>
              <Button variant="outline" onClick={handlePause}>
                <Pause className="mr-2 h-4 w-4" />
                Pause
              </Button>
              <Button variant="destructive" onClick={handleStop}>
                <Square className="mr-2 h-4 w-4" />
                Stop
              </Button>
            </>
          ) : (
            <Button onClick={() => setShowSettingsModal(true)} disabled={!isConnected}>
              <Play className="mr-2 h-4 w-4" />
              Start Loop
            </Button>
          )}
        </div>
      </div>

      {/* Connection/Loop Error */}
      {loopError && (
        <Card className="border-red-500/50 bg-red-50/50 dark:bg-red-950/20">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{loopError}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Not connected warning */}
      {!isConnected && !loopError && (
        <Card className="border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-950/20">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-300">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">
                WebSocket server not connected. Make sure to run <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">npm run dev:all</code> to start both Next.js and the WebSocket server.
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Project Path */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center justify-between">
            <button
              onClick={openInVSCode}
              className="flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-800 px-2 py-1 rounded transition-colors cursor-pointer"
              title="Open in VS Code"
            >
              <FolderOpen className="h-4 w-4 text-gray-400" />
              <code className="text-sm font-mono hover:text-blue-600 dark:hover:text-blue-400">
                {project.path}
              </code>
            </button>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={openInVSCode} title="Open in VS Code">
                <Code2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={openClaudeCLI}
                title={claudeSessionId ? `Resume Claude session ${claudeSessionId.slice(0, 8)}...` : 'Open Claude CLI'}
              >
                <Terminal className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={openInExplorer} title="Open in Explorer">
                <FolderCode className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Row */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium text-gray-500">Progress</CardTitle>
          </CardHeader>
          <CardContent className="py-3 pt-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl font-bold">
                {totalTasks > 0 ? Math.round((tasksCompleted / totalTasks) * 100) : 0}%
              </span>
              <span className="text-sm text-gray-500">
                {tasksCompleted}/{totalTasks}
              </span>
            </div>
            <Progress value={totalTasks > 0 ? (tasksCompleted / totalTasks) * 100 : 0} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium text-gray-500">Mode</CardTitle>
          </CardHeader>
          <CardContent className="py-3 pt-0">
            <span className="text-2xl font-bold capitalize">{loopMode}</span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium text-gray-500">
              {isRunning ? 'Iteration' : 'Output Lines'}
            </CardTitle>
          </CardHeader>
          <CardContent className="py-3 pt-0">
            <span className="text-2xl font-bold">
              {isRunning ? iterationCount : lines.length}
            </span>
            {isRunning && maxIterations > 0 && (
              <span className="text-sm text-gray-500 ml-1">/ {maxIterations}</span>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium text-gray-500">Provider</CardTitle>
          </CardHeader>
          <CardContent className="py-3 pt-0">
            <span className="text-lg font-medium capitalize">{project.llmProvider}</span>
          </CardContent>
        </Card>

        {branch && (
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-medium text-gray-500">Branch</CardTitle>
            </CardHeader>
            <CardContent className="py-3 pt-0">
              <span className="text-lg font-medium font-mono">{branch}</span>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Current Task from RALPH_STATUS */}
      {latestStatus?.nextTask && (
        <Card className="border-blue-500/50 bg-blue-50/50 dark:bg-blue-950/20">
          <CardContent className="py-4">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                Current Task:
              </span>
              <span className="text-sm">{latestStatus.nextTask}</span>
            </div>
            {latestStatus.filesCreated && latestStatus.filesCreated.length > 0 && (
              <div className="mt-2 text-xs text-gray-500">
                Files created: {latestStatus.filesCreated.join(', ')}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Review in Progress */}
      {isReviewing && (
        <Card className="border-purple-500/50 bg-purple-50/50 dark:bg-purple-950/20">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <RefreshCw className="h-5 w-5 text-purple-500 animate-spin" />
              <div>
                <div className="font-medium text-purple-700 dark:text-purple-300">
                  Auto-Review in Progress
                </div>
                <div className="text-sm text-gray-500">
                  Analyzing implementation against requirements...
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Review Result Panel */}
      {reviewResult && !isReviewing && (
        <ReviewResultPanel
          result={reviewResult}
          onApprove={() => approveContinuation(project?.path, selectedModel)}
          onDismiss={clearReviewResult}
          isAutoContinueEnabled={autoContinue}
        />
      )}

      {/* Manual Review Button - show when loop is stopped and no review in progress */}
      {!isRunning && !isReviewing && !reviewResult && project && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Run Manual Review</div>
                <div className="text-sm text-gray-500">
                  Analyze implementation against PRD requirements
                </div>
              </div>
              <Button onClick={() => triggerReview(project.path, selectedModel)} disabled={!isConnected}>
                <ClipboardCheck className="mr-2 h-4 w-4" />
                Run Review
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* E2E Testing in Progress */}
      {isE2ETesting && (
        <Card className="border-blue-500/50 bg-blue-50/50 dark:bg-blue-950/20">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <Monitor className="h-5 w-5 text-blue-500 animate-pulse" />
              <div className="flex-1">
                <div className="font-medium text-blue-700 dark:text-blue-300">
                  E2E Visual Testing in Progress
                </div>
                <div className="text-sm text-gray-500">
                  {e2ePhase || 'Starting test...'}
                  {e2eScreenshots.length > 0 && ` - ${e2eScreenshots.length} screenshots captured`}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* E2E Test Result Panel */}
      {e2eResult && !isE2ETesting && (
        <E2ETestPanel
          result={e2eResult}
          screenshots={e2eScreenshots}
          onApproveFix={() => approveE2EFix(project?.path, selectedModel)}
          onDismiss={clearE2EResult}
          projectPath={project?.path}
        />
      )}

      {/* Manual E2E Test Button - show when loop is stopped and no E2E in progress */}
      {!isRunning && !isE2ETesting && !e2eResult && project && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Run E2E Visual Test</div>
                <div className="text-sm text-gray-500">
                  Launch browser and test the generated application
                </div>
              </div>
              <Button
                onClick={() => triggerE2ETest({
                  projectPath: project.path,
                  headless: e2eHeadless,
                  model: selectedModel,
                })}
                disabled={!isConnected}
              >
                <Monitor className="mr-2 h-4 w-4" />
                Run E2E Test
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Terminal / Progress View */}
        <div className="lg:col-span-2">
          <Card className="h-[500px] flex flex-col">
            <CardHeader className="py-3 border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Terminal className="h-5 w-5" />
                  Loop Output
                </CardTitle>
                <div className="flex items-center gap-2">
                  <div className="flex rounded-lg border p-1">
                    <Button
                      variant={outputMode === 'raw' ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={() => setOutputMode('raw')}
                    >
                      Raw
                    </Button>
                    <Button
                      variant={outputMode === 'parsed' ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={() => setOutputMode('parsed')}
                    >
                      Clean
                    </Button>
                  </div>
                  <Button
                    variant={autoScroll ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={toggleAutoScroll}
                  >
                    Auto-scroll
                  </Button>
                  <Button variant="ghost" size="sm" onClick={clearLines}>
                    Clear
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-hidden">
              {outputMode === 'raw' ? (
                <div className="h-full bg-gray-950 text-gray-100 font-mono text-sm p-4 overflow-y-auto">
                  {terminalOutput.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500">
                      <Terminal className="h-8 w-8 mb-2 text-gray-600" />
                      <p className="text-sm">No output yet</p>
                      <p className="text-xs text-gray-600">Start the loop to see terminal output</p>
                    </div>
                  ) : (
                    <>
                      {terminalOutput.map((line, i) => (
                        <div
                          key={i}
                          className={cn(
                            'py-0.5',
                            line.type === 'system' && 'text-yellow-400',
                            line.type === 'stderr' && 'text-red-400',
                            line.type === 'ralph_status' && 'text-green-400 whitespace-pre'
                          )}
                        >
                          {line.content}
                        </div>
                      ))}
                      {isRunning && (
                        <div className="h-4 w-2 bg-gray-400 animate-pulse inline-block" />
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="h-full p-4 overflow-y-auto">
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <h4 className="font-medium text-sm text-gray-500">Recent Activity</h4>
                      {terminalOutput.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                          <Terminal className="h-8 w-8 mb-2 text-gray-400" />
                          <p className="text-sm">No activity yet</p>
                          <p className="text-xs">Start the loop to see progress</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {latestStatus?.taskCompleted && (
                            <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-950/30 rounded-lg">
                              <CheckSquare className="h-5 w-5 text-green-500" />
                              <div>
                                <div className="font-medium text-sm">Task Completed</div>
                                <div className="text-xs text-gray-500">
                                  {latestStatus.taskCompleted}
                                </div>
                              </div>
                            </div>
                          )}
                          {latestStatus?.nextTask && (
                            <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                              <Clock className="h-5 w-5 text-blue-500" />
                              <div>
                                <div className="font-medium text-sm">Current Task</div>
                                <div className="text-xs text-gray-500">
                                  {latestStatus.nextTask}
                                </div>
                              </div>
                            </div>
                          )}
                          {latestStatus?.filesCreated && latestStatus.filesCreated.length > 0 && (
                            <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                              <FileText className="h-5 w-5 text-gray-500" />
                              <div>
                                <div className="font-medium text-sm">Files Created</div>
                                <div className="text-xs text-gray-500">
                                  {latestStatus.filesCreated.join(', ')}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Task Checklist */}
        <div>
          <Card className="h-[500px] flex flex-col">
            <CardHeader className="py-3 border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <CheckSquare className="h-5 w-5" />
                  Checklist
                </CardTitle>
                <Link href={`/projects/${project.id}/checklist`}>
                  <Button variant="ghost" size="sm">
                    View All
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-y-auto">
              {tasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-8 text-gray-500">
                  <CheckSquare className="h-8 w-8 mb-2 text-gray-400" />
                  <p className="text-sm">No tasks found</p>
                  <p className="text-xs">Check IMPLEMENTATION_PLAN.md</p>
                </div>
              ) : (
                <div className="divide-y">
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      className={cn(
                        'flex items-center gap-3 px-4 py-3',
                        task.status === 'in_progress' && 'bg-blue-50/50 dark:bg-blue-950/20'
                      )}
                    >
                      <div
                        className={cn(
                          'h-4 w-4 rounded border-2 flex items-center justify-center',
                          task.status === 'completed' && 'bg-green-500 border-green-500',
                          task.status === 'in_progress' && 'border-blue-500',
                          task.status === 'pending' && 'border-gray-300 dark:border-gray-700'
                        )}
                      >
                        {task.status === 'completed' && (
                          <svg
                            className="h-3 w-3 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                        {task.status === 'in_progress' && (
                          <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div
                          className={cn(
                            'text-sm truncate',
                            task.status === 'completed' && 'text-gray-500 line-through'
                          )}
                        >
                          {task.title}
                        </div>
                        <div className="text-xs text-gray-400 font-mono">{task.id}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid gap-4 md:grid-cols-3">
        <Link href={`/projects/${project.id}/docs`}>
          <Card className="hover:border-gray-300 dark:hover:border-gray-700 transition-colors cursor-pointer">
            <CardContent className="flex items-center gap-4 py-4">
              <FileText className="h-8 w-8 text-gray-400" />
              <div>
                <div className="font-medium">Documents</div>
                <div className="text-sm text-gray-500">View PRD, specs, and prompts</div>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href={`/projects/${project.id}/loop`}>
          <Card className="hover:border-gray-300 dark:hover:border-gray-700 transition-colors cursor-pointer">
            <CardContent className="flex items-center gap-4 py-4">
              <Terminal className="h-8 w-8 text-gray-400" />
              <div>
                <div className="font-medium">Full Terminal</div>
                <div className="text-sm text-gray-500">View complete loop output</div>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href={`/projects/${project.id}/checklist`}>
          <Card className="hover:border-gray-300 dark:hover:border-gray-700 transition-colors cursor-pointer">
            <CardContent className="flex items-center gap-4 py-4">
              <CheckSquare className="h-8 w-8 text-gray-400" />
              <div>
                <div className="font-medium">Full Checklist</div>
                <div className="text-sm text-gray-500">View all tasks by epic</div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Ralph Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="h-5 w-5" />
                Loop Settings
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowSettingsModal(false)}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Mode Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Mode</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className={cn(
                      'p-3 rounded-lg border text-left',
                      loopMode === 'plan'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                    )}
                    onClick={() => setLoopMode('plan')}
                  >
                    <div className="font-medium">Plan</div>
                    <div className="text-xs text-gray-500">Gap analysis only</div>
                  </button>
                  <button
                    className={cn(
                      'p-3 rounded-lg border text-left',
                      loopMode === 'build'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                    )}
                    onClick={() => setLoopMode('build')}
                  >
                    <div className="font-medium">Build</div>
                    <div className="text-xs text-gray-500">Implementation</div>
                  </button>
                </div>
              </div>

              {/* Model Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Model</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['opus', 'sonnet', 'haiku'] as const).map((model) => (
                    <button
                      key={model}
                      className={cn(
                        'p-2 rounded-lg border text-center capitalize',
                        selectedModel === model
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      )}
                      onClick={() => setSelectedModel(model)}
                    >
                      {model}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500">
                  Opus: Best for complex tasks. Sonnet: Faster. Haiku: Cheapest.
                </p>
              </div>

              {/* Max Iterations */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Max Iterations</label>
                <input
                  type="number"
                  min="0"
                  value={maxIterations}
                  onChange={(e) => setMaxIterations(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
                  placeholder="0 = unlimited"
                />
                <p className="text-xs text-gray-500">
                  Set to 0 for unlimited iterations until completion.
                </p>
              </div>

              {/* Options */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">Verbose Output</div>
                    <div className="text-xs text-gray-500">Show detailed execution logs</div>
                  </div>
                  <button
                    className={cn(
                      'w-11 h-6 rounded-full transition-colors',
                      verboseOutput ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
                    )}
                    onClick={() => setVerboseOutput(!verboseOutput)}
                  >
                    <div
                      className={cn(
                        'w-5 h-5 rounded-full bg-white shadow transition-transform',
                        verboseOutput ? 'translate-x-5' : 'translate-x-0.5'
                      )}
                    />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">Auto Push</div>
                    <div className="text-xs text-gray-500">Push to git after each iteration</div>
                  </div>
                  <button
                    className={cn(
                      'w-11 h-6 rounded-full transition-colors',
                      autoPush ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
                    )}
                    onClick={() => setAutoPush(!autoPush)}
                  >
                    <div
                      className={cn(
                        'w-5 h-5 rounded-full bg-white shadow transition-transform',
                        autoPush ? 'translate-x-5' : 'translate-x-0.5'
                      )}
                    />
                  </button>
                </div>
              </div>

              {/* Auto-Review Settings */}
              <div className="space-y-3 border-t pt-4">
                <div className="text-sm font-medium text-gray-500">Review & Continuation</div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">Auto-Review</div>
                    <div className="text-xs text-gray-500">Review implementation after loop completes</div>
                  </div>
                  <button
                    className={cn(
                      'w-11 h-6 rounded-full transition-colors',
                      autoReview ? 'bg-purple-500' : 'bg-gray-300 dark:bg-gray-600'
                    )}
                    onClick={() => {
                      setAutoReview(!autoReview);
                      if (autoReview) setAutoContinue(false); // Disable auto-continue if disabling auto-review
                    }}
                  >
                    <div
                      className={cn(
                        'w-5 h-5 rounded-full bg-white shadow transition-transform',
                        autoReview ? 'translate-x-5' : 'translate-x-0.5'
                      )}
                    />
                  </button>
                </div>

                {autoReview && (
                  <>
                    <div className="flex items-center justify-between pl-4 border-l-2 border-purple-200 dark:border-purple-800">
                      <div>
                        <div className="text-sm font-medium">Auto-Continue</div>
                        <div className="text-xs text-gray-500">Automatically restart loop to fix issues</div>
                      </div>
                      <button
                        className={cn(
                          'w-11 h-6 rounded-full transition-colors',
                          autoContinue ? 'bg-purple-500' : 'bg-gray-300 dark:bg-gray-600'
                        )}
                        onClick={() => setAutoContinue(!autoContinue)}
                      >
                        <div
                          className={cn(
                            'w-5 h-5 rounded-full bg-white shadow transition-transform',
                            autoContinue ? 'translate-x-5' : 'translate-x-0.5'
                          )}
                        />
                      </button>
                    </div>

                    {autoContinue && (
                      <div className="pl-4 border-l-2 border-purple-200 dark:border-purple-800">
                        <label className="text-sm font-medium">Max Auto-Continuations</label>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={maxAutoContinue}
                          onChange={(e) => setMaxAutoContinue(Math.max(1, Math.min(10, parseInt(e.target.value) || 3)))}
                          className="w-full mt-1 px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Maximum loops before requiring manual approval
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* E2E Visual Testing Settings */}
              <div className="space-y-3 border-t pt-4">
                <div className="text-sm font-medium text-gray-500">E2E Visual Testing</div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">Auto E2E Test</div>
                    <div className="text-xs text-gray-500">Run visual tests after code review</div>
                  </div>
                  <button
                    className={cn(
                      'w-11 h-6 rounded-full transition-colors',
                      autoE2ETest ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
                    )}
                    onClick={() => {
                      setAutoE2ETest(!autoE2ETest);
                      if (autoE2ETest) setAutoE2EFix(false);
                    }}
                  >
                    <div
                      className={cn(
                        'w-5 h-5 rounded-full bg-white shadow transition-transform',
                        autoE2ETest ? 'translate-x-5' : 'translate-x-0.5'
                      )}
                    />
                  </button>
                </div>

                {autoE2ETest && (
                  <>
                    <div className="flex items-center justify-between pl-4 border-l-2 border-blue-200 dark:border-blue-800">
                      <div>
                        <div className="text-sm font-medium flex items-center gap-2">
                          Visible Browser
                          {e2eHeadless ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </div>
                        <div className="text-xs text-gray-500">Watch tests run (slower)</div>
                      </div>
                      <button
                        className={cn(
                          'w-11 h-6 rounded-full transition-colors',
                          !e2eHeadless ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
                        )}
                        onClick={() => setE2eHeadless(!e2eHeadless)}
                      >
                        <div
                          className={cn(
                            'w-5 h-5 rounded-full bg-white shadow transition-transform',
                            !e2eHeadless ? 'translate-x-5' : 'translate-x-0.5'
                          )}
                        />
                      </button>
                    </div>

                    <div className="flex items-center justify-between pl-4 border-l-2 border-blue-200 dark:border-blue-800">
                      <div>
                        <div className="text-sm font-medium">Auto-Fix Issues</div>
                        <div className="text-xs text-gray-500">Run continuation loop for E2E failures</div>
                      </div>
                      <button
                        className={cn(
                          'w-11 h-6 rounded-full transition-colors',
                          autoE2EFix ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
                        )}
                        onClick={() => setAutoE2EFix(!autoE2EFix)}
                      >
                        <div
                          className={cn(
                            'w-5 h-5 rounded-full bg-white shadow transition-transform',
                            autoE2EFix ? 'translate-x-5' : 'translate-x-0.5'
                          )}
                        />
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowSettingsModal(false)}
                >
                  Cancel
                </Button>
                <Button className="flex-1" onClick={handleStart}>
                  <Play className="mr-2 h-4 w-4" />
                  Start Loop
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
