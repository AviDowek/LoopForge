import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

// Note: In production, use the database module
// For now, using a simple file-based approach for compatibility

const PROJECTS_BASE = process.env.PROJECTS_BASE_PATH || path.join(process.env.HOME || process.env.USERPROFILE || '', 'ralph-projects');
const DB_FILE = path.join(process.cwd(), 'data', 'projects.json');

interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  shortPrompt: string;
  path: string;
  status: string;
  llmProvider: 'openai' | 'claude';
  createdAt: string;
  updatedAt: string;
}

async function ensureDataDir() {
  const dataDir = path.dirname(DB_FILE);
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

async function readProjects(): Promise<Project[]> {
  await ensureDataDir();
  try {
    const data = await fs.readFile(DB_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeProjects(projects: Project[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(DB_FILE, JSON.stringify(projects, null, 2));
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// GET /api/projects - List all projects
export async function GET() {
  try {
    const projects = await readProjects();

    // Add task counts (to be populated from task data when available)
    const projectsWithProgress = projects.map((p) => ({
      ...p,
      tasksCompleted: 0,
      totalTasks: 0,
    }));

    return NextResponse.json({ projects: projectsWithProgress });
  } catch (error) {
    console.error('Error fetching projects:', error);
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}

// POST /api/projects - Create new project
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, shortPrompt, llmProvider } = body;

    if (!name || !shortPrompt) {
      return NextResponse.json(
        { error: 'Name and shortPrompt are required' },
        { status: 400 }
      );
    }

    const id = uuidv4();
    const slug = slugify(name) + '-' + id.slice(0, 8);
    const projectPath = path.join(PROJECTS_BASE, slug);

    // Create project directory
    await fs.mkdir(projectPath, { recursive: true });
    await fs.mkdir(path.join(projectPath, 'specs'), { recursive: true });
    await fs.mkdir(path.join(projectPath, '.ralph'), { recursive: true });

    const project: Project = {
      id,
      name,
      slug,
      description: description || null,
      shortPrompt,
      path: projectPath,
      status: 'initialized',
      llmProvider: llmProvider || 'claude',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Save project config
    await fs.writeFile(
      path.join(projectPath, '.ralph', 'config.json'),
      JSON.stringify(project, null, 2)
    );

    // Add to projects list
    const projects = await readProjects();
    projects.push(project);
    await writeProjects(projects);

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error('Error creating project:', error);
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}
