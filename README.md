# LoopForge

A web-based frontend for the Ralph Wiggum technique - automated software development using Claude Code CLI.

## Features

- **Project Management**: Create, view, and manage multiple Ralph Wiggum projects
- **PRD Generation**: Turn a short prompt into a detailed Product Requirements Document using AI (OpenAI GPT-5.2 or Claude Opus 4.5)
- **File Generation**: Automatically generate all Ralph Wiggum technique files:
  - `PROMPT.md`, `PROMPT_plan.md`, `PROMPT_build.md`
  - `AGENTS.md`
  - `@fix_plan.md` and `IMPLEMENTATION_PLAN.md`
  - Task specs in `specs/` directory
  - `loop.sh` orchestration script
- **Real-time Loop Monitoring**: Watch the Claude Code CLI output in real-time
- **Progress Tracking**: Visual task checklist and progress indicators
- **Dual View**: Toggle between raw terminal output and clean progress view
- **E2E Testing**: Supports End2End testing using Claude to generate tests and Playwright to execute
- **Sanity Check**: Uses Claude to check the generated codebase against the PRD to ensure compliance**

## Prerequisites

- Node.js 18+
- Claude Code CLI installed (`npm install -g @anthropic-ai/claude-code`)
- API keys for OpenAI and/or Anthropic

## Installation

```bash
cd loopforge
npm install
```

## Configuration

1. Start the application (see below)
2. Go to Settings
3. Add your API keys:
   - **Anthropic API Key**: For Claude Opus 4.5 (document generation and loop execution)
   - **OpenAI API Key**: For GPT-5.2 (optional, for document generation)

## Running the Application

### Development Mode

```bash
# Start Next.js only
npm run dev

# Start both Next.js and WebSocket server (for loop streaming)
npm run dev:all
```

Then open [http://localhost:3000](http://localhost:3000)

### Production Mode

```bash
npm run build
npm run start
```

## Usage

### Creating a New Project

1. Click "New Project" from the dashboard
2. Enter a name and short description of your idea
3. Select your preferred AI provider (Claude or OpenAI)
4. Click "Generate PRD" to create a detailed requirements document
5. Review and approve the PRD (or request changes)
6. Generate Ralph Wiggum files
7. Review and approve each generated file
8. Launch the loop!

### Monitoring Progress

- **Raw Terminal**: See the exact Claude Code CLI output
- **Clean Progress**: View task completion status, files created, and next tasks
- **Checklist**: Track which tasks are completed, in progress, or pending

### Project Structure

Each project creates a folder in `~/ralph-projects/` containing:

```
project-name/
├── .ralph/config.json     # Project metadata
├── PROMPT.md              # Main prompt for Claude
├── PROMPT_plan.md         # Planning mode prompt
├── PROMPT_build.md        # Build mode prompt
├── AGENTS.md              # Agent configuration
├── @fix_plan.md           # Current task checklist
├── IMPLEMENTATION_PLAN.md # Full implementation plan
├── prd_complete.json      # PRD in JSON format
├── loop.sh                # Loop orchestration script
├── specs/                 # Task specifications
│   ├── E0-infrastructure.md
│   ├── E1-feature.md
│   └── ...
└── src/                   # Generated source code
```

## Architecture

- **Frontend**: Next.js 14+ with App Router, TypeScript, Tailwind CSS
- **State Management**: Zustand (client) + TanStack Query (server)
- **Database**: SQLite (via better-sqlite3)
- **Real-time**: Socket.io for CLI output streaming
- **LLM Integration**: OpenAI SDK and Anthropic SDK

## Ralph Wiggum Technique

The Ralph Wiggum technique is an AI-powered development methodology that:

1. **Breaks down projects** into Epics, Stories, and Tasks (E0-S1-T1 format)
2. **Executes one task per loop iteration** with fresh context
3. **Outputs RALPH_STATUS** blocks for progress tracking
4. **Uses parallel subagents** for code search, single agent for builds

For more information, see [how-to-ralph-wiggum](https://github.com/ghuntley/how-to-ralph-wiggum)

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js in development mode |
| `npm run dev:all` | Start Next.js + WebSocket server |
| `npm run dev:ws` | Start WebSocket server only |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

## License

MIT
