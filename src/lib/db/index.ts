import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import type {
  Project,
  ProjectWithProgress,
  Task,
  LoopSession,
  LoopLog,
  LLMProvider,
  ProjectStatus,
  TaskStatus,
  LoopStatus,
  PRD,
} from '@/types';

// Database file location
const DB_PATH = path.join(process.cwd(), 'data', 'loopforge.db');

// Ensure data directory exists
function ensureDataDir() {
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

// Initialize database
function getDb(): Database.Database {
  ensureDataDir();
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Read and execute schema
  const schemaPath = path.join(__dirname, 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    db.exec(schema);
  }

  return db;
}

// Lazy initialization
let _db: Database.Database | null = null;
function db(): Database.Database {
  if (!_db) {
    _db = getDb();
  }
  return _db;
}

// Helper to generate slug from name
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Projects
export function createProject(data: {
  name: string;
  description?: string;
  shortPrompt: string;
  path: string;
  llmProvider: LLMProvider;
}): Project {
  const id = uuidv4();
  const slug = slugify(data.name) + '-' + id.slice(0, 8);

  const stmt = db().prepare(`
    INSERT INTO projects (id, name, slug, description, short_prompt, path, llm_provider)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(id, data.name, slug, data.description || null, data.shortPrompt, data.path, data.llmProvider);

  return getProject(id)!;
}

export function getProject(id: string): Project | null {
  const row = db().prepare('SELECT * FROM projects WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) return null;

  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    description: row.description as string | null,
    shortPrompt: row.short_prompt as string,
    path: row.path as string,
    status: row.status as ProjectStatus,
    llmProvider: row.llm_provider as LLMProvider,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

export function getAllProjects(): ProjectWithProgress[] {
  const rows = db().prepare(`
    SELECT
      p.*,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'completed') as tasks_completed,
      (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) as total_tasks
    FROM projects p
    ORDER BY p.updated_at DESC
  `).all() as Record<string, unknown>[];

  return rows.map(row => ({
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    description: row.description as string | null,
    shortPrompt: row.short_prompt as string,
    path: row.path as string,
    status: row.status as ProjectStatus,
    llmProvider: row.llm_provider as LLMProvider,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
    tasksCompleted: row.tasks_completed as number,
    totalTasks: row.total_tasks as number,
  }));
}

export function updateProjectStatus(id: string, status: ProjectStatus): void {
  db().prepare(`
    UPDATE projects SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(status, id);
}

export function deleteProject(id: string): void {
  db().prepare('DELETE FROM projects WHERE id = ?').run(id);
}

// Tasks
export function importTasksFromPRD(projectId: string, prd: PRD): void {
  const insertTask = db().prepare(`
    INSERT INTO tasks (id, project_id, epic_id, story_id, title, type, hours_estimate, files_json, acceptance_json, dependencies_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const transaction = db().transaction(() => {
    // Clear existing tasks for this project
    db().prepare('DELETE FROM tasks WHERE project_id = ?').run(projectId);

    for (const epic of prd.epics) {
      for (const story of epic.user_stories) {
        for (const task of story.tasks) {
          insertTask.run(
            `${projectId}-${task.id}`,
            projectId,
            epic.id,
            story.id,
            task.title,
            task.type,
            task.hours,
            JSON.stringify(task.files),
            JSON.stringify(task.acceptance),
            JSON.stringify(task.deps)
          );
        }
      }
    }
  });

  transaction();
}

export function getProjectTasks(projectId: string): Task[] {
  const rows = db().prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY id').all(projectId) as Record<string, unknown>[];

  return rows.map(row => ({
    id: row.id as string,
    projectId: row.project_id as string,
    epicId: row.epic_id as string,
    storyId: row.story_id as string,
    title: row.title as string,
    type: row.type as Task['type'],
    status: row.status as TaskStatus,
    hoursEstimate: row.hours_estimate as number | null,
    files: JSON.parse(row.files_json as string || '[]'),
    acceptance: JSON.parse(row.acceptance_json as string || '[]'),
    dependencies: JSON.parse(row.dependencies_json as string || '[]'),
    completedAt: row.completed_at ? new Date(row.completed_at as string) : null,
    createdAt: new Date(row.created_at as string),
  }));
}

export function updateTaskStatus(taskId: string, status: TaskStatus): void {
  const completedAt = status === 'completed' ? 'CURRENT_TIMESTAMP' : 'NULL';
  db().prepare(`
    UPDATE tasks SET status = ?, completed_at = ${completedAt} WHERE id = ?
  `).run(status, taskId);
}

// Loop Sessions
export function createLoopSession(data: {
  projectId: string;
  mode: 'plan' | 'build';
  promptFile?: string;
  model?: string;
}): LoopSession {
  const id = uuidv4();

  db().prepare(`
    INSERT INTO loop_sessions (id, project_id, mode, prompt_file, model)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, data.projectId, data.mode, data.promptFile || 'PROMPT.md', data.model || 'opus');

  return getLoopSession(id)!;
}

export function getLoopSession(id: string): LoopSession | null {
  const row = db().prepare('SELECT * FROM loop_sessions WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) return null;

  return {
    id: row.id as string,
    projectId: row.project_id as string,
    mode: row.mode as 'plan' | 'build',
    promptFile: row.prompt_file as string,
    model: row.model as string,
    status: row.status as LoopStatus,
    currentTaskId: row.current_task_id as string | null,
    iterationCount: row.iteration_count as number,
    pid: row.pid as number | null,
    startedAt: new Date(row.started_at as string),
    endedAt: row.ended_at ? new Date(row.ended_at as string) : null,
    errorMessage: row.error_message as string | null,
  };
}

export function getProjectLoopSessions(projectId: string): LoopSession[] {
  const rows = db().prepare('SELECT * FROM loop_sessions WHERE project_id = ? ORDER BY started_at DESC').all(projectId) as Record<string, unknown>[];

  return rows.map(row => ({
    id: row.id as string,
    projectId: row.project_id as string,
    mode: row.mode as 'plan' | 'build',
    promptFile: row.prompt_file as string,
    model: row.model as string,
    status: row.status as LoopStatus,
    currentTaskId: row.current_task_id as string | null,
    iterationCount: row.iteration_count as number,
    pid: row.pid as number | null,
    startedAt: new Date(row.started_at as string),
    endedAt: row.ended_at ? new Date(row.ended_at as string) : null,
    errorMessage: row.error_message as string | null,
  }));
}

export function updateLoopSessionStatus(id: string, status: LoopStatus, errorMessage?: string): void {
  const endedAt = ['completed', 'failed', 'stopped'].includes(status) ? 'CURRENT_TIMESTAMP' : 'NULL';
  db().prepare(`
    UPDATE loop_sessions SET status = ?, error_message = ?, ended_at = ${endedAt} WHERE id = ?
  `).run(status, errorMessage || null, id);
}

export function updateLoopSessionPid(id: string, pid: number): void {
  db().prepare('UPDATE loop_sessions SET pid = ? WHERE id = ?').run(pid, id);
}

export function incrementLoopIteration(id: string): void {
  db().prepare('UPDATE loop_sessions SET iteration_count = iteration_count + 1 WHERE id = ?').run(id);
}

// Loop Logs
export function insertLoopLog(data: {
  sessionId: string;
  logType: LoopLog['logType'];
  content: string;
  parsedJson?: object;
}): void {
  db().prepare(`
    INSERT INTO loop_logs (session_id, log_type, content, parsed_json)
    VALUES (?, ?, ?, ?)
  `).run(data.sessionId, data.logType, data.content, data.parsedJson ? JSON.stringify(data.parsedJson) : null);
}

export function getRecentLogs(sessionId: string, limit: number = 100): LoopLog[] {
  const rows = db().prepare(`
    SELECT * FROM loop_logs WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?
  `).all(sessionId, limit) as Record<string, unknown>[];

  return rows.reverse().map(row => ({
    id: row.id as number,
    sessionId: row.session_id as string,
    timestamp: new Date(row.timestamp as string),
    logType: row.log_type as LoopLog['logType'],
    content: row.content as string,
    parsedJson: row.parsed_json ? JSON.parse(row.parsed_json as string) : null,
  }));
}

// Settings
export function getSetting(key: string): string | null {
  const row = db().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value || null;
}

export function setSetting(key: string, value: string, encrypted: boolean = false): void {
  db().prepare(`
    INSERT INTO settings (key, value, encrypted, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = ?, encrypted = ?, updated_at = CURRENT_TIMESTAMP
  `).run(key, value, encrypted ? 1 : 0, value, encrypted ? 1 : 0);
}

export function getSettings(): Record<string, string> {
  const rows = db().prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

// Export db for advanced queries
export { db };
