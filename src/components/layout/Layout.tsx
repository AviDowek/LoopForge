'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useProjectStore } from '@/stores/projectStore';

interface LayoutProps {
  children: ReactNode;
  projectPath?: string;
}

export function Layout({ children, projectPath }: LayoutProps) {
  const { sidebarCollapsed } = useProjectStore();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div
        className={cn(
          'transition-all',
          sidebarCollapsed ? 'ml-16' : 'ml-64'
        )}
      >
        <Header projectPath={projectPath} />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
