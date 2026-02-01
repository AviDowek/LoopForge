import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const SETTINGS_FILE = path.join(process.cwd(), 'data', 'settings.json');

interface Settings {
  llmProvider: 'openai' | 'claude';
  openaiApiKey: string | null;
  anthropicApiKey: string | null;
  projectsBasePath: string;
  claudeCliPath: string; // Path to Claude CLI executable (empty = use system PATH)
}

const DEFAULT_SETTINGS: Settings = {
  llmProvider: 'claude',
  openaiApiKey: null,
  anthropicApiKey: null,
  projectsBasePath: '~/ralph-projects',
  claudeCliPath: '', // Empty means use system PATH
};

/**
 * Check if Claude CLI is installed and accessible
 */
async function checkClaudeCli(customPath?: string): Promise<{
  installed: boolean;
  version: string | null;
  path: string | null;
  error: string | null;
}> {
  const cliCommand = customPath || 'claude';
  const isWindows = process.platform === 'win32';

  try {
    // Try to get version
    const { stdout } = await execAsync(`"${cliCommand}" --version`, {
      timeout: 10000,
      shell: isWindows ? 'cmd.exe' : '/bin/bash',
    });

    const version = stdout.trim();

    // Try to find the actual path if using system PATH
    let resolvedPath = customPath || null;
    if (!customPath) {
      try {
        const whichCmd = isWindows ? 'where claude' : 'which claude';
        const { stdout: pathOut } = await execAsync(whichCmd, { timeout: 5000 });
        resolvedPath = pathOut.trim().split('\n')[0]; // First result on Windows
      } catch {
        // Couldn't find path, but CLI works
      }
    }

    return {
      installed: true,
      version,
      path: resolvedPath,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    // Check if it's a "not found" error
    if (message.includes('not found') || message.includes('not recognized') || message.includes('ENOENT')) {
      return {
        installed: false,
        version: null,
        path: null,
        error: 'Claude CLI not found. Please install it or set the path.',
      };
    }

    return {
      installed: false,
      version: null,
      path: null,
      error: message,
    };
  }
}

async function ensureDataDir() {
  const dataDir = path.dirname(SETTINGS_FILE);
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

async function readSettings(): Promise<Settings> {
  await ensureDataDir();
  try {
    const data = await fs.readFile(SETTINGS_FILE, 'utf-8');
    return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

async function writeSettings(settings: Settings): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

// GET /api/settings - Get current settings
export async function GET(request: NextRequest) {
  try {
    const settings = await readSettings();

    // Check if we should validate Claude CLI
    const url = new URL(request.url);
    const checkCli = url.searchParams.get('checkCli') === 'true';

    let cliStatus = null;
    if (checkCli) {
      cliStatus = await checkClaudeCli(settings.claudeCliPath || undefined);
    }

    // Mask API keys for security
    return NextResponse.json({
      ...settings,
      openaiApiKey: settings.openaiApiKey ? '••••••••' + settings.openaiApiKey.slice(-4) : null,
      anthropicApiKey: settings.anthropicApiKey ? '••••••••' + settings.anthropicApiKey.slice(-4) : null,
      hasOpenaiKey: !!settings.openaiApiKey,
      hasAnthropicKey: !!settings.anthropicApiKey,
      claudeCli: cliStatus,
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

// PUT /api/settings - Update settings
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const currentSettings = await readSettings();

    const updatedSettings: Settings = {
      ...currentSettings,
    };

    // Update individual fields
    if (body.llmProvider !== undefined) {
      updatedSettings.llmProvider = body.llmProvider;
    }
    if (body.projectsBasePath !== undefined) {
      updatedSettings.projectsBasePath = body.projectsBasePath;
    }
    if (body.claudeCliPath !== undefined) {
      updatedSettings.claudeCliPath = body.claudeCliPath;
    }
    // Only update API keys if they're provided and not masked
    if (body.openaiApiKey !== undefined && !body.openaiApiKey.includes('••••')) {
      updatedSettings.openaiApiKey = body.openaiApiKey || null;
    }
    if (body.anthropicApiKey !== undefined && !body.anthropicApiKey.includes('••••')) {
      updatedSettings.anthropicApiKey = body.anthropicApiKey || null;
    }

    await writeSettings(updatedSettings);

    // Check CLI status if path was updated
    let cliStatus = null;
    if (body.claudeCliPath !== undefined || body.validateCli) {
      cliStatus = await checkClaudeCli(updatedSettings.claudeCliPath || undefined);
    }

    return NextResponse.json({
      ...updatedSettings,
      openaiApiKey: updatedSettings.openaiApiKey ? '••••••••' + updatedSettings.openaiApiKey.slice(-4) : null,
      anthropicApiKey: updatedSettings.anthropicApiKey ? '••••••••' + updatedSettings.anthropicApiKey.slice(-4) : null,
      hasOpenaiKey: !!updatedSettings.openaiApiKey,
      hasAnthropicKey: !!updatedSettings.anthropicApiKey,
      claudeCli: cliStatus,
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}

// POST /api/settings/validate-cli - Validate Claude CLI at a specific path
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const cliPath = body.path || '';

    const cliStatus = await checkClaudeCli(cliPath || undefined);

    return NextResponse.json(cliStatus);
  } catch (error) {
    console.error('Error validating CLI:', error);
    return NextResponse.json({ error: 'Failed to validate CLI' }, { status: 500 });
  }
}
