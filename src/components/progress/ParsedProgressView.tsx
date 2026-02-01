'use client';

import { CheckCircle2, XCircle, Clock, FileText, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TaskProgress {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  startTime?: Date;
  endTime?: Date;
  filesCreated?: string[];
}

interface RalphStatus {
  taskCompleted: string;
  filesCreated: string[];
  nextTask: string;
  exitSignal: boolean;
  notes: string;
}

interface ParsedProgressViewProps {
  tasks: TaskProgress[];
  currentStatus?: RalphStatus | null;
  errors?: string[];
  className?: string;
}

export function ParsedProgressView({
  tasks,
  currentStatus,
  errors = [],
  className,
}: ParsedProgressViewProps) {
  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const currentTask = tasks.find((t) => t.status === 'in_progress');
  const pendingTasks = tasks.filter((t) => t.status === 'pending');
  const failedTasks = tasks.filter((t) => t.status === 'failed');

  const progress = tasks.length > 0
    ? Math.round((completedTasks.length / tasks.length) * 100)
    : 0;

  return (
    <div className={cn('h-full overflow-y-auto p-4 space-y-6', className)}>
      {/* Progress Summary */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="font-medium">Overall Progress</h4>
          <span className="text-sm text-gray-500">
            {completedTasks.length}/{tasks.length} tasks ({progress}%)
          </span>
        </div>
        <div className="h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Latest Status */}
      {currentStatus && (
        <div className="space-y-3">
          <h4 className="font-medium text-sm text-gray-500">Latest Update</h4>
          <div className="space-y-2">
            <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-950/30 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
              <div>
                <div className="font-medium text-sm">Task Completed</div>
                <div className="text-xs text-gray-500">{currentStatus.taskCompleted}</div>
              </div>
            </div>

            {currentStatus.filesCreated.length > 0 && (
              <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                <FileText className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium text-sm">Files Created</div>
                  <div className="text-xs text-gray-500 font-mono space-y-0.5">
                    {currentStatus.filesCreated.map((file) => (
                      <div key={file}>{file}</div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {currentStatus.nextTask && !currentStatus.exitSignal && (
              <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                <Clock className="h-5 w-5 text-blue-500 shrink-0" />
                <div>
                  <div className="font-medium text-sm">Next Task</div>
                  <div className="text-xs text-gray-500">{currentStatus.nextTask}</div>
                </div>
              </div>
            )}

            {currentStatus.notes && (
              <div className="text-xs text-gray-500 italic p-2">
                {currentStatus.notes}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Current Task */}
      {currentTask && (
        <div className="space-y-2">
          <h4 className="font-medium text-sm text-gray-500">In Progress</h4>
          <div className="flex items-center gap-3 p-3 border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 rounded-lg">
            <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
            <div>
              <div className="font-medium text-sm">{currentTask.title}</div>
              <div className="text-xs text-gray-500 font-mono">{currentTask.id}</div>
            </div>
          </div>
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium text-sm text-red-500 flex items-center gap-1">
            <AlertTriangle className="h-4 w-4" />
            Errors ({errors.length})
          </h4>
          <div className="space-y-2">
            {errors.map((error, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-950/30 rounded-lg"
              >
                <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                <div className="text-sm text-red-700 dark:text-red-300 break-all">
                  {error}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Completed Tasks */}
      {completedTasks.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium text-sm text-gray-500">
            Recently Completed ({completedTasks.length})
          </h4>
          <div className="space-y-1">
            {completedTasks.slice(-5).reverse().map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"
              >
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="font-mono text-xs">{task.id}</span>
                <span className="truncate">{task.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Failed Tasks */}
      {failedTasks.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium text-sm text-red-500">
            Failed ({failedTasks.length})
          </h4>
          <div className="space-y-1">
            {failedTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400"
              >
                <XCircle className="h-4 w-4" />
                <span className="font-mono text-xs">{task.id}</span>
                <span className="truncate">{task.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Tasks Preview */}
      {pendingTasks.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium text-sm text-gray-500">
            Upcoming ({pendingTasks.length})
          </h4>
          <div className="space-y-1">
            {pendingTasks.slice(0, 5).map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-500"
              >
                <div className="h-4 w-4 rounded border-2 border-gray-300 dark:border-gray-700" />
                <span className="font-mono text-xs">{task.id}</span>
                <span className="truncate">{task.title}</span>
              </div>
            ))}
            {pendingTasks.length > 5 && (
              <div className="text-xs text-gray-400 pl-6">
                +{pendingTasks.length - 5} more...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
