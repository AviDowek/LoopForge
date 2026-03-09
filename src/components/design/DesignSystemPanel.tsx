'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Check, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DesignSystem } from '@/types/design';

interface DesignSystemPanelProps {
  designSystem: DesignSystem;
  approved: boolean;
  onApprove: () => void;
  onRegenerate: () => void;
  isRegenerating?: boolean;
}

export function DesignSystemPanel({
  designSystem,
  approved,
  onApprove,
  onRegenerate,
  isRegenerating = false,
}: DesignSystemPanelProps) {
  const [expanded, setExpanded] = useState(!approved);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {approved && (
              <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                <Check className="h-3 w-3 text-white" />
              </div>
            )}
            <h3 className="font-semibold text-sm">Design System: &quot;{designSystem.name}&quot;</h3>
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {designSystem.description}
          </span>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="p-4 space-y-6">
          {/* Color Palettes */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Colors</h4>
            <div className="space-y-3">
              {(['primary', 'secondary', 'accent', 'neutral'] as const).map((palette) => (
                <div key={palette} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-20 capitalize">{palette}</span>
                  <div className="flex gap-1">
                    {designSystem.colors[palette].map((token) => (
                      <div
                        key={token.name}
                        className="w-7 h-7 rounded-md border border-gray-200 dark:border-gray-600 cursor-pointer hover:scale-110 transition-transform"
                        style={{ backgroundColor: token.value }}
                        title={`${token.name}: ${token.value}\n${token.usage}`}
                      />
                    ))}
                  </div>
                </div>
              ))}
              {/* Semantic Colors */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-20">Semantic</span>
                <div className="flex gap-1">
                  {Object.entries(designSystem.colors.semantic).map(([name, value]) => (
                    <div
                      key={name}
                      className="w-7 h-7 rounded-md border border-gray-200 dark:border-gray-600"
                      style={{ backgroundColor: value }}
                      title={`${name}: ${value}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Typography */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Typography</h4>
            <div className="space-y-1">
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span>Heading: <strong className="text-gray-700 dark:text-gray-300">{designSystem.typography.fontFamilies.heading}</strong></span>
                <span>Body: <strong className="text-gray-700 dark:text-gray-300">{designSystem.typography.fontFamilies.body}</strong></span>
                <span>Mono: <strong className="text-gray-700 dark:text-gray-300">{designSystem.typography.fontFamilies.mono}</strong></span>
              </div>
              <div className="mt-2 space-y-1 border border-gray-100 dark:border-gray-800 rounded-lg p-3">
                {designSystem.typography.scale.slice(0, 6).map((token) => (
                  <div key={token.name} className="flex items-baseline gap-3">
                    <span className="text-xs text-gray-400 w-16 shrink-0">{token.name}</span>
                    <span
                      style={{
                        fontSize: token.fontSize,
                        fontWeight: token.fontWeight,
                        lineHeight: token.lineHeight,
                        letterSpacing: token.letterSpacing,
                      }}
                      className="truncate"
                    >
                      The quick brown fox
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Spacing & Radii */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Spacing (base: {designSystem.spacing.unit}px)</h4>
              <div className="space-y-1">
                {Object.entries(designSystem.spacing.scale).map(([name, value]) => (
                  <div key={name} className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-8">{name}</span>
                    <div
                      className="h-3 bg-blue-200 dark:bg-blue-800 rounded-sm"
                      style={{ width: value }}
                    />
                    <span className="text-xs text-gray-400">{value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Border Radius</h4>
              <div className="space-y-1">
                {Object.entries(designSystem.borderRadius).map(([name, value]) => (
                  <div key={name} className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-10">{name}</span>
                    <div
                      className="w-8 h-8 border-2 border-gray-400 dark:border-gray-500"
                      style={{ borderRadius: value }}
                    />
                    <span className="text-xs text-gray-400">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
            {!approved && (
              <Button onClick={onApprove} size="sm">
                <Check className="mr-2 h-4 w-4" />
                Approve Design System
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={onRegenerate}
              disabled={isRegenerating}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isRegenerating ? 'animate-spin' : ''}`} />
              {isRegenerating ? 'Regenerating...' : 'Regenerate'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
