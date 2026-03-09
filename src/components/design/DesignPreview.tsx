'use client';

import { useState } from 'react';
import { Monitor, Tablet, Smartphone, X, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface DesignPreviewProps {
  htmlContent: string;
  pageName: string;
  score?: number;
  status?: string;
  onClose?: () => void;
  isModal?: boolean;
}

type Viewport = 'desktop' | 'tablet' | 'mobile';

const viewportWidths: Record<Viewport, number> = {
  desktop: 1280,
  tablet: 768,
  mobile: 375,
};

function getScoreColor(score: number): string {
  if (score >= 80) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
  if (score >= 60) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
  return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
}

export function DesignPreview({
  htmlContent,
  pageName,
  score,
  status,
  onClose,
  isModal = false,
}: DesignPreviewProps) {
  const [viewport, setViewport] = useState<Viewport>('desktop');
  const width = viewportWidths[viewport];

  const containerClass = isModal
    ? 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4'
    : '';

  const panelClass = isModal
    ? 'bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden'
    : 'border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden';

  return (
    <div className={containerClass} onClick={isModal ? onClose : undefined}>
      <div className={panelClass} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-sm">{pageName}</h3>
            {score !== undefined && (
              <Badge className={getScoreColor(score)}>
                {score}/100
              </Badge>
            )}
            {status && (
              <Badge variant="outline" className="text-xs">
                {status}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-1">
            {/* Viewport toggles */}
            <Button
              variant={viewport === 'desktop' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewport('desktop')}
              title="Desktop (1280px)"
            >
              <Monitor className="h-4 w-4" />
            </Button>
            <Button
              variant={viewport === 'tablet' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewport('tablet')}
              title="Tablet (768px)"
            >
              <Tablet className="h-4 w-4" />
            </Button>
            <Button
              variant={viewport === 'mobile' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewport('mobile')}
              title="Mobile (375px)"
            >
              <Smartphone className="h-4 w-4" />
            </Button>

            {onClose && (
              <Button variant="ghost" size="sm" onClick={onClose} className="ml-2">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Iframe Preview */}
        <div className={`flex-1 overflow-auto bg-gray-100 dark:bg-gray-950 flex justify-center ${isModal ? 'p-4' : 'p-2'}`}>
          <div
            style={{
              width: `${width}px`,
              maxWidth: '100%',
              transition: 'width 300ms ease',
            }}
          >
            <iframe
              srcDoc={htmlContent}
              className="w-full bg-white border border-gray-200 dark:border-gray-700 rounded"
              style={{
                height: isModal ? '70vh' : '400px',
                pointerEvents: isModal ? 'auto' : 'none',
              }}
              title={`${pageName} design preview`}
              sandbox="allow-scripts"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Small thumbnail preview for grid cards
 */
export function DesignThumbnail({
  htmlContent,
  onClick,
}: {
  htmlContent: string;
  onClick?: () => void;
}) {
  return (
    <div
      className="relative group cursor-pointer border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white"
      onClick={onClick}
    >
      <iframe
        srcDoc={htmlContent}
        className="w-full pointer-events-none"
        style={{
          height: '200px',
          transform: 'scale(0.25)',
          transformOrigin: 'top left',
          width: '400%',
        }}
        title="Design thumbnail"
        sandbox=""
      />
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
        <Maximize2 className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
      </div>
    </div>
  );
}
