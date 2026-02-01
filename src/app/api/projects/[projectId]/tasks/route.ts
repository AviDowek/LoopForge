import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const PROJECTS_FILE = path.join(process.cwd(), 'data', 'projects.json');

interface Task {
  id: string;
  title: string;
  status: 'completed' | 'in_progress' | 'pending';
  epic?: string;
  story?: string;
  files?: string[];
  acceptance?: string;
}

interface Project {
  id: string;
  path: string;
}

/**
 * Parse IMPLEMENTATION_PLAN.md to extract tasks
 */
function parseImplementationPlan(content: string): Task[] {
  const tasks: Task[] = [];
  const lines = content.split('\n');

  let currentEpic = '';
  let currentStory = '';

  for (const line of lines) {
    // Match epic headers like "## E0: Audio Recording"
    const epicMatch = line.match(/^##\s+(E\d+):\s*(.+)/);
    if (epicMatch) {
      currentEpic = epicMatch[1];
      continue;
    }

    // Match story headers like "### E0-S0: Implement audio recording"
    const storyMatch = line.match(/^###\s+(E\d+-S\d+):\s*(.+)/);
    if (storyMatch) {
      currentStory = storyMatch[1];
      continue;
    }

    // Match tasks like "- [ ] E0-S0-T0: Task title (files: ...)"
    // or "- [x] E0-S0-T0: Task title"
    const taskMatch = line.match(/^-\s*\[([ xX])\]\s*(E\d+-S\d+-T\d+):\s*(.+)/);
    if (taskMatch) {
      const isCompleted = taskMatch[1].toLowerCase() === 'x';
      const taskId = taskMatch[2];
      let titleAndFiles = taskMatch[3].trim();

      // Extract files if present
      let files: string[] = [];
      const filesMatch = titleAndFiles.match(/\(files?:\s*(.+?)\)\s*$/);
      if (filesMatch) {
        files = filesMatch[1].split(',').map(f => f.trim());
        titleAndFiles = titleAndFiles.replace(/\s*\(files?:\s*.+?\)\s*$/, '').trim();
      }

      tasks.push({
        id: taskId,
        title: titleAndFiles,
        status: isCompleted ? 'completed' : 'pending',
        epic: currentEpic,
        story: currentStory,
        files,
      });
    }
  }

  return tasks;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;

    // Read projects file to get the project path
    let projects: Project[] = [];
    try {
      const data = await fs.readFile(PROJECTS_FILE, 'utf-8');
      projects = JSON.parse(data);
    } catch {
      return NextResponse.json({ error: 'Projects file not found' }, { status: 404 });
    }

    const project = projects.find(p => p.id === projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Read IMPLEMENTATION_PLAN.md from the project directory
    const planPath = path.join(project.path, 'IMPLEMENTATION_PLAN.md');

    let planContent: string;
    try {
      planContent = await fs.readFile(planPath, 'utf-8');
    } catch {
      return NextResponse.json({
        tasks: [],
        message: 'IMPLEMENTATION_PLAN.md not found'
      });
    }

    // Parse the implementation plan
    const tasks = parseImplementationPlan(planContent);

    return NextResponse.json({ tasks });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}
