'use client';

import { useState, useEffect } from 'react';
import { Eye, EyeOff, Check, X, Loader2, KeyRound, Bot, FolderOpen, Terminal, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useSettingsStore } from '@/stores/settingsStore';

interface CliStatus {
  installed: boolean;
  version: string | null;
  path: string | null;
  error: string | null;
}

interface ServerSettings {
  llmProvider: 'openai' | 'claude';
  openaiApiKey: string | null;
  anthropicApiKey: string | null;
  hasOpenaiKey: boolean;
  hasAnthropicKey: boolean;
  projectsBasePath: string;
  claudeCliPath: string;
  claudeCli?: CliStatus | null;
}

export default function SettingsPage() {
  const {
    llmProvider,
    setLLMProvider,
    setOpenaiApiKey,
    setAnthropicApiKey,
    openaiKeyValid,
    setOpenaiKeyValid,
    anthropicKeyValid,
    setAnthropicKeyValid,
    projectsBasePath,
    setProjectsBasePath,
  } = useSettingsStore();

  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [openaiInput, setOpenaiInput] = useState('');
  const [anthropicInput, setAnthropicInput] = useState('');
  const [pathInput, setPathInput] = useState(projectsBasePath);
  const [validatingOpenai, setValidatingOpenai] = useState(false);
  const [validatingAnthropic, setValidatingAnthropic] = useState(false);
  const [hasOpenaiKey, setHasOpenaiKey] = useState(false);
  const [hasAnthropicKey, setHasAnthropicKey] = useState(false);
  const [loading, setLoading] = useState(true);

  // Claude CLI state
  const [claudeCliPath, setClaudeCliPath] = useState('');
  const [claudeCliStatus, setClaudeCliStatus] = useState<CliStatus | null>(null);
  const [checkingCli, setCheckingCli] = useState(false);
  const [savingCliPath, setSavingCliPath] = useState(false);

  // Fetch settings from server on mount
  useEffect(() => {
    async function fetchSettings() {
      try {
        // Fetch with CLI check
        const res = await fetch('/api/settings?checkCli=true');
        if (res.ok) {
          const data: ServerSettings = await res.json();
          setLLMProvider(data.llmProvider);
          setHasOpenaiKey(data.hasOpenaiKey);
          setHasAnthropicKey(data.hasAnthropicKey);
          setOpenaiKeyValid(data.hasOpenaiKey ? true : null);
          setAnthropicKeyValid(data.hasAnthropicKey ? true : null);
          if (data.projectsBasePath) {
            setProjectsBasePath(data.projectsBasePath);
            setPathInput(data.projectsBasePath);
          }
          // Show masked key if present
          if (data.openaiApiKey) setOpenaiInput(data.openaiApiKey);
          if (data.anthropicApiKey) setAnthropicInput(data.anthropicApiKey);
          // Claude CLI
          setClaudeCliPath(data.claudeCliPath || '');
          if (data.claudeCli) {
            setClaudeCliStatus(data.claudeCli);
          }
        }
      } catch (error) {
        console.error('Failed to fetch settings:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchSettings();
  }, [setLLMProvider, setOpenaiKeyValid, setAnthropicKeyValid, setProjectsBasePath]);

  const handleSaveOpenaiKey = async () => {
    setValidatingOpenai(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openaiApiKey: openaiInput }),
      });

      if (res.ok) {
        const data: ServerSettings = await res.json();
        setOpenaiApiKey(openaiInput);
        setOpenaiKeyValid(true);
        setHasOpenaiKey(data.hasOpenaiKey);
        if (data.openaiApiKey) setOpenaiInput(data.openaiApiKey);
      } else {
        setOpenaiKeyValid(false);
      }
    } catch (error) {
      console.error('Failed to save OpenAI key:', error);
      setOpenaiKeyValid(false);
    } finally {
      setValidatingOpenai(false);
    }
  };

  const handleSaveAnthropicKey = async () => {
    setValidatingAnthropic(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anthropicApiKey: anthropicInput }),
      });

      if (res.ok) {
        const data: ServerSettings = await res.json();
        setAnthropicApiKey(anthropicInput);
        setAnthropicKeyValid(true);
        setHasAnthropicKey(data.hasAnthropicKey);
        if (data.anthropicApiKey) setAnthropicInput(data.anthropicApiKey);
      } else {
        setAnthropicKeyValid(false);
      }
    } catch (error) {
      console.error('Failed to save Anthropic key:', error);
      setAnthropicKeyValid(false);
    } finally {
      setValidatingAnthropic(false);
    }
  };

  const handleSaveProvider = async (provider: 'openai' | 'claude') => {
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ llmProvider: provider }),
      });

      if (res.ok) {
        setLLMProvider(provider);
      }
    } catch (error) {
      console.error('Failed to save provider:', error);
    }
  };

  const handleSavePath = async () => {
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectsBasePath: pathInput }),
      });

      if (res.ok) {
        setProjectsBasePath(pathInput);
      }
    } catch (error) {
      console.error('Failed to save path:', error);
    }
  };

  const handleCheckCli = async () => {
    setCheckingCli(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: claudeCliPath }),
      });

      if (res.ok) {
        const status: CliStatus = await res.json();
        setClaudeCliStatus(status);
      }
    } catch (error) {
      console.error('Failed to check CLI:', error);
      setClaudeCliStatus({
        installed: false,
        version: null,
        path: null,
        error: 'Failed to check CLI status',
      });
    } finally {
      setCheckingCli(false);
    }
  };

  const handleSaveCliPath = async () => {
    setSavingCliPath(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claudeCliPath, validateCli: true }),
      });

      if (res.ok) {
        const data: ServerSettings = await res.json();
        if (data.claudeCli) {
          setClaudeCliStatus(data.claudeCli);
        }
      }
    } catch (error) {
      console.error('Failed to save CLI path:', error);
    } finally {
      setSavingCliPath(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Configure your API keys and preferences
        </p>
      </div>

      {/* Claude CLI Configuration */}
      <Card className={!claudeCliStatus?.installed ? 'border-yellow-500/50' : ''}>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            <CardTitle>Claude Code CLI</CardTitle>
          </div>
          <CardDescription>
            Required for running the Ralph Wiggum loop
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status display */}
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <div className="flex items-center gap-3">
              {claudeCliStatus === null ? (
                <Badge variant="secondary">Unknown</Badge>
              ) : claudeCliStatus.installed ? (
                <Badge variant="success" className="gap-1">
                  <Check className="h-3 w-3" /> Installed
                </Badge>
              ) : (
                <Badge variant="destructive" className="gap-1">
                  <X className="h-3 w-3" /> Not Found
                </Badge>
              )}
              <div>
                {claudeCliStatus?.version && (
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    {claudeCliStatus.version}
                  </span>
                )}
                {claudeCliStatus?.path && (
                  <code className="block text-xs text-gray-500 font-mono">
                    {claudeCliStatus.path}
                  </code>
                )}
                {claudeCliStatus?.error && (
                  <span className="block text-xs text-red-500">
                    {claudeCliStatus.error}
                  </span>
                )}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCheckCli}
              disabled={checkingCli}
            >
              {checkingCli ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Check
                </>
              )}
            </Button>
          </div>

          {/* Custom path input */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Custom CLI Path (optional)
            </label>
            <div className="flex gap-2">
              <Input
                value={claudeCliPath}
                onChange={(e) => setClaudeCliPath(e.target.value)}
                placeholder="Leave empty to use system PATH"
              />
              <Button onClick={handleSaveCliPath} disabled={savingCliPath}>
                {savingCliPath ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Save'
                )}
              </Button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              If Claude CLI is not in your system PATH, specify the full path to the executable.
              {process.platform === 'win32'
                ? ' Example: C:\\Users\\username\\.claude\\claude.exe'
                : ' Example: /usr/local/bin/claude'}
            </p>
          </div>

          {/* Installation help */}
          {!claudeCliStatus?.installed && (
            <div className="p-3 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium mb-2">
                Claude Code CLI not detected
              </p>
              <p className="text-xs text-yellow-700 dark:text-yellow-300 mb-2">
                Install Claude Code CLI to run the Ralph Wiggum loop:
              </p>
              <code className="block text-xs bg-yellow-100 dark:bg-yellow-900 p-2 rounded font-mono">
                npm install -g @anthropic-ai/claude-code
              </code>
              <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-2">
                Or visit{' '}
                <a
                  href="https://claude.ai/claude-code"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  claude.ai/claude-code
                </a>{' '}
                for more installation options.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* LLM Provider Selection */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            <CardTitle>LLM Provider</CardTitle>
          </div>
          <CardDescription>
            Choose the default AI provider for generating PRDs and specs
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Button
              variant={llmProvider === 'claude' ? 'default' : 'outline'}
              onClick={() => handleSaveProvider('claude')}
              className="flex-1"
            >
              <div className="text-left">
                <div className="font-medium">Claude (Anthropic)</div>
                <div className="text-xs opacity-70">Opus 4.5</div>
              </div>
            </Button>
            <Button
              variant={llmProvider === 'openai' ? 'default' : 'outline'}
              onClick={() => handleSaveProvider('openai')}
              className="flex-1"
            >
              <div className="text-left">
                <div className="font-medium">OpenAI</div>
                <div className="text-xs opacity-70">GPT-5.2</div>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* API Keys */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            <CardTitle>API Keys</CardTitle>
          </div>
          <CardDescription>
            Your API keys are stored locally and never sent to our servers
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Anthropic API Key */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Anthropic API Key</label>
              {hasAnthropicKey && (
                <Badge variant="success" className="gap-1">
                  <Check className="h-3 w-3" /> Saved
                </Badge>
              )}
              {anthropicKeyValid === false && (
                <Badge variant="destructive" className="gap-1">
                  <X className="h-3 w-3" /> Invalid
                </Badge>
              )}
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showAnthropicKey ? 'text' : 'password'}
                  placeholder="sk-ant-..."
                  value={anthropicInput}
                  onChange={(e) => setAnthropicInput(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setShowAnthropicKey(!showAnthropicKey)}
                >
                  {showAnthropicKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <Button onClick={handleSaveAnthropicKey} disabled={validatingAnthropic}>
                {validatingAnthropic ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Save'
                )}
              </Button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Required for Claude Opus 4.5. Get your key at{' '}
              <a
                href="https://console.anthropic.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-gray-900 dark:hover:text-gray-50"
              >
                console.anthropic.com
              </a>
            </p>
          </div>

          {/* OpenAI API Key */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">OpenAI API Key</label>
              {hasOpenaiKey && (
                <Badge variant="success" className="gap-1">
                  <Check className="h-3 w-3" /> Saved
                </Badge>
              )}
              {openaiKeyValid === false && (
                <Badge variant="destructive" className="gap-1">
                  <X className="h-3 w-3" /> Invalid
                </Badge>
              )}
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showOpenaiKey ? 'text' : 'password'}
                  placeholder="sk-..."
                  value={openaiInput}
                  onChange={(e) => setOpenaiInput(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                >
                  {showOpenaiKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <Button onClick={handleSaveOpenaiKey} disabled={validatingOpenai}>
                {validatingOpenai ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Save'
                )}
              </Button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Required for GPT-5.2. Get your key at{' '}
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-gray-900 dark:hover:text-gray-50"
              >
                platform.openai.com
              </a>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Projects Directory */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            <CardTitle>Projects Directory</CardTitle>
          </div>
          <CardDescription>
            Where LoopForge stores generated project files
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              placeholder="~/ralph-projects"
            />
            <Button onClick={handleSavePath}>Save</Button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Use ~ for your home directory. Each project will be created as a subdirectory.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
