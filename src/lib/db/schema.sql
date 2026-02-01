-- LoopForge Database Schema

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    short_prompt TEXT NOT NULL,
    path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'initialized'
        CHECK (status IN ('initialized', 'prd_generated', 'specs_ready', 'running', 'paused', 'completed', 'error')),
    llm_provider TEXT NOT NULL DEFAULT 'claude'
        CHECK (llm_provider IN ('openai', 'claude')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tasks table (parsed from prd_complete.json)
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    epic_id TEXT NOT NULL,
    story_id TEXT NOT NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('infrastructure', 'code', 'test', 'documentation')),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'skipped')),
    hours_estimate REAL,
    files_json TEXT,
    acceptance_json TEXT,
    dependencies_json TEXT,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Loop sessions table
CREATE TABLE IF NOT EXISTS loop_sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    mode TEXT NOT NULL CHECK (mode IN ('plan', 'build')),
    prompt_file TEXT NOT NULL DEFAULT 'PROMPT.md',
    model TEXT NOT NULL DEFAULT 'opus',
    status TEXT NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'paused', 'completed', 'failed', 'stopped')),
    current_task_id TEXT,
    iteration_count INTEGER DEFAULT 0,
    pid INTEGER,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,
    error_message TEXT
);

-- Loop output logs
CREATE TABLE IF NOT EXISTS loop_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES loop_sessions(id) ON DELETE CASCADE,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    log_type TEXT NOT NULL CHECK (log_type IN ('stdout', 'stderr', 'system', 'ralph_status')),
    content TEXT NOT NULL,
    parsed_json TEXT
);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    encrypted INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_loop_sessions_project_id ON loop_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_loop_logs_session_id ON loop_logs(session_id);

-- Insert default settings
INSERT OR IGNORE INTO settings (key, value) VALUES ('llm_provider', 'claude');
INSERT OR IGNORE INTO settings (key, value) VALUES ('projects_base_path', '~/ralph-projects');
