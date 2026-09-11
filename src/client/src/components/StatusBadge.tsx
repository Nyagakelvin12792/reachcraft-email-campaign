import React from 'react';

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const s = status.toUpperCase();

  let colorClasses = 'bg-slate-100 text-slate-700 border-slate-200';

  if (s === 'READY') {
    colorClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200';
  } else if (s === 'SENT' || s === 'COMPLETED') {
    colorClasses = 'bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold';
  } else if (s === 'SENDING' || s === 'RUNNING') {
    colorClasses = 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse font-semibold';
  } else if (s === 'PAUSED') {
    colorClasses = 'bg-amber-50 text-amber-700 border-amber-200 font-medium';
  } else if (s === 'DUPLICATE') {
    colorClasses = 'bg-amber-100 text-amber-800 border-amber-300';
  } else if (s === 'MISSING_REQUIRED') {
    colorClasses = 'bg-orange-50 text-orange-700 border-orange-200';
  } else if (s === 'MISSING_EMAIL' || s === 'INVALID_EMAIL' || s === 'FAILED') {
    colorClasses = 'bg-rose-50 text-rose-700 border-rose-200 font-medium';
  } else if (s === 'SUPPRESSED') {
    colorClasses = 'bg-purple-50 text-purple-700 border-purple-200';
  } else if (s === 'EXCLUDED' || s === 'CANCELLED') {
    colorClasses = 'bg-slate-100 text-slate-500 border-slate-200 line-through';
  }

  const padding = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${padding} ${colorClasses}`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
};
