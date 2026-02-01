import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Open a path in VS Code or launch Claude CLI
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, path } = body;

    const isWindows = process.platform === 'win32';

    if (action === 'vscode') {
      // Open path in VS Code
      const command = isWindows
        ? `code "${path}"`
        : `code "${path}"`;

      await execAsync(command, { timeout: 10000 });
      return NextResponse.json({ success: true, message: 'Opened in VS Code' });
    }

    if (action === 'claude-cli') {
      // Open a new terminal with Claude CLI in the project directory
      // If sessionId is provided, resume that session
      const { sessionId } = body;
      const claudeCommand = sessionId ? `claude --resume ${sessionId}` : 'claude';

      if (isWindows) {
        // On Windows, open Windows Terminal or cmd with Claude
        const command = `start cmd /k "cd /d "${path}" && ${claudeCommand}"`;
        await execAsync(command, { timeout: 10000 });
      } else {
        // On Unix, try to open default terminal
        const command = `osascript -e 'tell application "Terminal" to do script "cd \\"${path}\\" && ${claudeCommand}"' || x-terminal-emulator -e "cd '${path}' && ${claudeCommand}"`;
        await execAsync(command, { timeout: 10000 });
      }
      return NextResponse.json({ success: true, message: sessionId ? 'Resumed Claude session' : 'Opened Claude CLI' });
    }

    if (action === 'explorer') {
      // Open in file explorer
      const command = isWindows
        ? `explorer "${path}"`
        : `open "${path}" || xdg-open "${path}"`;

      await execAsync(command, { timeout: 10000 });
      return NextResponse.json({ success: true, message: 'Opened in file explorer' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error opening path:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
