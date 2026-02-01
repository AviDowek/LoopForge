'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Step {
  id: number;
  title: string;
  description: string;
}

interface WizardStepperProps {
  steps: Step[];
  currentStep: number;
  onStepClick?: (step: number) => void;
}

export function WizardStepper({ steps, currentStep, onStepClick }: WizardStepperProps) {
  return (
    <nav aria-label="Progress" className="w-full">
      <ol className="flex items-center">
        {steps.map((step, index) => {
          const isCompleted = step.id < currentStep;
          const isCurrent = step.id === currentStep;
          const isClickable = onStepClick && step.id <= currentStep;

          return (
            <li
              key={step.id}
              className={cn('relative flex-1', index !== steps.length - 1 && 'pr-8 sm:pr-20')}
            >
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => isClickable && onStepClick(step.id)}
                  disabled={!isClickable}
                  className={cn(
                    'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors',
                    isCompleted && 'bg-gray-900 dark:bg-gray-50',
                    isCurrent && 'border-2 border-gray-900 bg-white dark:border-gray-50 dark:bg-gray-950',
                    !isCompleted && !isCurrent && 'border-2 border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-950',
                    isClickable && 'cursor-pointer hover:opacity-80'
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-5 w-5 text-white dark:text-gray-900" />
                  ) : (
                    <span
                      className={cn(
                        'text-sm font-medium',
                        isCurrent ? 'text-gray-900 dark:text-gray-50' : 'text-gray-500 dark:text-gray-400'
                      )}
                    >
                      {step.id + 1}
                    </span>
                  )}
                </button>

                {/* Connector line */}
                {index !== steps.length - 1 && (
                  <div
                    className={cn(
                      'absolute left-10 top-5 hidden h-0.5 w-full -translate-y-1/2 sm:block',
                      isCompleted ? 'bg-gray-900 dark:bg-gray-50' : 'bg-gray-300 dark:bg-gray-700'
                    )}
                    style={{ width: 'calc(100% - 2.5rem - 1rem)' }}
                  />
                )}
              </div>

              {/* Step label */}
              <div className="mt-3 min-w-0">
                <span
                  className={cn(
                    'text-sm font-medium',
                    isCurrent ? 'text-gray-900 dark:text-gray-50' : 'text-gray-500 dark:text-gray-400'
                  )}
                >
                  {step.title}
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">
                  {step.description}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
