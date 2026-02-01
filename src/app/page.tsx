'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, FolderOpen, Play, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface ProjectData {
  id: string;
  name: string;
  description: string | null;
  status: string;
  tasksCompleted: number;
  totalTasks: number;
  updatedAt: string;
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'running':
      return <Badge variant="default">Running</Badge>;
    case 'completed':
      return <Badge variant="success">Completed</Badge>;
    case 'paused':
      return <Badge variant="warning">Paused</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export default function DashboardPage() {
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

  const recentProjects = projects.slice(0, 3);
  const runningCount = projects.filter(p => p.status === 'running').length;
  const completedCount = projects.filter(p => p.status === 'completed').length;
  const totalTasks = projects.reduce((acc, p) => acc + p.totalTasks, 0);
  const avgTasks = projects.length > 0 ? Math.round(totalTasks / projects.length) : 0;

  const stats = [
    { label: 'Active Projects', value: projects.length, icon: FolderOpen },
    { label: 'Running Loops', value: runningCount, icon: Play },
    { label: 'Completed', value: completedCount, icon: CheckCircle2 },
    { label: 'Avg. Tasks/Project', value: avgTasks, icon: Clock },
  ];

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Welcome to LoopForge</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Automate software development with the Ralph Wiggum technique
          </p>
        </div>
        <Link href="/projects/new">
          <Button size="lg" className="gap-2">
            <Plus className="h-5 w-5" />
            New Project
          </Button>
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  {stat.label}
                </CardTitle>
                <Icon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{loading ? '-' : stat.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent Projects */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Recent Projects</h2>
          <Link href="/projects">
            <Button variant="ghost" size="sm">
              View all
            </Button>
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : recentProjects.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FolderOpen className="h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium mb-2">No projects yet</h3>
              <p className="text-gray-500 dark:text-gray-400 text-center max-w-sm mb-4">
                Create your first Ralph Wiggum project to get started
              </p>
              <Link href="/projects/new">
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create Your First Project
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {recentProjects.map((project) => (
              <Link key={project.id} href={`/projects/${project.id}`}>
                <Card className="hover:border-gray-300 dark:hover:border-gray-700 transition-colors cursor-pointer h-full">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{project.name}</CardTitle>
                        <CardDescription className="mt-1">{project.description}</CardDescription>
                      </div>
                      {getStatusBadge(project.status)}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500 dark:text-gray-400">Progress</span>
                        <span className="font-medium">
                          {project.tasksCompleted}/{project.totalTasks} tasks
                        </span>
                      </div>
                      <Progress value={project.totalTasks > 0 ? (project.tasksCompleted / project.totalTasks) * 100 : 0} />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Quick Start Guide */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Start</CardTitle>
          <CardDescription>Get started with LoopForge in 4 simple steps</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-900 text-white dark:bg-gray-50 dark:text-gray-900">
                1
              </div>
              <div>
                <h4 className="font-medium">Describe Your Idea</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Enter a short prompt about what you want to build
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-900 text-white dark:bg-gray-50 dark:text-gray-900">
                2
              </div>
              <div>
                <h4 className="font-medium">Review PRD</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  AI generates a detailed PRD for your approval
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-900 text-white dark:bg-gray-50 dark:text-gray-900">
                3
              </div>
              <div>
                <h4 className="font-medium">Approve Files</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Review generated specs and configuration
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-900 text-white dark:bg-gray-50 dark:text-gray-900">
                4
              </div>
              <div>
                <h4 className="font-medium">Launch Loop</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Start the Ralph Wiggum loop and watch it build
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
