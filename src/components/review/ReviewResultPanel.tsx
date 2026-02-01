'use client';

import { ReviewResult } from '@/types/review';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Play,
  Copy,
  X,
  Clock,
  FileText,
  Terminal,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReviewResultPanelProps {
  result: ReviewResult;
  onApprove?: () => void;
  onDismiss?: () => void;
  isAutoContinueEnabled?: boolean;
  isLoading?: boolean;
}

export function ReviewResultPanel({
  result,
  onApprove,
  onDismiss,
  isAutoContinueEnabled = false,
  isLoading = false,
}: ReviewResultPanelProps) {
  const statusIcon = {
    COMPLETE: <CheckCircle className="h-6 w-6 text-green-500" />,
    PARTIAL: <AlertTriangle className="h-6 w-6 text-yellow-500" />,
    INCOMPLETE: <XCircle className="h-6 w-6 text-red-500" />,
    ERROR: <XCircle className="h-6 w-6 text-red-500" />,
    PENDING: <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />,
  };

  const statusColors = {
    COMPLETE: 'border-green-500/50 bg-green-50/50 dark:bg-green-950/20',
    PARTIAL: 'border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-950/20',
    INCOMPLETE: 'border-red-500/50 bg-red-50/50 dark:bg-red-950/20',
    ERROR: 'border-red-500/50 bg-red-50/50 dark:bg-red-950/20',
    PENDING: 'border-blue-500/50 bg-blue-50/50 dark:bg-blue-950/20',
  };

  const priorityColors = {
    HIGH: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    MEDIUM: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    LOW: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  };

  const copySetupInstructions = () => {
    const text = [
      result.setupInstructions.envVars.length > 0 ? `# Environment Variables\n${result.setupInstructions.envVars.join('\n')}` : '',
      result.setupInstructions.installCommands.length > 0 ? `\n# Install\n${result.setupInstructions.installCommands.join('\n')}` : '',
      result.setupInstructions.buildCommand ? `\n# Build\n${result.setupInstructions.buildCommand}` : '',
      result.setupInstructions.testCommand ? `\n# Test\n${result.setupInstructions.testCommand}` : '',
      result.setupInstructions.runCommand ? `\n# Run\n${result.setupInstructions.runCommand}` : '',
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(text);
  };

  const completedCount = result.requirements.filter(r => r.status === 'COMPLETE').length;
  const totalCount = result.requirements.length;

  return (
    <Card className={cn('border-2', statusColors[result.reviewStatus])}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            {statusIcon[result.reviewStatus]}
            Review Result: {result.reviewStatus}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-lg font-bold">
              {result.overallScore}/100
            </Badge>
            {onDismiss && (
              <Button variant="ghost" size="sm" onClick={onDismiss}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        {result.reviewDurationMs && (
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Clock className="h-3 w-3" />
            Review took {(result.reviewDurationMs / 1000).toFixed(1)}s
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Summary */}
        <div>
          <h4 className="font-medium text-sm text-gray-500 mb-1">Summary</h4>
          <p className="text-sm">{result.summary}</p>
        </div>

        {/* Requirements Status */}
        {result.requirements.length > 0 && (
          <div>
            <h4 className="font-medium text-sm text-gray-500 mb-2 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Requirements ({completedCount}/{totalCount})
            </h4>
            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-2">
              {result.requirements.map((req) => (
                <div
                  key={req.id}
                  className="flex items-start gap-2 text-sm py-1 px-2 rounded bg-white/50 dark:bg-gray-900/50"
                >
                  {req.status === 'COMPLETE' && <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />}
                  {req.status === 'PARTIAL' && <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />}
                  {req.status === 'MISSING' && <XCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <span className={cn(
                      req.status === 'COMPLETE' && 'text-gray-500 line-through'
                    )}>
                      {req.description}
                    </span>
                    {req.notes && (
                      <p className="text-xs text-gray-400 mt-0.5">{req.notes}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Missing Items */}
        {result.missingItems.length > 0 && (
          <div>
            <h4 className="font-medium text-sm text-red-600 dark:text-red-400 mb-2">
              Missing Items ({result.missingItems.length})
            </h4>
            <ul className="space-y-2">
              {result.missingItems.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <Badge className={cn('text-xs flex-shrink-0', priorityColors[item.priority])}>
                    {item.priority}
                  </Badge>
                  <div>
                    <span>{item.description}</span>
                    {item.suggestedFix && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        Suggested: {item.suggestedFix}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Setup Instructions */}
        {(result.setupInstructions.buildCommand || result.setupInstructions.testCommand) && (
          <div className="bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg">
            <h4 className="font-medium text-sm text-gray-500 mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Terminal className="h-4 w-4" />
                Setup Instructions
              </span>
              <Button variant="ghost" size="sm" onClick={copySetupInstructions} title="Copy all">
                <Copy className="h-3 w-3" />
              </Button>
            </h4>
            <div className="text-xs font-mono space-y-2">
              {result.setupInstructions.envVars.length > 0 && (
                <div>
                  <span className="text-gray-400">Env vars:</span>
                  <pre className="bg-gray-100 dark:bg-gray-800 p-2 rounded mt-1 overflow-x-auto">
                    {result.setupInstructions.envVars.join('\n')}
                  </pre>
                </div>
              )}
              {result.setupInstructions.installCommands.length > 0 && (
                <div>
                  <span className="text-gray-400">Install:</span>
                  <code className="ml-2 bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">
                    {result.setupInstructions.installCommands.join(' && ')}
                  </code>
                </div>
              )}
              {result.setupInstructions.buildCommand && (
                <div>
                  <span className="text-gray-400">Build:</span>
                  <code className="ml-2 bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">
                    {result.setupInstructions.buildCommand}
                  </code>
                </div>
              )}
              {result.setupInstructions.testCommand && (
                <div>
                  <span className="text-gray-400">Test:</span>
                  <code className="ml-2 bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">
                    {result.setupInstructions.testCommand}
                  </code>
                </div>
              )}
              {result.setupInstructions.runCommand && (
                <div>
                  <span className="text-gray-400">Run:</span>
                  <code className="ml-2 bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">
                    {result.setupInstructions.runCommand}
                  </code>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Testing Notes */}
        {result.testingNotes && (
          <div>
            <h4 className="font-medium text-sm text-gray-500 mb-1">Testing Notes</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">{result.testingNotes}</p>
          </div>
        )}

        {/* Actions */}
        {result.reviewStatus !== 'COMPLETE' && result.missingItems.length > 0 && onApprove && (
          <div className="flex gap-2 pt-3 border-t">
            <Button
              onClick={onApprove}
              className="flex-1"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {isAutoContinueEnabled ? 'Auto-Continuing...' : 'Starting...'}
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Approve & Continue
                </>
              )}
            </Button>
            {onDismiss && (
              <Button variant="outline" onClick={onDismiss} disabled={isLoading}>
                Dismiss
              </Button>
            )}
          </div>
        )}

        {/* Complete status - no actions needed */}
        {result.reviewStatus === 'COMPLETE' && (
          <div className="flex items-center gap-2 pt-3 border-t text-green-600 dark:text-green-400">
            <CheckCircle className="h-5 w-5" />
            <span className="font-medium">All requirements met! Project is complete.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
