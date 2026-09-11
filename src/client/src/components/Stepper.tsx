import React from 'react';
import { Upload, Columns, FileEdit, Eye, Send, CheckCircle2 } from 'lucide-react';

interface StepperProps {
  currentStep: number; // 1 to 6
  onStepClick?: (step: number) => void;
}

const steps = [
  { step: 1, title: 'Upload Spreadsheet', icon: Upload },
  { step: 2, title: 'Map Columns', icon: Columns },
  { step: 3, title: 'Email Template', icon: FileEdit },
  { step: 4, title: 'Preview & Approval', icon: Eye },
  { step: 5, title: 'Sending Progress', icon: Send },
  { step: 6, title: 'Campaign Results', icon: CheckCircle2 },
];

export const Stepper: React.FC<StepperProps> = ({ currentStep, onStepClick }) => {
  return (
    <div className="w-full bg-white border-b border-slate-200 py-3.5 px-4 sm:px-6 mb-6">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        {steps.map((s, idx) => {
          const Icon = s.icon;
          const isCompleted = currentStep > s.step;
          const isCurrent = currentStep === s.step;
          const isUpcoming = currentStep < s.step;

          return (
            <React.Fragment key={s.step}>
              <div
                onClick={() => {
                  // Only allow clicking to previous completed steps
                  if (isCompleted && onStepClick) {
                    onStepClick(s.step);
                  }
                }}
                className={`flex items-center space-x-2.5 ${
                  isCompleted ? 'cursor-pointer group' : ''
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
                  <p className="text-[10px] text-slate-400">Step {s.step} of 6</p>
                </div>
              </div>

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
