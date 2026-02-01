'use client';

import { useState, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  X,
  Monitor,
  Tablet,
  Smartphone,
  AlertTriangle,
} from 'lucide-react';
import type { ScreenshotCapture, VisualFinding } from '@/types/e2e';

interface ScreenshotGalleryProps {
  screenshots: ScreenshotCapture[];
  findings?: VisualFinding[];
}

export function ScreenshotGallery({ screenshots, findings = [] }: ScreenshotGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const getDeviceIcon = (width: number) => {
    if (width >= 1024) return <Monitor className="h-3 w-3" />;
    if (width >= 768) return <Tablet className="h-3 w-3" />;
    return <Smartphone className="h-3 w-3" />;
  };

  const getFindingsForScreenshot = (screenshotId: string) => {
    return findings.filter((f) => f.screenshotId === screenshotId);
  };

  const handlePrev = () => {
    if (selectedIndex !== null && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
    }
  };

  const handleNext = () => {
    if (selectedIndex !== null && selectedIndex < screenshots.length - 1) {
      setSelectedIndex(selectedIndex + 1);
    }
  };

  // Handle keyboard navigation
  useEffect(() => {
    if (selectedIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'Escape') setSelectedIndex(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex]);

  const selectedScreenshot = selectedIndex !== null ? screenshots[selectedIndex] : null;
  const selectedFindings = selectedScreenshot ? getFindingsForScreenshot(selectedScreenshot.id) : [];

  return (
    <>
      {/* Thumbnail Grid */}
      <div className="grid grid-cols-3 gap-2">
        {screenshots.map((screenshot, index) => {
          const screenshotFindings = getFindingsForScreenshot(screenshot.id);
          const hasHighPriority = screenshotFindings.some((f) => f.priority === 'HIGH');

          return (
            <div
              key={screenshot.id}
              className={`relative cursor-pointer rounded overflow-hidden border-2 transition-all hover:border-blue-400 ${
                hasHighPriority ? 'border-red-300' : 'border-gray-200'
              }`}
              onClick={() => setSelectedIndex(index)}
            >
              {/* Thumbnail image */}
              {screenshot.base64 ? (
                <img
                  src={`data:image/png;base64,${screenshot.base64}`}
                  alt={screenshot.description}
                  className="w-full h-24 object-cover object-top"
                />
              ) : (
                <div className="w-full h-24 bg-gray-100 flex items-center justify-center">
                  <span className="text-xs text-gray-400">No preview</span>
                </div>
              )}

              {/* Viewport indicator */}
              <div className="absolute top-1 left-1 bg-black/50 text-white rounded px-1 py-0.5 text-xs flex items-center gap-1">
                {getDeviceIcon(screenshot.viewport.width)}
                <span>{screenshot.viewport.width}</span>
              </div>

              {/* Findings indicator */}
              {screenshotFindings.length > 0 && (
                <div
                  className={`absolute top-1 right-1 rounded-full px-1.5 py-0.5 text-xs font-medium flex items-center gap-1 ${
                    hasHighPriority ? 'bg-red-500 text-white' : 'bg-yellow-400 text-black'
                  }`}
                >
                  <AlertTriangle className="h-3 w-3" />
                  {screenshotFindings.length}
                </div>
              )}

              {/* Description */}
              <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs p-1 truncate">
                {screenshot.description}
              </div>
            </div>
          );
        })}
      </div>

      {/* Full-size Modal */}
      {selectedScreenshot && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center"
          onClick={() => setSelectedIndex(null)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-lg max-w-4xl max-h-[90vh] w-full mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                {getDeviceIcon(selectedScreenshot.viewport.width)}
                <span className="font-medium">{selectedScreenshot.description}</span>
                <span className="text-sm text-gray-500">
                  ({selectedScreenshot.viewport.width}x{selectedScreenshot.viewport.height})
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-500">
                  {selectedIndex! + 1} / {screenshots.length}
                </span>
                <button
                  onClick={() => setSelectedIndex(null)}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row">
              {/* Screenshot */}
              <div className="flex-1 relative bg-gray-100 dark:bg-gray-800 min-h-[400px] flex items-center justify-center">
                {selectedScreenshot.base64 ? (
                  <img
                    src={`data:image/png;base64,${selectedScreenshot.base64}`}
                    alt={selectedScreenshot.description}
                    className="max-w-full max-h-[60vh] object-contain"
                  />
                ) : (
                  <div className="text-gray-400">No preview available</div>
                )}

                {/* Navigation arrows */}
                {selectedIndex! > 0 && (
                  <button
                    onClick={handlePrev}
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-2 hover:bg-black/70"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                )}
                {selectedIndex! < screenshots.length - 1 && (
                  <button
                    onClick={handleNext}
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-2 hover:bg-black/70"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </button>
                )}
              </div>

              {/* Findings sidebar */}
              {selectedFindings.length > 0 && (
                <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l p-4 max-h-[300px] lg:max-h-[60vh] overflow-y-auto">
                  <h4 className="font-medium text-sm mb-3">
                    Findings ({selectedFindings.length})
                  </h4>
                  <div className="space-y-3">
                    {selectedFindings.map((finding) => (
                      <div
                        key={finding.id}
                        className={`p-2 rounded text-sm border ${
                          finding.priority === 'HIGH'
                            ? 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800'
                            : finding.priority === 'MEDIUM'
                            ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-800'
                            : 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                              finding.priority === 'HIGH'
                                ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                : finding.priority === 'MEDIUM'
                                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                                : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                            }`}
                          >
                            {finding.priority}
                          </span>
                          <span className="text-xs text-gray-500">{finding.type}</span>
                        </div>
                        <p className="text-gray-800 dark:text-gray-200">{finding.description}</p>
                        {finding.location && (
                          <p className="text-xs text-gray-500 mt-1">Location: {finding.location}</p>
                        )}
                        {finding.suggestedFix && (
                          <p className="text-xs text-green-700 dark:text-green-400 mt-1">Fix: {finding.suggestedFix}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
