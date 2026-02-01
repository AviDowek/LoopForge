'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { Search, ArrowDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface TerminalLine {
  id: string;
  timestamp: Date;
  content: string;
  type: 'stdout' | 'stderr' | 'system' | 'ralph_status';
}

interface TerminalEmulatorProps {
  lines: TerminalLine[];
  autoScroll?: boolean;
  onAutoScrollChange?: (enabled: boolean) => void;
  className?: string;
}

export function TerminalEmulator({
  lines,
  autoScroll = true,
  onAutoScrollChange,
  className,
}: TerminalEmulatorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAtBottom, setIsAtBottom] = useState(true);

  // Auto-scroll to bottom when new lines are added
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  // Track scroll position to detect if user scrolled up
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 50;

    setIsAtBottom(atBottom);

    if (onAutoScrollChange && !atBottom && autoScroll) {
      onAutoScrollChange(false);
    }
  }, [autoScroll, onAutoScrollChange]);

  const scrollToBottom = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
      setIsAtBottom(true);
      onAutoScrollChange?.(true);
    }
  }, [onAutoScrollChange]);

  // Filter lines based on search
  const filteredLines = searchQuery
    ? lines.filter((line) =>
        line.content.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : lines;

  // Get line color based on type
  const getLineColor = (type: TerminalLine['type']) => {
    switch (type) {
      case 'stderr':
        return 'text-red-400';
      case 'system':
        return 'text-yellow-400';
      case 'ralph_status':
        return 'text-green-400';
      default:
        return 'text-gray-100';
    }
  };

  // Format RALPH_STATUS blocks
  const formatContent = (line: TerminalLine) => {
    if (line.type === 'ralph_status') {
      return (
        <pre className="whitespace-pre text-green-400 bg-green-950/30 p-2 rounded my-1">
          {line.content}
        </pre>
      );
    }

    // Highlight search matches
    if (searchQuery) {
      const regex = new RegExp(`(${searchQuery})`, 'gi');
      const parts = line.content.split(regex);

      return parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-yellow-500/50 text-yellow-100">
            {part}
          </mark>
        ) : (
          part
        )
      );
    }

    return line.content;
  };

  return (
    <div className={cn('relative flex flex-col h-full', className)}>
      {/* Search bar */}
      {searchOpen && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-2 bg-gray-800 rounded-lg p-2">
          <Search className="h-4 w-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 w-48 bg-gray-700 border-gray-600 text-white"
            autoFocus
          />
          <span className="text-xs text-gray-400">
            {filteredLines.length} / {lines.length}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => {
              setSearchOpen(false);
              setSearchQuery('');
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Terminal content */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 bg-gray-950 text-gray-100 font-mono text-sm p-4 overflow-y-auto overflow-x-hidden"
      >
        {filteredLines.map((line) => (
          <div
            key={line.id}
            className={cn('py-0.5 break-all', getLineColor(line.type))}
          >
            {formatContent(line)}
          </div>
        ))}

        {/* Blinking cursor */}
        <div className="inline-block h-4 w-2 bg-gray-400 animate-pulse" />
      </div>

      {/* Controls */}
      <div className="absolute bottom-4 right-4 flex gap-2">
        {!isAtBottom && (
          <Button
            size="sm"
            variant="secondary"
            onClick={scrollToBottom}
            className="gap-1"
          >
            <ArrowDown className="h-4 w-4" />
            Scroll to bottom
          </Button>
        )}

        <Button
          size="icon"
          variant="secondary"
          onClick={() => setSearchOpen(!searchOpen)}
          className="h-8 w-8"
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
