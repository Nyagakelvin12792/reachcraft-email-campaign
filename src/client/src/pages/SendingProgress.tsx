import React, { useEffect, useState, useRef } from 'react';
import {
  Send,
  Pause,
  Play,
  XCircle,
  RotateCcw,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { api, ProgressResponse } from '../api/client.js';
import { Stepper } from '../components/Stepper.js';
import { StatusBadge } from '../components/StatusBadge.js';

interface SendingProgressProps {
  campaignId: string;
  onNavigate: (page: string, campaignId?: string) => void;
}

export const SendingProgress: React.FC<SendingProgressProps> = ({ campaignId, onNavigate }) => {
  const [data, setData] = useState<ProgressResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await api.getProgress(campaignId);
      setData(res);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch progress.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();

    // Poll every 2.5 seconds while actively sending
    pollTimerRef.current = setInterval(() => {
      fetchStatus();
    }, 2500);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [campaignId]);

  const handlePause = async () => {
    try {
      setActionLoading(true);
      await api.pauseCampaign(campaignId);
      await fetchStatus();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to pause.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResume = async () => {
    try {
      setActionLoading(true);
      await api.resumeCampaign(campaignId);
      await fetchStatus();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to resume.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!window.confirm('Are you sure you want to cancel remaining unsent emails? This cannot be undone.')) {
      return;
    }
    try {
      setActionLoading(true);
      await api.cancelCampaign(campaignId);
      await fetchStatus();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to cancel.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRetry = async () => {
    try {
      setActionLoading(true);
      const res = await api.retryFailed(campaignId);
      alert(res.message);
      await fetchStatus();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to retry.');
    } finally {
      setActionLoading(false);
    }
  };

  const metrics = data?.metrics;
  const isComplete = data?.campaignStatus === 'COMPLETED';
  const isPaused = data?.campaignStatus === 'PAUSED';
  const isCancelled = data?.campaignStatus === 'CANCELLED';
  const isFailed = data?.campaignStatus === 'FAILED';

  return (
    <div>
      <Stepper
        currentStep={5}
        onStepClick={(step) => {
          if (step <= 4) onNavigate('preview-approval', campaignId);
        }}
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 space-y-6">
        {/* Main Status Banner */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
            <div>
              <div className="flex items-center space-x-3">
                <h2 className="text-xl font-black text-slate-900">Step 5: Sending Progress</h2>
                <StatusBadge status={data?.campaignStatus || 'SENDING'} />
              </div>
              <p className="text-sm text-slate-500 mt-1">
                Campaign: <strong>{data?.campaignName}</strong>
              </p>
            </div>

            {/* Queue Control Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {isPaused ? (
                <button
                  type="button"
                  onClick={handleResume}
                  disabled={actionLoading}
                  className="inline-flex items-center px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5 mr-1.5" />
                  Resume Campaign
                </button>
              ) : !isComplete && !isCancelled && !isFailed ? (
                <button
                  type="button"
                  onClick={handlePause}
                  disabled={actionLoading}
                  className="inline-flex items-center px-3.5 py-1.5 rounded-lg text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 disabled:opacity-50"
                >
                  <Pause className="w-3.5 h-3.5 mr-1.5" />
                  Pause Campaign
                </button>
              ) : null}

              {!isComplete && !isCancelled && (
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={actionLoading}
                  className="inline-flex items-center px-3.5 py-1.5 rounded-lg text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 disabled:opacity-50"
                >
                  <XCircle className="w-3.5 h-3.5 mr-1.5" />
                  Cancel Remaining
                </button>
              )}

              {(metrics?.failed || 0) > 0 && (
                <button
                  type="button"
                  onClick={handleRetry}
                  disabled={actionLoading}
                  className="inline-flex items-center px-3.5 py-1.5 rounded-lg text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                  Retry Failed ({metrics?.failed})
                </button>
              )}

              {isComplete && (
                <button
                  type="button"
                  onClick={() => onNavigate('campaign-results', campaignId)}
                  className="inline-flex items-center px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs"
                >
                  <span>View Full Campaign Results</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </button>
              )}
            </div>
          </div>

          {error && (
            <div className="mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Progress Bar & ETA */}
          <div className="mt-6 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
              <span>Overall Completion</span>
              <span className="font-mono text-indigo-600">{metrics?.percentageComplete ?? 0}%</span>
            </div>

            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200">
              <div
                className="bg-indigo-600 h-full transition-all duration-500 rounded-full"
                style={{ width: `${metrics?.percentageComplete ?? 0}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
              <span className="flex items-center space-x-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>
                  {metrics?.estimatedSecondsRemaining
                    ? `Estimated time remaining: ~${metrics.estimatedSecondsRemaining}s`
                    : isComplete
                    ? 'Dispatch complete'
                    : 'Calculating...'}
                </span>
              </span>
              <span>Rate: Serialized with configured rate throttle</span>
            </div>
          </div>

          {/* Metric Counter Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mt-6">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-center">
              <p className="text-[10px] font-bold text-slate-500 uppercase">Total</p>
              <p className="text-xl font-black text-slate-900 mt-0.5">{metrics?.totalRecipients ?? 0}</p>
            </div>

            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-center">
              <p className="text-[10px] font-bold text-amber-700 uppercase">Queued</p>
              <p className="text-xl font-black text-amber-700 mt-0.5">{metrics?.queued ?? 0}</p>
            </div>

            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-center">
              <p className="text-[10px] font-bold text-blue-700 uppercase">Sending</p>
              <p className="text-xl font-black text-blue-700 mt-0.5">{metrics?.sending ?? 0}</p>
            </div>

            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-center">
              <p className="text-[10px] font-bold text-emerald-700 uppercase">Sent</p>
              <p className="text-xl font-black text-emerald-700 mt-0.5">{metrics?.sent ?? 0}</p>
            </div>

            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-center">
              <p className="text-[10px] font-bold text-rose-700 uppercase">Failed</p>
              <p className="text-xl font-black text-rose-700 mt-0.5">{metrics?.failed ?? 0}</p>
            </div>

            <div className="p-3 rounded-lg bg-purple-50 border border-purple-200 text-center">
              <p className="text-[10px] font-bold text-purple-700 uppercase">Skipped</p>
              <p className="text-xl font-black text-purple-700 mt-0.5">{metrics?.skipped ?? 0}</p>
            </div>
          </div>
        </div>

        {/* Live Delivery Attempt Activity Log */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Live Delivery Attempt Log (Masked)</h3>
            <span className="text-[11px] text-slate-400">All credentials and bodies strictly hidden</span>
          </div>

          <div className="divide-y divide-slate-100">
            {data?.recentAttempts && data.recentAttempts.length > 0 ? (
              data.recentAttempts.map((att) => (
                <div key={att.id} className="p-3 px-5 flex items-center justify-between text-xs hover:bg-slate-50">
                  <div className="flex items-center space-x-3">
                    <StatusBadge status={att.status} size="sm" />
                    <span className="font-mono text-slate-700">{att.maskedEmail}</span>
                    {att.smtpResponseCategory && (
                      <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">
                        {att.smtpResponseCategory}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-3 text-slate-500 text-[11px]">
                    {att.failureReason && (
                      <span className="text-rose-600 font-medium truncate max-w-xs" title={att.failureReason}>
                        {att.failureReason}
                      </span>
                    )}
                    <span>{new Date(att.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-xs text-slate-400">
                Waiting for background worker to process queue items...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
