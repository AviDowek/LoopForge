import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';

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

async function readProjects(): Promise<Project[]> {
  try {
    const data = await fs.readFile(DB_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeProjects(projects: Project[]): Promise<void> {
  await fs.writeFile(DB_FILE, JSON.stringify(projects, null, 2));
}

// GET /api/projects/[projectId] - Get single project
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const projects = await readProjects();
    const project = projects.find((p) => p.id === projectId);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Try to read additional project info from the project directory
    let files: string[] = [];
    try {
      const dirContents = await fs.readdir(project.path);
      files = dirContents;
    } catch {
      // Project directory may not exist yet
    }

    return NextResponse.json({
      ...project,
      files,
      tasksCompleted: 0,
      totalTasks: 0,
    });
  } catch (error) {
    console.error('Error fetching project:', error);
    return NextResponse.json({ error: 'Failed to fetch project' }, { status: 500 });
  }
}

// PUT /api/projects/[projectId] - Update project
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const body = await request.json();
    const projects = await readProjects();
    const index = projects.findIndex((p) => p.id === projectId);

    if (index === -1) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const updatedProject = {
      ...projects[index],
      ...body,
      id: projectId, // Prevent ID change
      updatedAt: new Date().toISOString(),
    };

    projects[index] = updatedProject;
    await writeProjects(projects);

    // Update project config file
    try {
      await fs.writeFile(
        path.join(updatedProject.path, '.ralph', 'config.json'),
        JSON.stringify(updatedProject, null, 2)
      );
    } catch {
      // Ignore if project directory doesn't exist
    }

    return NextResponse.json(updatedProject);
  } catch (error) {
    console.error('Error updating project:', error);
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
  }
}

// DELETE /api/projects/[projectId] - Delete project
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const projects = await readProjects();
    const index = projects.findIndex((p) => p.id === projectId);

    if (index === -1) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const project = projects[index];

    // Optionally delete project directory
    // await fs.rm(project.path, { recursive: true, force: true });

    projects.splice(index, 1);
    await writeProjects(projects);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting project:', error);
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
  }
}
