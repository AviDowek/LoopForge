'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BreadcrumbItem {
  label: string;
  href: string;
}

function generateBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const paths = pathname.split('/').filter(Boolean);
  const breadcrumbs: BreadcrumbItem[] = [];

  let currentPath = '';
  for (const path of paths) {
    currentPath += `/${path}`;
    let label = path.charAt(0).toUpperCase() + path.slice(1);

    // Handle special cases
    if (path === 'new') {
      label = 'New Project';
    }

    breadcrumbs.push({
      label,
      href: currentPath,
    });
  }

  return breadcrumbs;
}

interface HeaderProps {
  projectPath?: string;
}

export function Header({ projectPath }: HeaderProps) {
  const pathname = usePathname();
  const breadcrumbs = generateBreadcrumbs(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:border-gray-800 dark:bg-gray-950/95 dark:supports-[backdrop-filter]:bg-gray-950/60">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1 text-sm">
        <Link
          href="/"
          className="flex items-center text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50"
        >
          <Home className="h-4 w-4" />
        </Link>

        {breadcrumbs.map((item, index) => (
          <div key={item.href} className="flex items-center gap-1">
            <ChevronRight className="h-4 w-4 text-gray-400" />
            <Link
              href={item.href}
              className={cn(
                'hover:text-gray-900 dark:hover:text-gray-50',
                index === breadcrumbs.length - 1
                  ? 'font-medium text-gray-900 dark:text-gray-50'
                  : 'text-gray-500 dark:text-gray-400'
              )}
            >
              {item.label}
            </Link>
          </div>
        ))}
      </nav>

      {/* Project Path (if available) */}
      {projectPath && (
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <span className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
            {projectPath}
          </span>
        </div>
      )}
    </header>
  );
}
