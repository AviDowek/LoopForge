'use client';

import { useState } from 'react';
import { Check, CheckCheck, RefreshCw, Loader2, AlertTriangle, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { DesignPreview, DesignThumbnail } from './DesignPreview';
import type { PageDesign } from '@/types/design';

interface DesignApprovalGridProps {
  pageDesigns: PageDesign[];
  designApprovals: Record<string, boolean>;
  onApprove: (pageId: string) => void;
  onApproveAll: () => void;
  onRegenerate: (pageId: string, context?: string) => void;
  isGenerating: boolean;
  currentGeneratingPage?: string | null;
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
  if (score >= 60) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
  return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
}

function getStatusBadge(status: PageDesign['status']) {
  switch (status) {
    case 'generating':
      return <Badge className="bg-blue-100 text-blue-800"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Generating</Badge>;
    case 'judging':
      return <Badge className="bg-purple-100 text-purple-800"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Judging</Badge>;
    case 'iterating':
      return <Badge className="bg-orange-100 text-orange-800"><RefreshCw className="h-3 w-3 mr-1 animate-spin" />Iterating</Badge>;
    case 'passed':
      return <Badge className="bg-green-100 text-green-800"><Check className="h-3 w-3 mr-1" />Passed</Badge>;
    case 'failed':
      return <Badge className="bg-red-100 text-red-800"><AlertTriangle className="h-3 w-3 mr-1" />Failed</Badge>;
    case 'approved':
      return <Badge className="bg-green-100 text-green-800"><CheckCheck className="h-3 w-3 mr-1" />Approved</Badge>;
    default:
      return <Badge variant="outline">Pending</Badge>;
  }
}

export function DesignApprovalGrid({
  pageDesigns,
  designApprovals,
  onApprove,
  onApproveAll,
  onRegenerate,
  isGenerating,
  currentGeneratingPage,
}: DesignApprovalGridProps) {
  const [previewPage, setPreviewPage] = useState<PageDesign | null>(null);
  const [regeneratePageId, setRegeneratePageId] = useState<string | null>(null);
  const [regenerateContext, setRegenerateContext] = useState('');

  const allApproved = pageDesigns.length > 0 && pageDesigns.every((d) => designApprovals[d.id]);
  const completedCount = pageDesigns.filter((d) => d.status === 'passed' || d.status === 'approved').length;

  const handleRegenerate = (pageId: string) => {
    onRegenerate(pageId, regenerateContext || undefined);
    setRegeneratePageId(null);
    setRegenerateContext('');
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-sm">Page Designs</h3>
          <span className="text-xs text-gray-500">
            {completedCount}/{pageDesigns.length} complete
          </span>
          {isGenerating && (
            <Badge className="bg-blue-100 text-blue-800">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              {currentGeneratingPage ? `Generating: ${currentGeneratingPage}` : 'Generating...'}
            </Badge>
          )}
        </div>
        {!allApproved && completedCount === pageDesigns.length && (
          <Button size="sm" onClick={onApproveAll}>
            <CheckCheck className="mr-2 h-4 w-4" />
            Approve All
          </Button>
        )}
      </div>

      {/* Progress bar */}
      {isGenerating && (
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all duration-500"
            style={{ width: `${(completedCount / Math.max(pageDesigns.length, 1)) * 100}%` }}
          />
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {pageDesigns.map((page) => (
          <div
            key={page.id}
            className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-900"
          >
            {/* Thumbnail */}
            {page.htmlContent ? (
              <DesignThumbnail
                htmlContent={page.htmlContent}
                onClick={() => setPreviewPage(page)}
              />
            ) : (
              <div className="h-[200px] bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
                {page.status === 'generating' || page.status === 'judging' || page.status === 'iterating' ? (
                  <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
                ) : (
                  <span className="text-gray-400 text-sm">Pending</span>
                )}
              </div>
            )}

            {/* Info */}
            <div className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-sm">{page.name}</h4>
                  <p className="text-xs text-gray-500 truncate">{page.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  {page.judgeResult && (
                    <Badge className={getScoreColor(page.judgeResult.overallScore)}>
                      {page.judgeResult.overallScore}/100
                    </Badge>
                  )}
                  {getStatusBadge(page.status)}
                </div>
              </div>

              {/* Judge feedback preview */}
              {page.judgeResult && page.judgeResult.issues.length > 0 && !designApprovals[page.id] && (
                <div className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-800 rounded p-2 max-h-20 overflow-y-auto">
                  <strong>Judge feedback:</strong>
                  <ul className="mt-1 space-y-0.5">
                    {page.judgeResult.issues.slice(0, 2).map((issue, i) => (
                      <li key={i} className="truncate">- {issue}</li>
                    ))}
                    {page.judgeResult.issues.length > 2 && (
                      <li className="text-gray-400">+{page.judgeResult.issues.length - 2} more</li>
                    )}
                  </ul>
                </div>
              )}

              {/* Iteration info */}
              {page.iterationHistory.length > 0 && (
                <div className="text-xs text-gray-400">
                  Attempt {page.iterationHistory.length + 1}/4
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                {(page.status === 'passed' || page.status === 'approved') && (
                  <>
                    {!designApprovals[page.id] ? (
                      <Button size="sm" variant="default" onClick={() => onApprove(page.id)} className="text-xs h-7">
                        <Check className="mr-1 h-3 w-3" />
                        Approve
                      </Button>
                    ) : (
                      <Badge className="bg-green-100 text-green-800 text-xs">
                        <Check className="mr-1 h-3 w-3" />
                        Approved
                      </Badge>
                    )}
                    {regeneratePageId === page.id ? (
                      <div className="flex-1 space-y-2">
                        <Textarea
                          value={regenerateContext}
                          onChange={(e) => setRegenerateContext(e.target.value)}
                          placeholder="Describe what to change (optional)..."
                          className="text-xs h-16"
                        />
                        <div className="flex gap-2">
                          <Button size="sm" variant="default" onClick={() => handleRegenerate(page.id)} className="text-xs h-7">
                            Regenerate
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setRegeneratePageId(null); setRegenerateContext(''); }} className="text-xs h-7">
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRegeneratePageId(page.id)}
                        disabled={isGenerating}
                        className="text-xs h-7"
                      >
                        <MessageSquare className="mr-1 h-3 w-3" />
                        Regenerate
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Full-size preview modal */}
      {previewPage && (
        <DesignPreview
          htmlContent={previewPage.htmlContent}
          pageName={previewPage.name}
          score={previewPage.judgeResult?.overallScore}
          status={previewPage.status}
          onClose={() => setPreviewPage(null)}
          isModal
        />
      )}
    </div>
  );
}
