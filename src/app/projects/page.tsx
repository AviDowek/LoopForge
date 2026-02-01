'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Search, Filter, FolderOpen, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { formatRelativeTime } from '@/lib/utils';

interface ProjectData {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  path: string;
  status: string;
  llmProvider: 'openai' | 'claude';
  tasksCompleted: number;
  totalTasks: number;
  createdAt: string;
  updatedAt: string;
}

type ProjectStatus = 'running' | 'completed' | 'paused' | 'initialized' | 'error';

function getStatusBadge(status: ProjectStatus) {
  const variants: Record<ProjectStatus, { variant: 'default' | 'success' | 'warning' | 'secondary' | 'destructive'; label: string }> = {
    running: { variant: 'default', label: 'Running' },
    completed: { variant: 'success', label: 'Completed' },
    paused: { variant: 'warning', label: 'Paused' },
    initialized: { variant: 'secondary', label: 'Not Started' },
    error: { variant: 'destructive', label: 'Error' },
  };
  const config = variants[status] || variants.initialized;
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export default function ProjectsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'all'>('all');
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProjects() {
      try {
        const res = await fetch('/api/projects');
        const data = await res.json();
        setProjects(data.projects || []);
      } catch (error) {
        console.error('Failed to fetch projects:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchProjects();
  }, []);

  const filteredProjects = projects.filter((project) => {
    const matchesSearch =
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (project.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || project.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Manage your Ralph Wiggum projects
          </p>
        </div>
        <Link href="/projects/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            New Project
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ProjectStatus | 'all')}
            className="h-9 rounded-md border border-gray-200 bg-transparent px-3 text-sm dark:border-gray-800"
          >
            <option value="all">All Status</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="paused">Paused</option>
            <option value="initialized">Not Started</option>
          </select>
        </div>
      </div>

      {/* Projects Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : filteredProjects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FolderOpen className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium mb-2">No projects found</h3>
            <p className="text-gray-500 dark:text-gray-400 text-center max-w-sm mb-4">
              {searchQuery || statusFilter !== 'all'
                ? 'Try adjusting your search or filter criteria'
                : "You haven't created any projects yet. Get started by creating your first project."}
            </p>
            {!searchQuery && statusFilter === 'all' && (
              <Link href="/projects/new">
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create Your First Project
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card className="hover:border-gray-300 dark:hover:border-gray-700 transition-colors cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg truncate">{project.name}</CardTitle>
                      <CardDescription className="mt-1 line-clamp-2">
                        {project.description}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      {getStatusBadge(project.status as ProjectStatus)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Path */}
                    <div className="text-xs font-mono text-gray-500 dark:text-gray-400 truncate bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                      {project.path}
                    </div>

                    {/* Progress */}
                    {project.totalTasks > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500 dark:text-gray-400">Progress</span>
                          <span className="font-medium">
                            {project.tasksCompleted}/{project.totalTasks} tasks
                          </span>
                        </div>
                        <Progress
                          value={(project.tasksCompleted / project.totalTasks) * 100}
                        />
                      </div>
                    )}

                    {/* Meta */}
                    <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                      <span className="capitalize">{project.llmProvider}</span>
                      <span>Updated {formatRelativeTime(project.updatedAt)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
