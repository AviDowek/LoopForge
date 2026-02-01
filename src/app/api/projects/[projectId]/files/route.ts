import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';

const DB_FILE = path.join(process.cwd(), 'data', 'projects.json');

interface Project {
  id: string;
  path: string;
}

interface GeneratedFile {
  path: string;
  content: string;
  type: string;
}

async function readProjects(): Promise<Project[]> {
  try {
    const data = await fs.readFile(DB_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// POST /api/projects/[projectId]/files - Write files to project
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const body = await request.json();
    const { files } = body as { files: GeneratedFile[] };

    if (!files || !Array.isArray(files)) {
      return NextResponse.json(
        { error: 'Files array is required' },
        { status: 400 }
      );
    }

    // Find the project
    const projects = await readProjects();
    const project = projects.find((p) => p.id === projectId);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Ensure project directory exists
    await fs.mkdir(project.path, { recursive: true });
    await fs.mkdir(path.join(project.path, 'specs'), { recursive: true });

    // Write each file
    const writtenFiles: string[] = [];

    for (const file of files) {
      const filePath = path.join(project.path, file.path);
      const fileDir = path.dirname(filePath);

      // Ensure directory exists
      await fs.mkdir(fileDir, { recursive: true });

      // Write file
      await fs.writeFile(filePath, file.content, 'utf-8');

      // Make shell scripts executable on Unix systems
      if (file.path.endsWith('.sh')) {
        try {
          await fs.chmod(filePath, 0o755);
        } catch {
          // Ignore chmod errors on Windows
        }
      }

      writtenFiles.push(file.path);
    }

    return NextResponse.json({
      success: true,
      writtenFiles,
      projectPath: project.path,
    });
  } catch (error) {
    console.error('Error writing files:', error);
    return NextResponse.json(
      { error: 'Failed to write files' },
      { status: 500 }
    );
  }
}

// GET /api/projects/[projectId]/files - List files in project
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;

    // Find the project
    const projects = await readProjects();
    const project = projects.find((p) => p.id === projectId);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // List files recursively
    const files: string[] = [];

    async function listDir(dir: string, prefix = '') {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            // Skip certain directories
            if (['node_modules', '.git', '.next', 'dist'].includes(entry.name)) {
              continue;
            }
            await listDir(path.join(dir, entry.name), relativePath);
          } else {
            files.push(relativePath);
          }
        }
      } catch {
        // Directory may not exist yet
      }
    }

    await listDir(project.path);

    return NextResponse.json({ files, projectPath: project.path });
  } catch (error) {
    console.error('Error listing files:', error);
    return NextResponse.json(
      { error: 'Failed to list files' },
      { status: 500 }
    );
  }
}
