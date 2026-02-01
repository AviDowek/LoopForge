'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Sparkles,
  FileText,
  FolderTree,
  CheckCircle,
  Rocket,
  Bot,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { WizardStepper } from '@/components/wizard/WizardStepper';
import { useWizardStore } from '@/stores/wizardStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { LLMProvider, GeneratedFile } from '@/types';

const steps = [
  { id: 0, title: 'Describe', description: 'Your project idea' },
  { id: 1, title: 'Review PRD', description: 'AI-generated requirements' },
  { id: 2, title: 'Generate Files', description: 'Ralph Wiggum structure' },
  { id: 3, title: 'Approve Files', description: 'Review each document' },
  { id: 4, title: 'Launch', description: 'Start the loop' },
];

export default function NewProjectPage() {
  const router = useRouter();
  const {
    currentStep,
    setStep,
    nextStep,
    prevStep,
    projectName,
    setProjectName,
    projectDescription,
    setProjectDescription,
    shortPrompt,
    setShortPrompt,
    llmProvider,
    setLLMProvider,
    generatedPRD,
    setGeneratedPRD,
    prdContent,
    setPRDContent,
    prdApproved,
    setPRDApproved,
    isGenerating,
    setIsGenerating,
    generatedFiles,
    setGeneratedFiles,
    fileApprovals,
    setFileApproval,
    approveAllFiles,
    resetWizard,
  } = useWizardStore();

  const { llmProvider: defaultProvider, hasValidKey } = useSettingsStore();
  const [selectedProvider, setSelectedProvider] = useState<LLMProvider>(llmProvider || defaultProvider);
  const [changeRequest, setChangeRequest] = useState('');
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});

  const toggleFileExpanded = (path: string) => {
    setExpandedFiles(prev => ({ ...prev, [path]: !prev[path] }));
  };

  const handleProviderChange = (provider: LLMProvider) => {
    setSelectedProvider(provider);
    setLLMProvider(provider);
  };

  const handleGeneratePRD = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch('/api/llm/generate-prd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: shortPrompt,
          projectName: projectName,
          provider: selectedProvider,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate PRD');
      }

      setPRDContent(data.content);
      // Store the JSON for file generation
      if (data.json) {
        setGeneratedPRD(data.json);
      }
      nextStep();
    } catch (error) {
      console.error('Error generating PRD:', error);
      const message = error instanceof Error ? error.message : 'Failed to generate PRD';
      alert(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRegeneratePRD = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch('/api/llm/generate-prd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: shortPrompt,
          projectName: projectName,
          provider: selectedProvider,
          changeRequest: changeRequest,
          previousPRD: prdContent,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to regenerate PRD');
      }

      setPRDContent(data.content);
      // Store the JSON for file generation
      if (data.json) {
        setGeneratedPRD(data.json);
      }
      setChangeRequest('');
    } catch (error) {
      console.error('Error regenerating PRD:', error);
      const message = error instanceof Error ? error.message : 'Failed to regenerate PRD';
      alert(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApprovePRD = () => {
    setPRDApproved(true);
    nextStep();
  };

  const handleGenerateFiles = async () => {
    setIsGenerating(true);
    try {
      // Send the JSON object if available, otherwise fall back to markdown content
      const prdData = generatedPRD || prdContent;

      const res = await fetch('/api/llm/generate-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prd: prdData,
          projectName: projectName,
          provider: selectedProvider,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate files');
      }

      setGeneratedFiles(data.files);
      nextStep();
    } catch (error) {
      console.error('Error generating files:', error);
      const message = error instanceof Error ? error.message : 'Failed to generate files';
      alert(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleLaunchLoop = async () => {
    try {
      // Create the project
      const projectRes = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: projectName,
          description: projectDescription,
          shortPrompt: shortPrompt,
          llmProvider: selectedProvider,
        }),
      });

      if (!projectRes.ok) {
        throw new Error('Failed to create project');
      }

      const project = await projectRes.json();

      // Write the generated files to the project
      await fetch(`/api/projects/${project.id}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: generatedFiles }),
      });

      resetWizard();
      router.push(`/projects/${project.id}`);
    } catch (error) {
      console.error('Error creating project:', error);
      alert('Failed to create project. Please try again.');
    }
  };

  const allFilesApproved = generatedFiles.length > 0 && generatedFiles.every((f) => fileApprovals[f.path]);

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Project Name</label>
              <Input
                placeholder="My Awesome Project"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Description (optional)</label>
              <Input
                placeholder="A brief description of your project"
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Describe Your Idea</label>
              <Textarea
                placeholder="Describe what you want to build. Be as detailed or brief as you like - the AI will expand on it.

Example: An e-commerce platform with product listings, shopping cart, checkout with Stripe, and an admin dashboard for managing products and orders."
                value={shortPrompt}
                onChange={(e) => setShortPrompt(e.target.value)}
                rows={6}
              />
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium">AI Provider</label>
              <div className="flex gap-4">
                <Button
                  type="button"
                  variant={selectedProvider === 'claude' ? 'default' : 'outline'}
                  onClick={() => handleProviderChange('claude')}
                  className="flex-1 h-auto py-3"
                >
                  <div className="flex items-center gap-3">
                    <Bot className="h-5 w-5" />
                    <div className="text-left">
                      <div className="font-medium">Claude</div>
                      <div className="text-xs opacity-70">Opus 4.5</div>
                    </div>
                  </div>
                </Button>
                <Button
                  type="button"
                  variant={selectedProvider === 'openai' ? 'default' : 'outline'}
                  onClick={() => handleProviderChange('openai')}
                  className="flex-1 h-auto py-3"
                >
                  <div className="flex items-center gap-3">
                    <Sparkles className="h-5 w-5" />
                    <div className="text-left">
                      <div className="font-medium">OpenAI</div>
                      <div className="text-xs opacity-70">GPT-5.2</div>
                    </div>
                  </div>
                </Button>
              </div>
              {!hasValidKey(selectedProvider) && (
                <p className="text-xs text-yellow-600 dark:text-yellow-500">
                  You haven&apos;t configured an API key for {selectedProvider === 'claude' ? 'Anthropic' : 'OpenAI'}.{' '}
                  <a href="/settings" className="underline">
                    Add it in Settings
                  </a>
                </p>
              )}
            </div>
          </div>
        );

      case 1:
        return (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Generated PRD
                </CardTitle>
                <CardDescription>
                  Review the AI-generated Product Requirements Document
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-xs text-gray-500 mb-2">
                  {Math.round(prdContent.length / 1024 * 10) / 10} KB • Scroll to view full document
                </div>
                <div className="prose prose-sm dark:prose-invert max-w-none max-h-[70vh] overflow-y-auto bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
                  <pre className="whitespace-pre-wrap text-sm">{prdContent}</pre>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Request Changes</CardTitle>
                <CardDescription>
                  Not satisfied? Describe what you&apos;d like changed
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="Describe the changes you'd like to make..."
                  value={changeRequest}
                  onChange={(e) => setChangeRequest(e.target.value)}
                  rows={3}
                />
                <Button
                  onClick={handleRegeneratePRD}
                  disabled={!changeRequest.trim() || isGenerating}
                  variant="outline"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Regenerating...
                    </>
                  ) : (
                    'Regenerate with Changes'
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        );

      case 2:
        return (
          <div className="flex flex-col items-center justify-center py-12 space-y-6">
            {isGenerating ? (
              <>
                <Loader2 className="h-12 w-12 animate-spin text-gray-400" />
                <div className="text-center">
                  <h3 className="text-lg font-medium">Generating Ralph Wiggum Files</h3>
                  <p className="text-gray-500 dark:text-gray-400 mt-1">
                    Creating PROMPT.md, AGENTS.md, specs, and more...
                  </p>
                </div>
              </>
            ) : (
              <>
                <FolderTree className="h-12 w-12 text-gray-400" />
                <div className="text-center">
                  <h3 className="text-lg font-medium">Ready to Generate Files</h3>
                  <p className="text-gray-500 dark:text-gray-400 mt-1">
                    This will create all the Ralph Wiggum technique files from your PRD
                  </p>
                </div>
                <Button onClick={handleGenerateFiles} size="lg">
                  <Sparkles className="mr-2 h-5 w-5" />
                  Generate Files
                </Button>
              </>
            )}
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Review and approve each generated file
              </p>
              <Button variant="outline" size="sm" onClick={approveAllFiles}>
                Approve All
              </Button>
            </div>

            <div className="space-y-3">
              {generatedFiles.map((file) => {
                const isExpanded = expandedFiles[file.path];
                const contentPreview = file.content.slice(0, 500);
                const hasMore = file.content.length > 500;

                return (
                  <Card
                    key={file.path}
                    className={fileApprovals[file.path] ? 'border-green-500/50' : ''}
                  >
                    <CardHeader className="py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-gray-400" />
                          <CardTitle className="text-sm font-mono">{file.path}</CardTitle>
                          <Badge variant="secondary" className="text-xs">
                            {file.type}
                          </Badge>
                          <span className="text-xs text-gray-400">
                            ({Math.round(file.content.length / 1024 * 10) / 10} KB)
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => toggleFileExpanded(file.path)}
                          >
                            {isExpanded ? (
                              <>
                                <ChevronUp className="mr-1 h-4 w-4" />
                                Collapse
                              </>
                            ) : (
                              <>
                                <ChevronDown className="mr-1 h-4 w-4" />
                                Expand
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant={fileApprovals[file.path] ? 'default' : 'outline'}
                            onClick={() => setFileApproval(file.path, !fileApprovals[file.path])}
                          >
                            {fileApprovals[file.path] ? (
                              <>
                                <CheckCircle className="mr-1 h-4 w-4" />
                                Approved
                              </>
                            ) : (
                              'Approve'
                            )}
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="py-3 pt-0">
                      <pre className={`text-xs bg-gray-50 dark:bg-gray-900 p-3 rounded overflow-x-auto whitespace-pre-wrap ${isExpanded ? 'max-h-[600px] overflow-y-auto' : 'max-h-40'}`}>
                        {isExpanded ? file.content : contentPreview}
                        {!isExpanded && hasMore && (
                          <span className="text-gray-400 italic">
                            {'\n\n'}... ({file.content.length - 500} more characters) Click &quot;Expand&quot; to view full content
                          </span>
                        )}
                      </pre>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );

      case 4:
        return (
          <div className="flex flex-col items-center justify-center py-12 space-y-6">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <Rocket className="h-10 w-10 text-green-600 dark:text-green-400" />
            </div>
            <div className="text-center max-w-md">
              <h3 className="text-xl font-semibold">Ready to Launch!</h3>
              <p className="text-gray-500 dark:text-gray-400 mt-2">
                All files have been approved. Click below to create your project and start the
                Ralph Wiggum loop. The AI will begin building your software autonomously.
              </p>
            </div>
            <div className="flex gap-4">
              <Button variant="outline" onClick={() => setStep(3)}>
                Review Files Again
              </Button>
              <Button size="lg" onClick={handleLaunchLoop}>
                <Rocket className="mr-2 h-5 w-5" />
                Launch Loop
              </Button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return projectName.trim() && shortPrompt.trim();
      case 1:
        return prdContent && !isGenerating;
      case 2:
        return generatedFiles.length > 0 && !isGenerating;
      case 3:
        return allFilesApproved;
      default:
        return true;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create New Project</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Set up a new Ralph Wiggum project in 5 easy steps
        </p>
      </div>

      {/* Stepper */}
      <WizardStepper steps={steps} currentStep={currentStep} onStepClick={setStep} />

      {/* Content */}
      <Card>
        <CardContent className="pt-6">{renderStep()}</CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={currentStep === 0 ? () => router.push('/projects') : prevStep}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {currentStep === 0 ? 'Cancel' : 'Back'}
        </Button>

        {currentStep < 4 && currentStep !== 2 && (
          <Button
            onClick={currentStep === 0 ? handleGeneratePRD : currentStep === 1 ? handleApprovePRD : nextStep}
            disabled={!canProceed()}
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                {currentStep === 0 ? 'Generate PRD' : currentStep === 1 ? 'Approve & Continue' : 'Next'}
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
