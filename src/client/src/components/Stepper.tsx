import React from 'react';
import { Upload, Columns, FileEdit, Eye, Send, CheckCircle2 } from 'lucide-react';

interface StepperProps {
  currentStep: number; // 1 to 6
  onStepClick?: (step: number) => void;
}

const steps = [
  { step: 1, title: 'Add contacts', icon: Upload },
  { step: 2, title: 'Check columns', icon: Columns },
  { step: 3, title: 'Write email', icon: FileEdit },
  { step: 4, title: 'Review and approve', icon: Eye },
  { step: 5, title: 'Send', icon: Send },
  { step: 6, title: 'Results', icon: CheckCircle2 },
];

export const Stepper: React.FC<StepperProps> = ({ currentStep, onStepClick }) => {
  const current = steps.find((step) => step.step === currentStep) || steps[0];
  const progress = Math.round((currentStep / steps.length) * 100);

  return (
    <div className="w-full bg-white border-b border-slate-200 px-4 sm:px-6 mb-6">
      <div className="max-w-6xl mx-auto py-3 sm:hidden">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Step {currentStep} of {steps.length}</p>
            <p className="text-sm font-bold text-slate-900 mt-0.5">{current.title}</p>
          </div>
          <span className="text-xs font-semibold text-slate-500">{progress}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-100 mt-2.5 overflow-hidden" aria-hidden="true">
          <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="max-w-6xl mx-auto py-3.5 hidden sm:flex items-center justify-between">
        {steps.map((s, idx) => {
          const Icon = s.icon;
          const isCompleted = currentStep > s.step;
          const isCurrent = currentStep === s.step;

          return (
            <React.Fragment key={s.step}>
              <button
                type="button"
                onClick={() => {
                  if (isCompleted && onStepClick) {
                    onStepClick(s.step);
                  }
                }}
                disabled={!isCompleted || !onStepClick}
                aria-current={isCurrent ? 'step' : undefined}
                aria-label={`${s.title}, step ${s.step} of ${steps.length}${isCompleted ? ', completed' : ''}`}
                className={`flex items-center space-x-2.5 ${
                  isCompleted && onStepClick ? 'cursor-pointer group' : 'cursor-default'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    isCurrent
                      ? 'bg-indigo-600 text-white ring-4 ring-indigo-50 shadow'
                      : isCompleted
                      ? 'bg-emerald-600 text-white group-hover:bg-emerald-700'
                      : 'bg-slate-100 text-slate-400 border border-slate-200'
                  }`}
                >
                  {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : s.step}
                </div>
                <div className="hidden lg:block text-left">
                  <p
                    className={`text-xs font-semibold leading-tight ${
                      isCurrent
                        ? 'text-indigo-600'
                        : isCompleted
                        ? 'text-slate-800'
                        : 'text-slate-400'
                    }`}
                  >
                    {s.title}
                  </p>
                  <p className="text-[10px] text-slate-400">Step {s.step} of {steps.length}</p>
                </div>
              </button>

              {idx < steps.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-3 hidden sm:block ${
                    isCompleted ? 'bg-emerald-500' : 'bg-slate-200'
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
