'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Monitor,
  Smartphone,
  Tablet,
  Image,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from 'lucide-react';
import type { E2ETestResult, ScreenshotCapture, VisualFinding } from '@/types/e2e';
import { ScreenshotGallery } from './ScreenshotGallery';

interface E2ETestPanelProps {
  result: E2ETestResult;
  screenshots: ScreenshotCapture[];
  isRunning?: boolean;
  phase?: string | null;
  onApproveFix?: () => void;
  onDismiss?: () => void;
  projectPath?: string;
}

export function E2ETestPanel({
  result,
  screenshots,
  isRunning = false,
  phase = null,
  onApproveFix,
  onDismiss,
  projectPath,
}: E2ETestPanelProps) {
  const [showFindings, setShowFindings] = useState(true);
  const [showScreenshots, setShowScreenshots] = useState(false);
  const [showInteractions, setShowInteractions] = useState(false);

  const getStatusIcon = () => {
    if (isRunning) {
      return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
    }
    switch (result.testStatus) {
      case 'PASS':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'PARTIAL':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      case 'FAIL':
      case 'ERROR':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusColor = () => {
    switch (result.testStatus) {
      case 'PASS':
        return 'border-green-200 bg-green-50';
      case 'PARTIAL':
        return 'border-yellow-200 bg-yellow-50';
      case 'FAIL':
      case 'ERROR':
        return 'border-red-200 bg-red-50';
      default:
        return 'border-gray-200 bg-gray-50';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'HIGH':
        return 'bg-red-100 text-red-800';
      case 'MEDIUM':
        return 'bg-yellow-100 text-yellow-800';
      case 'LOW':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'layout':
        return <Monitor className="h-4 w-4" />;
      case 'style':
        return <Image className="h-4 w-4" />;
      default:
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  const highFindings = result.findings.filter((f) => f.priority === 'HIGH');
  const mediumFindings = result.findings.filter((f) => f.priority === 'MEDIUM');
  const lowFindings = result.findings.filter((f) => f.priority === 'LOW');

  const successfulInteractions = result.interactions.filter((i) => i.status === 'success').length;
  const failedInteractions = result.interactions.filter((i) => i.status === 'error').length;

  return (
    <Card className={`border-2 ${getStatusColor()}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getStatusIcon()}
            <div>
              <CardTitle className="text-lg">
                {isRunning ? `E2E Testing: ${phase || 'In Progress'}` : `E2E Test: ${result.testStatus}`}
              </CardTitle>
              <p className="text-sm text-gray-600">
                Visual Score: {result.visualScore}/100 | {result.screenshots.length} screenshots | {result.findings.length} findings
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-2xl font-bold">{result.visualScore}</span>
            <span className="text-sm text-gray-500">/100</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Summary */}
        <p className="text-sm text-gray-700">{result.summary}</p>

        {/* Quick Stats */}
        <div className="grid grid-cols-4 gap-2 text-center text-sm">
          <div className="bg-white rounded p-2">
            <div className="font-medium">{result.screenshots.length}</div>
            <div className="text-gray-500">Screenshots</div>
          </div>
          <div className="bg-white rounded p-2">
            <div className="font-medium text-green-600">{successfulInteractions}</div>
            <div className="text-gray-500">Passed</div>
          </div>
          <div className="bg-white rounded p-2">
            <div className="font-medium text-red-600">{failedInteractions}</div>
            <div className="text-gray-500">Failed</div>
          </div>
          <div className="bg-white rounded p-2">
            <div className="font-medium">{Math.round(result.testDurationMs / 1000)}s</div>
            <div className="text-gray-500">Duration</div>
          </div>
        </div>

        {/* Findings Section */}
        {result.findings.length > 0 && (
          <div>
            <button
              onClick={() => setShowFindings(!showFindings)}
              className="flex items-center gap-2 w-full text-left font-medium text-gray-700 mb-2"
            >
              {showFindings ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              Visual Findings ({result.findings.length})
            </button>

            {showFindings && (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {highFindings.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-red-600 mb-1">HIGH PRIORITY</div>
                    {highFindings.map((finding) => (
                      <FindingCard key={finding.id} finding={finding} />
                    ))}
                  </div>
                )}
                {mediumFindings.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-yellow-600 mb-1">MEDIUM PRIORITY</div>
                    {mediumFindings.map((finding) => (
                      <FindingCard key={finding.id} finding={finding} />
                    ))}
                  </div>
                )}
                {lowFindings.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-blue-600 mb-1">LOW PRIORITY</div>
                    {lowFindings.map((finding) => (
                      <FindingCard key={finding.id} finding={finding} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Screenshots Section */}
        {(screenshots.length > 0 || result.screenshots.length > 0) && (
          <div>
            <button
              onClick={() => setShowScreenshots(!showScreenshots)}
              className="flex items-center gap-2 w-full text-left font-medium text-gray-700 mb-2"
            >
              {showScreenshots ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              Screenshots ({screenshots.length || result.screenshots.length})
            </button>

            {showScreenshots && (
              <ScreenshotGallery
                screenshots={screenshots.length > 0 ? screenshots : result.screenshots}
                findings={result.findings}
              />
            )}
          </div>
        )}

        {/* Interactions Section */}
        {result.interactions.length > 0 && (
          <div>
            <button
              onClick={() => setShowInteractions(!showInteractions)}
              className="flex items-center gap-2 w-full text-left font-medium text-gray-700 mb-2"
            >
              {showInteractions ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              Interactions ({result.interactions.length})
            </button>

            {showInteractions && (
              <div className="space-y-1 max-h-48 overflow-y-auto text-sm">
                {result.interactions.map((interaction, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-2 p-2 rounded ${
                      interaction.status === 'success'
                        ? 'bg-green-50'
                        : interaction.status === 'error'
                        ? 'bg-red-50'
                        : 'bg-yellow-50'
                    }`}
                  >
                    {interaction.status === 'success' ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <span className="font-medium">{interaction.action}</span>
                    <span className="text-gray-500 truncate flex-1">{interaction.target}</span>
                    <span className="text-gray-400">{interaction.duration}ms</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        {!isRunning && (
          <div className="flex justify-end gap-2 pt-2 border-t">
            {onDismiss && (
              <Button variant="outline" size="sm" onClick={onDismiss}>
                Dismiss
              </Button>
            )}
            {onApproveFix && result.findings.length > 0 && (
              <Button size="sm" onClick={onApproveFix}>
                Approve & Fix Issues
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FindingCard({ finding }: { finding: VisualFinding }) {
  return (
    <div className="bg-white rounded p-2 text-sm border border-gray-100">
      <div className="flex items-start gap-2">
        <span
          className={`px-2 py-0.5 rounded text-xs font-medium ${
            finding.priority === 'HIGH'
              ? 'bg-red-100 text-red-800'
              : finding.priority === 'MEDIUM'
              ? 'bg-yellow-100 text-yellow-800'
              : 'bg-blue-100 text-blue-800'
          }`}
        >
          {finding.type}
        </span>
        <div className="flex-1">
          <p className="text-gray-800">{finding.description}</p>
          {finding.location && (
            <p className="text-gray-500 text-xs mt-1">Location: {finding.location}</p>
          )}
          {finding.suggestedFix && (
            <p className="text-green-700 text-xs mt-1">Fix: {finding.suggestedFix}</p>
          )}
        </div>
      </div>
    </div>
  );
}
